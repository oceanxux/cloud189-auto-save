const path = require('path');
const ConfigService = require('../ConfigService');
const { Cloud189Service } = require('../cloud189');
const { EmbyService } = require('../emby');
const { resolveWorkflowResourceName, isGenericSeasonFolder } = require('../../utils/workflowTitleResolver');

const mediaFilePattern = /\.(mkv|mp4|avi|mov|m2ts|ts|flv|rmvb|wmv|iso|mpg|rm|cas)$/i;

const normalizePathValue = (value = '') => String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

const resolveFolderAlias = (value = '') => {
    const normalized = normalizePathValue(value).toLowerCase();
    if (!normalized) {
        return '';
    }
    if (['未刮削', 'unorganized', 'unscraped', 'unsorted'].includes(normalized)) {
        return '未刮削';
    }
    if (['未整理', 'unprocessed', 'unorganized-media'].includes(normalized)) {
        return '未整理';
    }
    return normalizePathValue(value);
};

const inferPathMediaType = (pathName = '') => {
    if (/电视剧|动漫|综艺|纪录片/i.test(pathName)) {
        return 'tv';
    }
    if (/电影/i.test(pathName)) {
        return 'movie';
    }
    return 'all';
};

const buildLooseTaskLike = ({ account, organizerRootId, organizerRootPath, sourceFolderPath, resourceName, files }) => ({
    account,
    accountId: account.id,
    resourceName: String(resourceName || '').trim() || path.posix.basename(normalizePathValue(sourceFolderPath || '')) || '未命名资源',
    shareFolderName: '',
    targetFolderId: String(organizerRootId || '').trim(),
    targetFolderName: normalizePathValue(organizerRootPath || ''),
    organizerTargetFolderId: String(organizerRootId || '').trim(),
    organizerTargetFolderName: normalizePathValue(organizerRootPath || ''),
    realFolderId: String(files[0]?.parentFolderId || '').trim(),
    realRootFolderId: String(files[0]?.parentFolderId || '').trim(),
    realFolderName: normalizePathValue(sourceFolderPath || ''),
    tmdbId: '',
    tmdbContent: '',
    currentEpisodes: files.length,
    totalEpisodes: 0,
    enableOrganizer: true,
    enableLazyStrm: false
});

const createWorkflowExecutors = (deps = {}) => {
    const { accountRepo, taskService, organizerService } = deps;

    const scanDir = {
        async run(ctx) {
            const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
            const accountId = Number(ctx.accountId || autoCreateConfig.accountId || 0);
            const rootFolderId = String(ctx.rootFolderId || autoCreateConfig.targetFolderId || '').trim();
            const organizerRootId = String(ctx.organizerRootId || autoCreateConfig.organizerTargetFolderId || '').trim();
            const organizerRootPath = normalizePathValue(ctx.organizerRootPath || autoCreateConfig.organizerTargetFolderName || '');
            const configuredRootName = resolveFolderAlias(ctx.rootFolderName || autoCreateConfig.targetFolder || '');
            const requestedFolder = resolveFolderAlias(ctx.folderName || configuredRootName);
            const mediaType = ['movie', 'tv'].includes(String(ctx.mediaType || '')) ? String(ctx.mediaType) : 'all';

            if (!accountId || !rootFolderId) {
                throw new Error('默认保存目录未配置，无法扫描目录');
            }
            if (!organizerRootId) {
                throw new Error('默认整理根目录未配置，无法继续工作流');
            }

            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('默认账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const entries = [];
            const visited = new Set();

            const walkFolder = async (folderId, currentPath, depth = 0) => {
                const normalizedFolderId = String(folderId || '').trim();
                if (!normalizedFolderId || visited.has(normalizedFolderId) || depth > 6 || entries.length >= 500) {
                    return;
                }
                visited.add(normalizedFolderId);

                const response = await cloud189.listFiles(normalizedFolderId);
                const folderList = response?.fileListAO?.folderList || [];
                const fileList = response?.fileListAO?.fileList || [];

                for (const file of fileList) {
                    const fileName = String(file.name || file.fileName || '').trim();
                    if (!fileName || !mediaFilePattern.test(fileName)) {
                        continue;
                    }
                    const relativePath = normalizePathValue(`${currentPath}/${fileName}`);
                    const inferredType = inferPathMediaType(relativePath);
                    if (mediaType !== 'all' && inferredType !== 'all' && inferredType !== mediaType) {
                        continue;
                    }
                    entries.push({
                        id: String(file.id || file.fileId || '').trim(),
                        name: fileName,
                        parentFolderId: normalizedFolderId,
                        relativePath,
                        relativeDir: normalizePathValue(path.posix.dirname(relativePath)),
                        size: Number(file.size || file.fileSize || 0),
                        md5: String(file.md5 || '').trim(),
                        isFolder: false
                    });
                }

                for (const folder of folderList) {
                    const childId = String(folder.id || '').trim();
                    const childName = String(folder.name || '').trim();
                    if (!childId || !childName) {
                        continue;
                    }
                    await walkFolder(childId, normalizePathValue(`${currentPath}/${childName}`), depth + 1);
                }
            };

            await walkFolder(rootFolderId, configuredRootName || requestedFolder || '未刮削', 0);

            const groups = new Map();
            const skippedFiles = [];
            for (const entry of entries) {
                const relativePath = normalizePathValue(entry.relativePath);
                const rootPrefix = `${requestedFolder}/`;
                const relativeToRoot = relativePath === requestedFolder
                    ? ''
                    : relativePath.startsWith(rootPrefix)
                        ? normalizePathValue(relativePath.slice(rootPrefix.length))
                        : relativePath;
                const parts = relativeToRoot.split('/').filter(Boolean);
                if (parts.length < 2) {
                    skippedFiles.push(relativePath);
                    continue;
                }
                const groupParts = parts.slice(0, 2);
                const groupRootPath = normalizePathValue(`${requestedFolder}/${groupParts.join('/')}`);
                const fileRelativeToGroup = normalizePathValue(relativePath.slice(groupRootPath.length + 1));
                const fileRelativeDir = normalizePathValue(path.posix.dirname(fileRelativeToGroup));
                const resourceName = resolveWorkflowResourceName(groupParts) || path.posix.basename(groupRootPath);
                if (!groups.has(groupRootPath)) {
                    groups.set(groupRootPath, {
                        groupPath: groupRootPath,
                        resourceName,
                        originalFolderName: groupParts[groupParts.length - 1] || '',
                        files: []
                    });
                }
                groups.get(groupRootPath).files.push({
                    ...entry,
                    relativePath: fileRelativeToGroup,
                    relativeDir: fileRelativeDir === '.' ? '' : fileRelativeDir
                });
            }

            return {
                context: {
                    accountId,
                    folderName: requestedFolder,
                    rootFolderId,
                    organizerRootId,
                    organizerRootPath,
                    mediaType,
                    entries,
                    groups: Array.from(groups.values()),
                    skippedFiles
                }
            };
        }
    };

    const tmdbMatch = {
        async run(ctx) {
            const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
            const accountId = Number(ctx.accountId || autoCreateConfig.accountId || 0);
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('默认账号不存在');
            }

            const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
            const groupPreviews = [];
            for (const group of groups) {
                const taskLike = buildLooseTaskLike({
                    account,
                    organizerRootId: ctx.organizerRootId,
                    organizerRootPath: ctx.organizerRootPath,
                    sourceFolderPath: group.groupPath,
                    resourceName: group.resourceName,
                    files: group.files
                });
                const tmdbInfo = await organizerService._resolveTmdbInfo(taskLike, null);
                const resourceInfo = await organizerService._resolveResourceInfo(taskLike, group.files, tmdbInfo);
                const libraryInfo = organizerService._resolveLibraryInfo(taskLike, resourceInfo, tmdbInfo);
                groupPreviews.push({
                    groupPath: group.groupPath,
                    originalName: group.originalFolderName || group.resourceName,
                    tmdbTitle: resourceInfo?.name || group.resourceName,
                    targetPath: normalizePathValue(`${ctx.organizerRootPath}/${libraryInfo.categoryName}/${libraryInfo.resourceFolderName}`),
                    fileCount: group.files.length,
                    resourceInfo,
                    libraryInfo,
                    usedParentFolderName: Boolean(group.originalFolderName && isGenericSeasonFolder(group.originalFolderName))
                });
            }

            return {
                context: {
                    groupPreviews
                }
            };
        }
    };

    const generateNames = {
        async run(ctx) {
            const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
            const previews = Array.isArray(ctx.groupPreviews) ? ctx.groupPreviews : [];
            const previewMap = new Map(previews.map(item => [item.groupPath, item]));
            const renamedGroups = groups.map(group => {
                const preview = previewMap.get(group.groupPath);
                if (!preview) {
                    return { ...group, renamePreview: [] };
                }
                const template = preview.resourceInfo?.type === 'movie'
                    ? ConfigService.getConfigValue('openai.rename.movieTemplate') || '{name} ({year}){ext}'
                    : ConfigService.getConfigValue('openai.rename.template') || '{name} - {se}{ext}';
                const fileMap = new Map((preview.resourceInfo?.episode || []).map(item => [String(item.id), item]));
                const renamePreview = group.files.map(file => {
                    const aiFile = fileMap.get(String(file.id));
                    const nextName = aiFile ? taskService._generateFileName(file, aiFile, preview.resourceInfo, template) : file.name;
                    return {
                        fileId: String(file.id),
                        oldName: file.name,
                        newName: nextName
                    };
                });
                return { ...group, renamePreview };
            });

            return {
                context: {
                    groups: renamedGroups
                }
            };
        }
    };

    const awaitConfirm = {
        async run(ctx) {
            const previews = Array.isArray(ctx.groupPreviews) ? ctx.groupPreviews : [];
            const lines = previews.length > 0
                ? previews.map(item => `• ${item.originalName} (${item.fileCount} 文件)\n  → ${item.targetPath}`).join('\n')
                : '没有可执行的分组。';

            return {
                type: 'AWAIT_CONFIRM',
                preview: `共 ${previews.length} 组，预览如下：\n\n${lines}\n\n回复 Y 执行，N 取消`
            };
        }
    };

    const moveFiles = {
        async run(ctx) {
            const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
            const accountId = Number(ctx.accountId || autoCreateConfig.accountId || 0);
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('默认账号不存在');
            }

            const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
            const results = [];
            for (const group of groups) {
                try {
                    const result = await organizerService.organizeLooseGroup({
                        account,
                        organizerRootId: ctx.organizerRootId,
                        organizerRootPath: ctx.organizerRootPath,
                        sourceFolderPath: group.groupPath,
                        resourceName: group.resourceName,
                        files: group.files
                    });
                    results.push({
                        groupPath: group.groupPath,
                        success: true,
                        message: result?.message || '整理完成'
                    });
                } catch (error) {
                    results.push({
                        groupPath: group.groupPath,
                        success: false,
                        message: error.message
                    });
                }
            }

            return {
                context: {
                    workflowResults: results,
                    resultSummary: [
                        `${ctx.folderName} 目录工作流结果：`,
                        `- 查询到 ${Array.isArray(ctx.entries) ? ctx.entries.length : 0} 个文件`,
                        `- 按目录分组 ${groups.length} 组`,
                        `- 成功整理 ${results.filter(item => item.success).length} 组`,
                        `- 整理失败 ${results.filter(item => !item.success).length} 组`,
                        `- 因无法分组跳过 ${Array.isArray(ctx.skippedFiles) ? ctx.skippedFiles.length : 0} 个文件`,
                        results.length > 0 ? '执行结果：' : '',
                        ...results.map(item => `  - ${item.groupPath}: ${item.message}`),
                        Array.isArray(ctx.skippedFiles) && ctx.skippedFiles.length > 0 ? '跳过文件：' : '',
                        ...(Array.isArray(ctx.skippedFiles) ? ctx.skippedFiles.slice(0, 20).map(item => `  - ${item}`) : [])
                    ].filter(Boolean).join('\n')
                }
            };
        }
    };

    const notifyEmby = {
        async run(ctx) {
            if (!ctx.taskId) {
                return {
                    context: {
                        notifySummary: '当前工作流没有直接关联任务，已跳过 Emby 通知。'
                    }
                };
            }
            const task = await taskService.getTaskById(Number(ctx.taskId));
            if (!task) {
                return {
                    context: {
                        notifySummary: '任务不存在，已跳过 Emby 通知。'
                    }
                };
            }
            const embyService = new EmbyService(taskService);
            await embyService.notify(task);
            return {
                context: {
                    notifySummary: `已通知 Emby：${task.resourceName}`
                }
            };
        }
    };

    const executeTask = {
        async run(ctx) {
            const task = await taskService.getTaskById(Number(ctx.taskId || 0));
            if (!task) {
                throw new Error('任务不存在');
            }
            const result = await taskService.processTask(task);
            return {
                context: {
                    taskId: task.id,
                    resultSummary: result || `任务已执行：${task.resourceName}`
                }
            };
        }
    };

    return {
        scanDir,
        tmdbMatch,
        generateNames,
        awaitConfirm,
        moveFiles,
        notifyEmby,
        executeTask
    };
};

module.exports = { createWorkflowExecutors };
