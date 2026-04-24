const path = require('path');
const ConfigService = require('./ConfigService');
const { Cloud189Service } = require('./cloud189');
const { StrmService } = require('./strm');
const { TMDBService } = require('./tmdb');
const AIService = require('./ai');
const { logTaskEvent } = require('../utils/logUtils');

class OrganizerService {
    constructor(taskService, taskRepo) {
        this.taskService = taskService;
        this.taskRepo = taskRepo;
        this.tmdbService = new TMDBService();
        this.strmService = new StrmService(taskService);
    }

    async organizeTaskById(taskId, options = {}) {
        const task = await this.taskService.getTaskById(taskId);
        if (!task) throw new Error(`未找到任务 #${taskId}`);
        return await this.organizeTask(task, options);
    }

    async organizeTask(task, options = {}) {
        console.log(`[Organizer] >>> 开始整理任务: ${task.resourceName} (ID: ${task.id})`);
        if (!task.enableOrganizer && !options.force) {
            console.log('[Organizer] 整理器未启用，退出');
            return { success: false, message: '整理器未启用' };
        }
        
        try {
            const { TaskProcessedFile } = require('../entities');
            const { AppDataSource: dataSource } = require('../database');
            const taskProcessedFileRepo = dataSource.getRepository(TaskProcessedFile);

            const cloud189 = Cloud189Service.getInstance(task.account);
            console.log(`[Organizer] 1. 云盘实例就绪: ${task.account.username}`);

            console.log(`[Organizer] 2. 正在列出原始目录文件: ${task.realFolderId}`);
            const folderInfo = await cloud189.listFiles(task.realFolderId);
            const mediaFiles = (folderInfo?.fileListAO?.fileList || []).filter(f => !f.isFolder);
            console.log(`[Organizer] 3. 发现媒体文件: ${mediaFiles.length} 个`);

            if (mediaFiles.length === 0) {
                console.log('[Organizer] 无媒体文件，任务结束');
                return { success: false, message: '没有媒体文件' };
            }

            console.log(`[Organizer] 4. 正在对齐 TMDB 元数据...`);
            const tmdbInfo = await this._resolveTmdbInfo(task);
            console.log(`[Organizer] TMDB 匹配结果: ${tmdbInfo?.title || '未找到'}`);

            if (tmdbInfo && tmdbInfo.totalEpisodes) {
                console.log(`[Organizer] 发现 TMDB 最新总集数: ${tmdbInfo.totalEpisodes}`);
                await this.taskRepo.update(task.id, { totalEpisodes: tmdbInfo.totalEpisodes });
            }

            console.log(`[Organizer] 5. 正在解析资源结构 (可能触发 AI)...`);
            const resourceInfo = await this._resolveResourceInfo(task, mediaFiles, tmdbInfo);
            console.log(`[Organizer] 资源结构就绪: ${resourceInfo.name}, 模式: ${resourceInfo.isFallback ? '保底' : '标准'}`);

            const libraryInfo = this._resolveLibraryInfo(resourceInfo);
            const organizerRootId = String(task.organizerTargetFolderId || task.targetFolderId).trim();
            console.log(`[Organizer] 6. 规划目标路径: 根ID(${organizerRootId}) -> 分类(${libraryInfo.categoryName}) -> 剧集(${libraryInfo.resourceFolderName})`);

            const categoryFolderId = await this._ensureFolderByName(cloud189, organizerRootId, libraryInfo.categoryName, new Map());
            const resourceFolderId = await this._ensureFolderByName(cloud189, categoryFolderId, libraryInfo.resourceFolderName, new Map());

            const fileMap = new Map((resourceInfo.episode || []).map(item => [String(item.id), item]));
            console.log(`[Organizer] 9. 映射表构建完成 (${fileMap.size} 条)，开始执行物理操作...`);

            const folderCache = new Map();
            const messages = [];
            for (const file of mediaFiles) {
                const aiFile = fileMap.get(String(file.id));
                if (!aiFile) {
                    console.log(`[Organizer] [跳过] 文件未在映射中: ${file.name}`);
                    continue;
                }

                let targetFolderId = resourceFolderId;
                if (resourceInfo.type === 'tv' && aiFile.season) {
                    const seasonName = `Season ${String(aiFile.season).padStart(2, '0')}`;
                    targetFolderId = await this._ensureFolderByName(cloud189, resourceFolderId, seasonName, folderCache);
                }

                if (!resourceInfo.isFallback) {
                    const template = resourceInfo.type === 'movie' ? '{name} ({year}){ext}' : '{name} - {se}{ext}';
                    const targetFileName = this.taskService._generateFileName(file, aiFile, resourceInfo, template);
                    if (file.name !== targetFileName) {
                        console.log(`[Organizer] [重命名] ${file.name} -> ${targetFileName}`);
                        try {
                            await cloud189.renameFile(file.id, targetFileName);
                            messages.push(`├─ 重命名 ${file.name} -> ${targetFileName}`);
                            file.name = targetFileName;
                        } catch (err) { console.error(`[Organizer] 重命名执行失败: ${file.name}`, err.message); }
                    }
                }

                console.log(`[Organizer] [移动] 正在搬运: ${file.name} -> 目标目录`);
                try {
                    await this.taskService.moveCloudFile(cloud189, { id: file.id, name: file.name, isFolder: false }, targetFolderId);
                    
                    // 移动成功后同步数据库记录
                    await taskProcessedFileRepo.update(
                        { taskId: task.id, sourceFileId: String(file.id) },
                        { status: 'success', lastError: null, updatedAt: new Date() }
                    );

                    messages.push(`├─ 移动 ${file.name} -> 归档目录`);
                    console.log(`[Organizer] [成功] 搬运完成并同步记录: ${file.name}`);
                } catch (err) { console.error(`[Organizer] 移动执行失败: ${file.name}`, err.message); }
            }

            console.log(`[Organizer] 10. 正在清理目录树...`);
            await this._cleanupEmptyFolderTree(cloud189, task.realFolderId);
            
            if (task.realRootFolderId && task.realRootFolderId !== task.realFolderId) {
                console.log(`[Organizer] 正在额外检查清理任务根目录: ${task.realRootFolderId}`);
                await this._cleanupEmptyFolderTree(cloud189, task.realRootFolderId);
            }
            
            if (messages.length > 0) {
                messages[messages.length - 1] = messages[messages.length - 1].replace(/^├─/, '└─');
                logTaskEvent(`整理完成:\n${messages.join('\n')}`, 'info', 'organizer');
            }

            // 核心修复：更新最后整理时间，让前端不再显示“从未执行”
            await this.taskRepo.update(task.id, { 
                lastOrganizedAt: new Date(),
                lastOrganizeError: null 
            });

            console.log(`[Organizer] <<< 任务 ${task.id} 整理全部达成`);
            return { message: `${task.resourceName}整理完成`, taskId: task.id };
        } catch (globalErr) {
            console.error(`[Organizer] !!! 任务 ${task.id} 整理过程发生严重异常:`, globalErr);
            throw globalErr;
        }
    }

    async organizeLooseGroup(params = {}) {
        const { account, organizerRootId, sourceFolderPath = '', files = [] } = params;
        const mediaFiles = files.filter(f => f && !f.isFolder);
        if (!account?.id || mediaFiles.length === 0) throw new Error('参数不足');

        const cloud189 = Cloud189Service.getInstance(account);
        const taskLike = { account, resourceName: path.posix.basename(sourceFolderPath) || '未命名', currentEpisodes: mediaFiles.length };
        const tmdbInfo = await this._resolveTmdbInfo(taskLike);
        const resourceInfo = await this._resolveResourceInfo(taskLike, mediaFiles, tmdbInfo);
        const libraryInfo = this._resolveLibraryInfo(resourceInfo);

        const categoryId = await this._ensureFolderByName(cloud189, organizerRootId, libraryInfo.categoryName, new Map());
        const resourceId = await this._ensureFolderByName(cloud189, categoryId, libraryInfo.resourceFolderName, new Map());
        const fileMap = new Map((resourceInfo.episode || []).map(item => [String(item.id), item]));

        const folderCache = new Map();
        for (const file of mediaFiles) {
            const aiFile = fileMap.get(String(file.id));
            if (!aiFile) continue;

            let targetFolderId = resourceId;
            if (resourceInfo.type === 'tv' && aiFile.season) {
                const seasonName = `Season ${String(aiFile.season).padStart(2, '0')}`;
                targetFolderId = await this._ensureFolderByName(cloud189, resourceId, seasonName, folderCache);
            }

            const targetFileName = this.taskService._generateFileName(file, aiFile, resourceInfo, '{name} - {se}{ext}');
            if (file.name !== targetFileName) await cloud189.renameFile(file.id, targetFileName);
            await this.taskService.moveCloudFile(cloud189, { id: file.id, name: file.name, isFolder: false }, targetFolderId);
        }

        if (mediaFiles[0]?.parentFolderId) await this._cleanupEmptyFolderTree(cloud189, mediaFiles[0].parentFolderId);
        return { message: `${taskLike.resourceName}批量整理完成`, taskId: null };
    }

    async _resolveTmdbInfo(task) {
        if (task.tmdbId) return await this.tmdbService.getTVDetails(task.tmdbId) || await this.tmdbService.getMovieDetails(task.tmdbId);
        const title = String(task.resourceName).replace(/\(根\)$/g, '').trim();
        const year = (title.match(/(19|20)\d{2}/) || [])[0] || '';
        return await this.tmdbService.searchTV(title, year, task.currentEpisodes || 0) || await this.tmdbService.searchMovie(title, year);
    }

    async _resolveResourceInfo(task, mediaFiles, tmdbInfo) {
        const resourceName = task.realFolderName || task.resourceName;
        const fileNames = mediaFiles.map(f => f.name);
        
        try {
            const { parseMediaTitle } = require('../utils/mediaTitleParser');
            const parsedRoot = parseMediaTitle(resourceName);
            
            const name = tmdbInfo?.title || parsedRoot.cleanTitle || resourceName;
            const year = tmdbInfo?.releaseDate ? new Date(tmdbInfo.releaseDate).getFullYear() : (parsedRoot.year || 0);
            const type = (tmdbInfo?.type || (mediaFiles.length > 1 ? 'tv' : 'movie'));

            // 增强：从文件夹名提取季度的保底正则
            let seasonNum = parsedRoot.season;
            if (seasonNum === null || seasonNum === undefined) {
                const sMatch = resourceName.match(/(?:Season|S|第)\s*(\d{1,2})/i);
                if (sMatch) seasonNum = parseInt(sMatch[1]);
            }

            let localEpisodes = [];
            let canLocallyResolve = true;

            for (const file of mediaFiles) {
                const p = parseMediaTitle(file.name);
                if (type === 'tv' && p.episode === null) {
                    canLocallyResolve = false;
                    break;
                }
                localEpisodes.push({
                    id: file.id,
                    name: name,
                    season: String(p.season || seasonNum || 1).padStart(2, '0'),
                    episode: p.episode !== null ? String(p.episode).padStart(2, '0') : '',
                    extension: path.extname(file.name)
                });
            }

            if (canLocallyResolve && localEpisodes.length > 0) {
                console.log(`[Organizer] 本地解析成功: ${name} (${year}), 跳过 AI`);
                return { name, year: Number(year), type, season: localEpisodes[0]?.season || '01', episode: localEpisodes };
            }

            console.log(`[Organizer] 本地解析不完整，正在启动 AI 分析: ${resourceName}`);
            try {
                const analyzed = await this.taskService._analyzeResourceInfo(resourceName, fileNames, 'file');
                return analyzed;
            } catch (aiError) {
                console.warn(`[Organizer] AI 分析彻底失败: ${aiError.message}。将进入原始名称归档模式。`);
                return {
                    name, year: Number(year), type, season: String(seasonNum || 1).padStart(2, '0'), isFallback: true,
                    episode: mediaFiles.map(f => ({
                        id: String(f.id), name, season: String(seasonNum || 1).padStart(2, '0'), episode: '', extension: path.extname(f.name)
                    }))
                };
            }
        } catch (e) {
            console.error('[Organizer] 解析过程出错:', e.message);
            return { name: tmdbInfo?.title || task.resourceName, year: 0, type: mediaFiles.length > 1 ? 'tv' : 'movie', episode: mediaFiles.map(f => ({ id: f.id, name: f.name, extension: path.extname(f.name) })) };
        }
    }

    _resolveLibraryInfo(info) {
        const map = { tv: ConfigService.getConfigValue('organizer.categories.tv', '电视剧'), movie: ConfigService.getConfigValue('organizer.categories.movie', '电影') };
        return { categoryName: map[info.type] || map.tv, resourceFolderName: `${info.name} (${info.year || '0000'})` };
    }

    async _ensureFolderByName(cloud189, parentId, name, cache) {
        const key = `${parentId}:${name}`;
        if (cache.has(key)) return cache.get(key);
        console.log(`[Organizer] 检查目录是否存在: ${name} (父ID: ${parentId})`);
        const info = await cloud189.listFiles(parentId);
        const existing = (info?.fileListAO?.folderList || []).find(f => f.name === name);
        if (existing) {
            console.log(`[Organizer] 目录已存在: ${name} (ID: ${existing.id})`);
            cache.set(key, existing.id); return existing.id;
        }
        console.log(`[Organizer] 正在新建目录: ${name}`);
        const result = await cloud189.createFolder(name, parentId);
        if (!result || !result.id) throw new Error(`创建目录失败: ${name}`);
        cache.set(key, result.id); return result.id;
    }

    async _ensureDirectoryPath(cloud189, rootId, relPath, cache) {
        if (!relPath || relPath === '.') return rootId;
        let cur = rootId;
        for (const p of relPath.split('/').filter(Boolean)) cur = await this._ensureFolderByName(cloud189, cur, p, cache);
        return cur;
    }

    async _cleanupEmptyFolderTree(cloud189, folderId) {
        const id = String(folderId || '').trim();
        if (!id || id === '0') return false;
        try {
            console.log(`[Organizer] 正在深度检查清理目录: ${id}`);
            const info = await cloud189.listFiles(id);
            for (const f of (info?.fileListAO?.folderList || [])) await this._cleanupEmptyFolderTree(cloud189, f.id);
            const ref = await cloud189.listFiles(id);
            const files = ref?.fileListAO?.fileList || [], folders = ref?.fileListAO?.folderList || [];
            const TRASH_EXTS = new Set(['.nfo', '.jpg', '.jpeg', '.png', '.tbn', '.txt', '.url', '.pdf', '.docx', '.md', '.iso', '.cas', '.exe', '.htm', '.html']);
            const hasMedia = files.some(f => !TRASH_EXTS.has(path.extname(f.name).toLowerCase()));
            if (!hasMedia && folders.length === 0) {
                console.log(`[Organizer] 目录已清空或仅剩杂物，正在物理删除: ${id}`);
                for (const f of files) await cloud189.deleteFile(f.id, f.name);
                await cloud189.deleteFile(id, ''); return true;
            }
        } catch (e) { console.error(`[Organizer] 清理目录失败 (${folderId}):`, e.message); }
        return false;
    }

    _getCategoryMap() {
        return { tv: ConfigService.getConfigValue('organizer.categories.tv', '电视剧'), movie: ConfigService.getConfigValue('organizer.categories.movie', '电影') };
    }
}

module.exports = { OrganizerService };
