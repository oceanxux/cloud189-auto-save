const path = require('path');
const ConfigService = require('./ConfigService');
const { Cloud189Service } = require('./cloud189');
const { StrmService } = require('./strm');
const { TMDBService } = require('./tmdb');
const AIService = require('./ai');
const { logTaskEvent } = require('../utils/logUtils');

class OrganizerService {
    constructor(taskService, taskRepo = null) {
        this.taskService = taskService || null;
        this.taskRepo = taskRepo || (taskService && taskService.taskRepo) || null;
        this.tmdbService = new TMDBService();
    }

    async organizeTaskById(taskId, options = {}) {
        const task = await this.taskService.getTaskById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }
        return await this.organizeTask(task, options);
    }

    async organizeTask(task, options = {}) {
        const {
            triggerStrm = false
        } = options;

        if (!task.account) {
            const account = await this.taskService._getAccountById(task.accountId);
            if (!account) {
                throw new Error('账号不存在');
            }
            task.account = account;
        }
        if (!task.enableOrganizer && !options.force) {
            return {
                message: `任务[${task.resourceName}]未启用整理器，跳过`,
                files: await this.taskService.getFilesByTask(task)
            };
        }
        if (task.enableLazyStrm) {
            throw new Error('懒转存STRM任务暂不支持整理器');
        }

        const cloud189 = Cloud189Service.getInstance(task.account);
        const allFiles = (await this.taskService.getFilesByTask(task)).filter(file => !file.isFolder);
        if (!allFiles.length) {
            throw new Error('当前任务目录没有可整理的文件');
        }

        logTaskEvent(`任务[${task.resourceName}]开始执行整理器`);
        const tmdbInfo = await this._resolveTmdbInfo(task, null);
        const resourceInfo = await this._resolveResourceInfo(task, allFiles, tmdbInfo);
        const libraryInfo = this._resolveLibraryInfo(task, resourceInfo, tmdbInfo);
        const organizerRoot = this._resolveOrganizerRoot(task, options);
        const baseFolderPath = organizerRoot.path;
        const categoryCache = new Map();
        const resourceFolderPath = this._joinPosix(baseFolderPath, libraryInfo.categoryName, libraryInfo.resourceFolderName);
        const categoryFolderId = await this._ensureFolderByName(cloud189, organizerRoot.id, libraryInfo.categoryName, categoryCache);
        const resourceFolderId = await this._ensureFolderByName(cloud189, categoryFolderId, libraryInfo.resourceFolderName, categoryCache);

        const originalFolderId = String(task.realFolderId);
        const originalRootFolderId = String(task.realRootFolderId || task.realFolderId || '');
        const originalFolderName = this._normalizePath(task.realFolderName || '');
        const messages = [];
        const targetSummary = `${libraryInfo.categoryName}/${libraryInfo.resourceFolderName}`;
        if (originalFolderName !== resourceFolderPath) {
            messages.push(`├─ 媒体库归档 ${targetSummary}`);
        }

        const nestedFolderCache = new Map();
        const folderFileCache = new Map();
        const fileMap = new Map((resourceInfo.episode || []).map(item => [String(item.id), item]));

        for (const file of allFiles) {
            const aiFile = fileMap.get(String(file.id));
            if (!aiFile) {
                continue;
            }

            const template = resourceInfo.type === 'movie'
                ? ConfigService.getConfigValue('openai.rename.movieTemplate') || '{name} ({year}){ext}'
                : ConfigService.getConfigValue('openai.rename.template') || '{name} - {se}{ext}';
            const targetFileName = this.taskService._generateFileName(file, aiFile, resourceInfo, template);
            const targetRelativeDir = this._buildTargetRelativeDir(file, aiFile, resourceInfo, libraryInfo);
            const targetFolderId = await this._ensureDirectoryPath(cloud189, resourceFolderId, targetRelativeDir, nestedFolderCache);
            const currentFolderId = String(file.parentFolderId || originalFolderId);

            if (file.name !== targetFileName) {
                const conflictFile = await this._findConflictFile(cloud189, currentFolderId, file.id, targetFileName, folderFileCache);
                if (conflictFile) {
                    const conflictType = this._getConflictType(file, conflictFile);
                    const conflictMessage = conflictType === 'same-md5'
                        ? `├─ 文件已存在（MD5一致），跳过 ${file.name} -> ${targetFileName}`
                        : conflictType === 'same-size'
                            ? `├─ 文件同名且大小一致（疑似重复），跳过 ${file.name} -> ${targetFileName}`
                            : `├─ 文件同名但内容不同，跳过 ${file.name} -> ${targetFileName}`;
                    messages.push(conflictMessage);
                    continue;
                } else {
                    const renameResult = await cloud189.renameFile(file.id, targetFileName);
                    if (!renameResult || (renameResult.res_code && renameResult.res_code !== 0)) {
                        throw new Error(`重命名失败: ${file.name} -> ${targetFileName}`);
                    }
                    this._updateFolderFileCacheAfterRename(folderFileCache, currentFolderId, file.name, {
                        ...file,
                        name: targetFileName,
                        parentFolderId: currentFolderId
                    });
                    messages.push(`├─ 重命名 ${file.name} -> ${targetFileName}`);
                    file.name = targetFileName;
                }
            }

            if (currentFolderId !== String(targetFolderId)) {
                await this.taskService.moveCloudFile(cloud189, {
                    id: file.id,
                    name: file.name,
                    isFolder: false
                }, targetFolderId);
                this._updateFolderFileCacheAfterMove(folderFileCache, currentFolderId, String(targetFolderId), file);
                messages.push(`├─ 移动 ${file.name} -> ${targetRelativeDir || '媒体根目录'}`);
                file.parentFolderId = String(targetFolderId);
                file.relativeDir = targetRelativeDir;
                file.relativePath = targetRelativeDir ? `${targetRelativeDir}/${file.name}` : file.name;
            }
        }

        const taskUpdates = {
            lastOrganizedAt: new Date(),
            lastOrganizeError: ''
        };

        if (String(originalFolderId) !== String(resourceFolderId) || originalFolderName !== resourceFolderPath) {
            taskUpdates.realFolderId = String(resourceFolderId);
            taskUpdates.realRootFolderId = String(categoryFolderId);
            taskUpdates.realFolderName = resourceFolderPath;
            task.realFolderId = String(resourceFolderId);
            task.realRootFolderId = String(categoryFolderId);
            task.realFolderName = resourceFolderPath;

            if (ConfigService.getConfigValue('strm.enable') && originalFolderName && originalFolderName !== resourceFolderPath) {
                const oldStrmPath = this._getTaskRelativeRootPath(originalFolderName);
                if (oldStrmPath) {
                    await new StrmService().deleteDir(path.join(task.account.localStrmPrefix, oldStrmPath));
                }
            }
        }

        if (tmdbInfo?.id && (!task.tmdbId || String(task.tmdbId) !== String(tmdbInfo.id))) {
            taskUpdates.tmdbId = String(tmdbInfo.id);
            task.tmdbId = String(tmdbInfo.id);
        }
        if (tmdbInfo) {
            taskUpdates.tmdbContent = JSON.stringify(tmdbInfo);
            task.tmdbContent = taskUpdates.tmdbContent;
        }
        const resolvedTotalEpisodes = this._resolveTotalEpisodes(tmdbInfo);
        if (resolvedTotalEpisodes > 0 && Number(task.totalEpisodes || 0) !== resolvedTotalEpisodes) {
            taskUpdates.totalEpisodes = resolvedTotalEpisodes;
            task.totalEpisodes = resolvedTotalEpisodes;
        }

        await this.taskRepo.update(task.id, taskUpdates);

        await this._cleanupStagingFolders(cloud189, originalFolderId, originalRootFolderId, String(task.targetFolderId || ''));

        const refreshedFiles = await this.taskService.getFilesByTask(task);

        let strmMessage = '';
        if (triggerStrm && ConfigService.getConfigValue('strm.enable')) {
            const strmService = new StrmService();
            strmMessage = await strmService.generate(task, refreshedFiles, false, true);
        }

        if (messages.length > 0) {
            messages[messages.length - 1] = messages[messages.length - 1].replace(/^├─/, '└─');
            logTaskEvent(`${task.resourceName}整理完成(${targetSummary}):\n${messages.join('\n')}`);
        } else {
            logTaskEvent(`${task.resourceName}整理完成，无需调整`);
        }

        return {
            message: strmMessage || `${task.resourceName}整理完成，已归档到 ${targetSummary}`,
            files: refreshedFiles,
            operations: messages,
            libraryInfo
        };
    }

    async organizeLooseGroup(params = {}) {
        const {
            account,
            organizerRootId,
            organizerRootPath = '',
            sourceFolderPath = '',
            resourceName = '',
            files = []
        } = params;

        if (!account?.id) {
            throw new Error('账号不存在');
        }
        const mediaFiles = Array.isArray(files) ? files.filter(file => file && !file.isFolder) : [];
        if (mediaFiles.length === 0) {
            throw new Error('当前目录没有可整理的媒体文件');
        }

        const cloud189 = Cloud189Service.getInstance(account);
        const taskLike = {
            account,
            accountId: account.id,
            resourceName: String(resourceName || '').trim() || path.posix.basename(this._normalizePath(sourceFolderPath || '')) || '未命名资源',
            shareFolderName: '',
            targetFolderId: String(organizerRootId || '').trim(),
            targetFolderName: this._normalizePath(organizerRootPath || ''),
            organizerTargetFolderId: String(organizerRootId || '').trim(),
            organizerTargetFolderName: this._normalizePath(organizerRootPath || ''),
            realFolderId: String(mediaFiles[0]?.parentFolderId || '').trim(),
            realRootFolderId: String(mediaFiles[0]?.parentFolderId || '').trim(),
            realFolderName: this._normalizePath(sourceFolderPath || ''),
            tmdbId: '',
            tmdbContent: '',
            currentEpisodes: mediaFiles.length,
            totalEpisodes: 0,
            enableOrganizer: true,
            enableLazyStrm: false
        };

        logTaskEvent(`目录[${taskLike.realFolderName || taskLike.resourceName}]开始执行无任务整理工作流`);
        const tmdbInfo = await this._resolveTmdbInfo(taskLike, null);
        const resourceInfo = await this._resolveResourceInfo(taskLike, mediaFiles, tmdbInfo);
        const libraryInfo = this._resolveLibraryInfo(taskLike, resourceInfo, tmdbInfo);
        const organizerRoot = {
            id: String(organizerRootId || '').trim(),
            path: this._normalizePath(organizerRootPath || '')
        };
        if (!organizerRoot.id) {
            throw new Error('默认整理根目录未配置');
        }

        const categoryCache = new Map();
        const nestedFolderCache = new Map();
        const folderFileCache = new Map();
        const messages = [];
        const targetSummary = `${libraryInfo.categoryName}/${libraryInfo.resourceFolderName}`;
        messages.push(`├─ 媒体库归档 ${targetSummary}`);

        const categoryFolderId = await this._ensureFolderByName(cloud189, organizerRoot.id, libraryInfo.categoryName, categoryCache);
        const resourceFolderId = await this._ensureFolderByName(cloud189, categoryFolderId, libraryInfo.resourceFolderName, categoryCache);
        const fileMap = new Map((resourceInfo.episode || []).map(item => [String(item.id), item]));

        for (const file of mediaFiles) {
            const aiFile = fileMap.get(String(file.id));
            if (!aiFile) {
                continue;
            }

            const template = resourceInfo.type === 'movie'
                ? ConfigService.getConfigValue('openai.rename.movieTemplate') || '{name} ({year}){ext}'
                : ConfigService.getConfigValue('openai.rename.template') || '{name} - {se}{ext}';
            const targetFileName = this.taskService._generateFileName(file, aiFile, resourceInfo, template);
            const targetRelativeDir = this._buildTargetRelativeDir(file, aiFile, resourceInfo, libraryInfo);
            const targetFolderId = await this._ensureDirectoryPath(cloud189, resourceFolderId, targetRelativeDir, nestedFolderCache);
            const currentFolderId = String(file.parentFolderId || '');

            if (file.name !== targetFileName) {
                const conflictFile = await this._findConflictFile(cloud189, currentFolderId, file.id, targetFileName, folderFileCache);
                if (conflictFile) {
                    const conflictType = this._getConflictType(file, conflictFile);
                    const conflictMessage = conflictType === 'same-md5'
                        ? `├─ 文件已存在（MD5一致），跳过 ${file.name} -> ${targetFileName}`
                        : conflictType === 'same-size'
                            ? `├─ 文件同名且大小一致（疑似重复），跳过 ${file.name} -> ${targetFileName}`
                            : `├─ 文件同名但内容不同，跳过 ${file.name} -> ${targetFileName}`;
                    messages.push(conflictMessage);
                    continue;
                }
                const renameResult = await cloud189.renameFile(file.id, targetFileName);
                if (!renameResult || (renameResult.res_code && renameResult.res_code !== 0)) {
                    throw new Error(`重命名失败: ${file.name} -> ${targetFileName}`);
                }
                this._updateFolderFileCacheAfterRename(folderFileCache, currentFolderId, file.name, {
                    ...file,
                    name: targetFileName,
                    parentFolderId: currentFolderId
                });
                messages.push(`├─ 重命名 ${file.name} -> ${targetFileName}`);
                file.name = targetFileName;
            }

            if (currentFolderId !== String(targetFolderId)) {
                await this.taskService.moveCloudFile(cloud189, {
                    id: file.id,
                    name: file.name,
                    isFolder: false
                }, targetFolderId);
                this._updateFolderFileCacheAfterMove(folderFileCache, currentFolderId, String(targetFolderId), file);
                messages.push(`├─ 移动 ${file.name} -> ${targetRelativeDir || '媒体根目录'}`);
                file.parentFolderId = String(targetFolderId);
                file.relativeDir = targetRelativeDir;
                file.relativePath = targetRelativeDir ? `${targetRelativeDir}/${file.name}` : file.name;
            }
        }

        if (messages.length > 0) {
            messages[messages.length - 1] = messages[messages.length - 1].replace(/^├─/, '└─');
            logTaskEvent(`目录[${taskLike.realFolderName || taskLike.resourceName}]整理完成(${targetSummary}):\n${messages.join('\n')}`);
        }

        return {
            message: `${taskLike.resourceName}整理完成，已归档到 ${targetSummary}`,
            operations: messages,
            libraryInfo,
            tmdbInfo
        };
    }

    async _resolveResourceInfo(task, allFiles, tmdbInfo = null) {
        const fallbackResourceInfo = this._buildFallbackResourceInfo(task, allFiles, tmdbInfo);
        const aiMode = this._getAiMode();

        if (aiMode === 'advanced') {
            logTaskEvent(`整理器启用 AI 高级模式，开始分析资源信息`);
            try {
                const analyzed = await this.taskService._analyzeResourceInfo(
                    task.resourceName,
                    allFiles.map(file => ({ id: file.id, name: file.name })),
                    'file'
                );
                return this._normalizeResourceInfo(analyzed, task, tmdbInfo, allFiles);
            } catch (error) {
                logTaskEvent(`整理器 AI 解析失败，已切换到 TMDB 顺序编号回退: ${error.message}`);
            }
        }

        if (aiMode === 'fallback' && this._shouldUseAiFallback(task, allFiles, tmdbInfo, fallbackResourceInfo)) {
            logTaskEvent(`整理器 TMDB 信息不足，尝试使用 AI 兜底`);
            try {
                const analyzed = await this.taskService._analyzeResourceInfo(
                    task.resourceName,
                    allFiles.map(file => ({ id: file.id, name: file.name })),
                    'file'
                );
                return this._normalizeResourceInfo(analyzed, task, tmdbInfo, allFiles);
            } catch (error) {
                logTaskEvent(`整理器 AI 兜底失败，保留 TMDB 顺序编号结果: ${error.message}`);
            }
        }

        return fallbackResourceInfo;
    }

    async markError(taskId, error) {
        if (!this.taskRepo) {
            return;
        }
        await this.taskRepo.update(taskId, {
            lastOrganizeError: error.message,
            lastOrganizedAt: new Date()
        });
    }

    async _resolveTmdbInfo(task, resourceInfo) {
        const cachedTmdb = this._parseTaskTmdbContent(task.tmdbContent);
        if (cachedTmdb?.id && cachedTmdb?.type) {
            return cachedTmdb;
        }

        const apiKey = ConfigService.getConfigValue('tmdb.tmdbApiKey') || ConfigService.getConfigValue('tmdb.apiKey');
        if (!apiKey) {
            return cachedTmdb || null;
        }

        const preferredType = this._resolvePreferredMediaType(resourceInfo, cachedTmdb);
        if (task.tmdbId) {
            const details = await this._fetchTmdbDetailsById(task.tmdbId, preferredType);
            if (details) {
                return details;
            }
        }

        const title = this._sanitizeTitle(resourceInfo?.name || task.resourceName || '');
        const year = resourceInfo?.year || this._extractYear(task.resourceName) || '';
        if (!title) {
            return cachedTmdb || null;
        }

        try {
            if (preferredType === 'movie') {
                return await this.tmdbService.searchMovie(title, year);
            }
            if (preferredType === 'tv') {
                return await this.tmdbService.searchTV(title, year, task.currentEpisodes || 0);
            }

            const tvDetails = await this.tmdbService.searchTV(title, year, task.currentEpisodes || 0);
            if (tvDetails) {
                return tvDetails;
            }
            return await this.tmdbService.searchMovie(title, year);
        } catch (error) {
            logTaskEvent(`TMDB分类信息获取失败，已回退AI结果: ${error.message}`);
            return cachedTmdb || null;
        }
    }

    _normalizeResourceInfo(resourceInfo, task, tmdbInfo = null, allFiles = []) {
        const mediaType = this._resolvePreferredMediaType(resourceInfo, tmdbInfo) || (allFiles.length > 1 ? 'tv' : 'movie');
        const preferredTitle = this._sanitizePathSegment(
            tmdbInfo?.title
            || resourceInfo?.name
            || this._sanitizeTitle(task.resourceName)
            || task.resourceName
        );
        const year = Number(this._extractYear(tmdbInfo?.releaseDate) || resourceInfo?.year || this._extractYear(task.resourceName) || 0);
        const fallbackEpisodes = this._buildFallbackEpisodeEntries(allFiles, mediaType, preferredTitle);
        const aiEpisodes = Array.isArray(resourceInfo?.episode) ? resourceInfo.episode : [];
        const fallbackEpisodeMap = new Map(fallbackEpisodes.map(item => [String(item.id), item]));
        const normalizedEpisodes = aiEpisodes.length > 0
            ? aiEpisodes.map(item => {
                const fallbackEpisode = fallbackEpisodeMap.get(String(item.id)) || {};
                return {
                    ...fallbackEpisode,
                    ...item,
                    id: String(item.id),
                    name: preferredTitle,
                    season: String(item.season || fallbackEpisode.season || '01').padStart(2, '0'),
                    episode: String(item.episode || fallbackEpisode.episode || '01').padStart(2, '0'),
                    extension: item.extension || fallbackEpisode.extension || ''
                };
            })
            : fallbackEpisodes;

        return {
            ...resourceInfo,
            name: preferredTitle,
            year,
            type: mediaType,
            episode: normalizedEpisodes
        };
    }

    _buildFallbackResourceInfo(task, allFiles, tmdbInfo = null) {
        const mediaType = tmdbInfo?.type || (allFiles.length > 1 ? 'tv' : 'movie');
        const preferredTitle = this._sanitizePathSegment(
            tmdbInfo?.title
            || this._sanitizeTitle(task.resourceName)
            || task.resourceName
        );
        const year = Number(this._extractYear(tmdbInfo?.releaseDate) || this._extractYear(task.resourceName) || 0);

        return {
            name: preferredTitle,
            year,
            type: mediaType,
            season: '01',
            episode: this._buildFallbackEpisodeEntries(allFiles, mediaType, preferredTitle)
        };
    }

    _buildFallbackEpisodeEntries(allFiles, mediaType, preferredTitle) {
        const sortedFiles = [...allFiles].sort((left, right) => {
            const leftPath = String(left.relativePath || left.name || '');
            const rightPath = String(right.relativePath || right.name || '');
            return leftPath.localeCompare(rightPath, 'zh-CN', { numeric: true, sensitivity: 'base' });
        });

        let fallbackEpisodeNumber = 1;
        return sortedFiles.map(file => {
            const episode = mediaType === 'movie'
                ? '01'
                : String(fallbackEpisodeNumber++).padStart(2, '0');
            return {
                id: String(file.id),
                name: preferredTitle,
                season: '01',
                episode,
                extension: path.extname(file.name) || ''
            };
        });
    }

    _resolveTotalEpisodes(tmdbInfo = null) {
        const totalEpisodes = Number(tmdbInfo?.totalEpisodes || 0);
        if (totalEpisodes > 0) {
            return totalEpisodes;
        }
        const endedEpisodes = Number(tmdbInfo?.lastEpisodeToAir?.episode_number || 0);
        if (endedEpisodes > 0 && String(tmdbInfo?.status || '').toLowerCase() === 'ended') {
            return endedEpisodes;
        }
        return 0;
    }

    async _fetchTmdbDetailsById(tmdbId, preferredType = '') {
        const typeOrder = preferredType === 'movie'
            ? ['movie', 'tv']
            : preferredType === 'tv'
                ? ['tv', 'movie']
                : ['tv', 'movie'];

        for (const type of typeOrder) {
            const detail = type === 'movie'
                ? await this.tmdbService.getMovieDetails(tmdbId)
                : await this.tmdbService.getTVDetails(tmdbId);
            if (detail?.id) {
                return detail;
            }
        }
        return null;
    }

    _resolveLibraryInfo(task, resourceInfo, tmdbInfo) {
        const mediaType = this._resolvePreferredMediaType(resourceInfo, tmdbInfo);
        const year = this._extractYear(tmdbInfo?.releaseDate) || resourceInfo?.year || this._extractYear(task.resourceName) || '';
        const canonicalTitle = this._sanitizePathSegment(
            tmdbInfo?.title
            || resourceInfo?.name
            || this._sanitizeTitle(task.resourceName)
            || task.resourceName
        );
        const categoryName = this._resolveCategoryName(mediaType, tmdbInfo);
        const resourceFolderName = year ? `${canonicalTitle} (${year})` : canonicalTitle;
        const seasonBased = mediaType !== 'movie';

        return {
            mediaType,
            isAnime: categoryName === this._getCategoryMap().anime,
            categoryName,
            canonicalTitle,
            year: year ? String(year) : '',
            resourceFolderName,
            seasonBased
        };
    }

    _resolvePreferredMediaType(resourceInfo, tmdbInfo) {
        return tmdbInfo?.type || resourceInfo?.type || 'tv';
    }

    _resolveCategoryName(mediaType, tmdbInfo) {
        const categories = this._getCategoryMap();
        const genreIds = Array.isArray(tmdbInfo?.genres)
            ? tmdbInfo.genres.map(item => Number(item.id)).filter(Number.isFinite)
            : [];

        if (mediaType === 'movie') {
            return genreIds.includes(99) ? categories.documentary : categories.movie;
        }
        if (genreIds.includes(16)) {
            return categories.anime;
        }
        if (genreIds.includes(99)) {
            return categories.documentary;
        }
        if (genreIds.includes(10764) || genreIds.includes(10767)) {
            return categories.variety;
        }
        return categories.tv;
    }

    _buildTargetRelativeDir(file, aiFile, resourceInfo, libraryInfo) {
        if (!libraryInfo.seasonBased) {
            return '';
        }
        const seasonDir = this.taskService.buildOrganizerDirectoryName(aiFile, resourceInfo);
        if (seasonDir) {
            return seasonDir;
        }

        const relativeDir = this._normalizePath(file.relativeDir || '');
        const normalizedParts = relativeDir ? relativeDir.split('/').filter(Boolean) : [];
        const seasonPart = normalizedParts.find(part => /^(season\s*\d+|s\d+|specials?)$/i.test(part));
        if (seasonPart) {
            return seasonPart;
        }
        return 'Season 01';
    }

    async _ensureDirectoryPath(cloud189, rootFolderId, relativeDir, folderCache = new Map()) {
        const normalizedRelativeDir = this._normalizePath(relativeDir);
        if (!normalizedRelativeDir) {
            return String(rootFolderId);
        }

        let currentParentId = String(rootFolderId);
        const segments = normalizedRelativeDir.split('/').filter(Boolean);

        for (const segment of segments) {
            const cacheKey = `${currentParentId}:${segment}`;
            if (folderCache.has(cacheKey)) {
                currentParentId = folderCache.get(cacheKey);
                continue;
            }
            const nextFolderId = await this._ensureFolderByName(cloud189, currentParentId, segment, folderCache);
            currentParentId = nextFolderId;
        }

        return currentParentId;
    }

    async _ensureFolderByName(cloud189, parentFolderId, folderName, folderCache = new Map()) {
        const safeFolderName = this._sanitizePathSegment(folderName);
        const cacheKey = `${String(parentFolderId)}:${safeFolderName}`;
        if (folderCache.has(cacheKey)) {
            return folderCache.get(cacheKey);
        }

        const folderInfo = await cloud189.listFiles(parentFolderId);
        const folderList = folderInfo?.fileListAO?.folderList || [];
        let folder = folderList.find(item => item.name === safeFolderName);
        if (!folder) {
            folder = await cloud189.createFolder(safeFolderName, parentFolderId);
            if (!folder?.id) {
                throw new Error(`创建整理目录失败: ${safeFolderName}`);
            }
        }

        const folderId = String(folder.id);
        folderCache.set(cacheKey, folderId);
        return folderId;
    }

    async _findConflictFile(cloud189, folderId, currentFileId, targetFileName, folderFileCache = new Map()) {
        const cacheKey = String(folderId);
        let fileMap = folderFileCache.get(cacheKey);
        if (!fileMap) {
            const folderInfo = await cloud189.listFiles(folderId);
            const files = folderInfo?.fileListAO?.fileList || [];
            fileMap = new Map(files.map(item => [item.name, item]));
            folderFileCache.set(cacheKey, fileMap);
        }

        const conflictFile = fileMap.get(targetFileName);
        if (!conflictFile) {
            return null;
        }
        return String(conflictFile.id) === String(currentFileId) ? null : conflictFile;
    }

    _getConflictType(sourceFile, targetFile) {
        const sourceMd5 = String(sourceFile?.md5 || '').trim().toLowerCase();
        const targetMd5 = String(targetFile?.md5 || '').trim().toLowerCase();
        if (sourceMd5 && targetMd5 && sourceMd5 === targetMd5) {
            return 'same-md5';
        }

        const sourceSize = Number(sourceFile?.size || sourceFile?.fileSize || 0);
        const targetSize = Number(targetFile?.size || targetFile?.fileSize || 0);
        if (sourceSize > 0 && targetSize > 0 && sourceSize === targetSize) {
            return 'same-size';
        }

        return 'different';
    }

    _updateFolderFileCacheAfterRename(folderFileCache, folderId, oldName, nextFile) {
        const fileMap = folderFileCache.get(String(folderId));
        if (!fileMap) {
            return;
        }
        fileMap.delete(oldName);
        fileMap.set(nextFile.name, nextFile);
    }

    _updateFolderFileCacheAfterMove(folderFileCache, sourceFolderId, targetFolderId, file) {
        const sourceMap = folderFileCache.get(String(sourceFolderId));
        if (sourceMap) {
            sourceMap.delete(file.name);
        }
        const targetMap = folderFileCache.get(String(targetFolderId));
        if (targetMap) {
            targetMap.set(file.name, {
                ...file,
                parentFolderId: String(targetFolderId)
            });
        }
    }

    async _cleanupStagingFolders(cloud189, originalFolderId, originalRootFolderId, targetFolderId) {
        const cleanupCandidates = Array.from(new Set(
            [originalFolderId, originalRootFolderId]
                .map(id => String(id || '').trim())
                .filter(Boolean)
                .filter(id => id !== String(targetFolderId || '').trim())
        ));

        for (const folderId of cleanupCandidates) {
            await this._cleanupEmptyFolderTree(cloud189, folderId, String(targetFolderId || '').trim());
        }
    }

    async _cleanupEmptyFolderTree(cloud189, folderId, stopFolderId = '') {
        const normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId || normalizedFolderId === stopFolderId) {
            return false;
        }

        const folderInfo = await cloud189.listFiles(normalizedFolderId);
        const fileListAO = folderInfo?.fileListAO;
        if (!fileListAO) {
            return false;
        }

        const childFolders = Array.isArray(fileListAO.folderList) ? fileListAO.folderList : [];
        for (const folder of childFolders) {
            await this._cleanupEmptyFolderTree(cloud189, folder.id, stopFolderId);
        }

        const refreshedInfo = await cloud189.listFiles(normalizedFolderId);
        const refreshedFileListAO = refreshedInfo?.fileListAO;
        if (!refreshedFileListAO) {
            return false;
        }
        const fileCount = Array.isArray(refreshedFileListAO.fileList) ? refreshedFileListAO.fileList.length : 0;
        const folderCount = Array.isArray(refreshedFileListAO.folderList) ? refreshedFileListAO.folderList.length : 0;
        if (fileCount === 0 && folderCount === 0) {
            await this.taskService.deleteCloudFile(cloud189, { id: normalizedFolderId, name: '' }, 1);
            return true;
        }
        return false;
    }

    _resolveOrganizerRoot(task, options = {}) {
        const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
        const configuredOrganizerFolderId = String(autoCreateConfig.organizerTargetFolderId || '').trim();
        const configuredOrganizerFolderPath = this._normalizePath(autoCreateConfig.organizerTargetFolderName || '');
        const currentOrganizerFolderId = String(task.organizerTargetFolderId || '').trim();
        const currentOrganizerFolderPath = this._normalizePath(task.organizerTargetFolderName || '');
        const targetFolderId = String(task.targetFolderId || '').trim();
        const targetFolderPath = this._normalizePath(task.targetFolderName || '');

        const shouldUseConfiguredOrganizerRoot = Boolean(
            configuredOrganizerFolderId &&
            options.force &&
            !task.enableOrganizer &&
            (!currentOrganizerFolderId || currentOrganizerFolderId === targetFolderId) &&
            (!currentOrganizerFolderPath || currentOrganizerFolderPath === targetFolderPath)
        );

        const organizerFolderId = shouldUseConfiguredOrganizerRoot
            ? configuredOrganizerFolderId
            : String(currentOrganizerFolderId || targetFolderId || '').trim();
        const organizerFolderPath = shouldUseConfiguredOrganizerRoot
            ? configuredOrganizerFolderPath
            : this._normalizePath(currentOrganizerFolderPath || task.targetFolderName || '');
        if (organizerFolderId) {
            return {
                id: organizerFolderId,
                path: organizerFolderPath
            };
        }

        return {
            id: String(task.targetFolderId || '').trim(),
            path: this._resolveBaseFolderPath(task)
        };
    }

    _getAiMode() {
        if (!AIService.isEnabled()) {
            return 'disabled';
        }
        const mode = String(ConfigService.getConfigValue('openai.mode', 'fallback') || 'fallback').trim().toLowerCase();
        return ['advanced', 'fallback'].includes(mode) ? mode : 'fallback';
    }

    _shouldUseAiFallback(task, allFiles, tmdbInfo, fallbackResourceInfo) {
        if (!allFiles.length) {
            return false;
        }

        if (!tmdbInfo?.id) {
            return true;
        }

        const episodes = Array.isArray(fallbackResourceInfo?.episode) ? fallbackResourceInfo.episode : [];
        if (episodes.length !== allFiles.length) {
            return true;
        }

        const hasSuspiciousEpisode = episodes.some(item => {
            const episode = String(item?.episode || '').trim();
            return !episode || episode === '00';
        });
        if (hasSuspiciousEpisode) {
            return true;
        }

        const normalizedTaskTitle = this._sanitizePathSegment(this._sanitizeTitle(task.resourceName) || task.resourceName || '');
        const normalizedResolvedTitle = this._sanitizePathSegment(fallbackResourceInfo?.name || '');
        return Boolean(normalizedTaskTitle && normalizedResolvedTitle && normalizedTaskTitle !== normalizedResolvedTitle && !tmdbInfo?.title);
    }

    _resolveBaseFolderPath(task) {
        const normalizedFolderName = this._normalizePath(task.realFolderName || '');
        if (!normalizedFolderName) {
            return '';
        }

        const categories = Object.values(this._getCategoryMap()).map(item => this._normalizePath(item));
        let basePath = this._normalizePath(path.posix.dirname(normalizedFolderName));
        if (!basePath || basePath === '.') {
            return '';
        }
        if (categories.includes(this._normalizePath(path.posix.basename(basePath)))) {
            return this._normalizePath(path.posix.dirname(basePath));
        }

        if (task.shareFolderName) {
            const normalizedShareFolderName = this._normalizePath(task.shareFolderName);
            if (normalizedFolderName === normalizedShareFolderName || normalizedFolderName.endsWith(`/${normalizedShareFolderName}`)) {
                const rootPath = this._normalizePath(path.posix.dirname(normalizedFolderName));
                const rootBasePath = this._normalizePath(path.posix.dirname(rootPath));
                if (rootBasePath) {
                    return rootBasePath;
                }
            }
        }

        return basePath;
    }

    _parseTaskTmdbContent(tmdbContent) {
        if (!tmdbContent) {
            return null;
        }
        try {
            const parsed = JSON.parse(tmdbContent);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    _extractYear(value = '') {
        const matched = String(value || '').match(/(19|20)\d{2}/);
        return matched ? matched[0] : '';
    }

    _sanitizeTitle(title = '') {
        return String(title || '')
            .replace(/\(根\)$/g, '')
            .replace(/[\[【(（](19|20)\d{2}[\]】)）]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _sanitizePathSegment(value = '') {
        return String(value || '')
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _normalizePath(targetPath = '') {
        const normalizedPath = String(targetPath || '')
            .replace(/\\/g, '/')
            .replace(/^\.\//, '')
            .replace(/^\/+|\/+$/g, '')
            .replace(/\/{2,}/g, '/');
        return normalizedPath === '.' ? '' : normalizedPath;
    }

    _joinPosix(...parts) {
        return this._normalizePath(parts.filter(Boolean).join('/'));
    }

    _getTaskRelativeRootPath(realFolderName = '') {
        const normalizedPath = this._normalizePath(realFolderName);
        const index = normalizedPath.indexOf('/');
        return index >= 0 ? normalizedPath.substring(index + 1) : normalizedPath;
    }

    _getCategoryMap() {
        return {
            tv: ConfigService.getConfigValue('organizer.categories.tv', '电视剧'),
            anime: ConfigService.getConfigValue('organizer.categories.anime', '动漫'),
            movie: ConfigService.getConfigValue('organizer.categories.movie', '电影'),
            variety: ConfigService.getConfigValue('organizer.categories.variety', '综艺'),
            documentary: ConfigService.getConfigValue('organizer.categories.documentary', '纪录片')
        };
    }
}

module.exports = { OrganizerService };
