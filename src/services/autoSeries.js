const cloudSaverSDK = require('../sdk/cloudsaver/sdk').default;
const ConfigService = require('./ConfigService');
const { TMDBService } = require('./tmdb');
const cloud189Utils = require('../utils/Cloud189Utils');
const { Cloud189Service } = require('./cloud189');

class AutoSeriesService {
    constructor(taskService, accountRepo, lazyShareStrmService) {
        this.taskService = taskService;
        this.accountRepo = accountRepo;
        this.lazyShareStrmService = lazyShareStrmService;
        this.tmdbService = new TMDBService();
    }

    async createByTitle({ title, year = '', mode = 'lazy', shareLink = '', resourceTitle = '' }) {
        const normalizedTitle = String(title || '').trim();
        const normalizedYear = String(year || '').trim();
        const normalizedMode = this._normalizeMode(mode);
        const manualShareLink = String(shareLink || '').trim();
        const manualResourceTitle = String(resourceTitle || '').trim();
        if (!normalizedTitle) {
            throw new Error('剧名不能为空');
        }
        if (!['normal', 'lazy'].includes(normalizedMode)) {
            throw new Error('无效的自动追剧模式');
        }

        const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
        const accountId = parseInt(autoCreateConfig.accountId);
        const targetFolderId = String(autoCreateConfig.targetFolderId || '').trim();
        const targetFolder = String(autoCreateConfig.targetFolder || '').trim();

        if (!accountId) {
            throw new Error('请先在系统设置中配置自动追剧默认账号');
        }
        if (!targetFolderId || !targetFolder) {
            throw new Error('请先在系统设置中配置自动追剧默认保存目录');
        }

        const account = await this.accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('自动追剧默认账号不存在');
        }

        const tmdbInfo = await this._resolveTmdb(normalizedTitle, normalizedYear);
        const resource = manualShareLink
            ? { title: manualResourceTitle || normalizedTitle, cloudLinks: [{ link: manualShareLink }] }
            : await this._findBestResource(normalizedTitle, normalizedYear, tmdbInfo);
        if (!resource?.cloudLinks?.[0]?.link) {
            throw new Error('未找到可用的天翼分享资源');
        }

        const taskName = tmdbInfo?.title
            ? `${tmdbInfo.title}${tmdbInfo.releaseDate ? ` (${new Date(tmdbInfo.releaseDate).getFullYear()})` : ''}`
            : normalizedTitle;
        const totalEpisodes = Number(tmdbInfo?.totalEpisodes || 0) > 0
            ? Number(tmdbInfo.totalEpisodes)
            : (tmdbInfo?.status === 'Ended'
                ? Number(tmdbInfo?.lastEpisodeToAir?.episode_number || 0)
                : 0);

        if (normalizedMode === 'lazy') {
            return await this._createLazySeries({
                account,
                targetFolderId,
                resource,
                taskName,
                tmdbInfo
            });
        }

        const tasks = await this.taskService.createTask({
            accountId: account.id,
            shareLink: resource.cloudLinks[0].link,
            totalEpisodes,
            targetFolderId,
            targetFolder,
            matchPattern: '',
            matchOperator: 'lt',
            matchValue: '',
            overwriteFolder: 0,
            remark: '自动追剧',
            taskGroup: '自动追剧',
            enableCron: false,
            cronExpression: '',
            selectedFolders: [],
            sourceRegex: '',
            targetRegex: '',
            taskName,
            tmdbId: tmdbInfo?.id ? String(tmdbInfo.id) : null,
            enableTaskScraper: true,
            enableLazyStrm: false,
            enableOrganizer: true
        });

        for (const task of tasks || []) {
            await this.taskService.processTask(task);
        }

        return {
            taskCount: tasks?.length || 0,
            resourceTitle: resource.title,
            shareLink: resource.cloudLinks[0].link,
            taskName,
            tmdbId: tmdbInfo?.id || null,
            mode: 'normal'
        };
    }

    async _createLazySeries({ account, targetFolderId, resource, taskName, tmdbInfo }) {
        if (!this.lazyShareStrmService) {
            throw new Error('懒转存服务未初始化');
        }
        if (!account.localStrmPrefix) {
            throw new Error('默认账号未配置本地STRM目录，无法执行懒转存模式');
        }

        const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
        const targetFolder = String(autoCreateConfig.targetFolder || '').trim();
        const totalEpisodes = Number(tmdbInfo?.totalEpisodes || 0) > 0
            ? Number(tmdbInfo.totalEpisodes)
            : (tmdbInfo?.status === 'Ended'
                ? Number(tmdbInfo?.lastEpisodeToAir?.episode_number || 0)
                : 0);

        const tasks = await this.taskService.createTask({
            accountId: account.id,
            shareLink: resource.cloudLinks[0].link,
            totalEpisodes,
            targetFolderId,
            targetFolder,
            matchPattern: '',
            matchOperator: 'lt',
            matchValue: '',
            overwriteFolder: 0,
            remark: '自动追剧',
            taskGroup: '自动追剧',
            enableCron: false,
            cronExpression: '',
            selectedFolders: [],
            sourceRegex: '',
            targetRegex: '',
            taskName,
            tmdbId: tmdbInfo?.id ? String(tmdbInfo.id) : null,
            enableTaskScraper: false,
            enableLazyStrm: true,
            enableOrganizer: true
        });

        for (const task of tasks || []) {
            await this.taskService.processTask(task);
        }

        return {
            taskCount: tasks?.length || 0,
            resourceTitle: resource.title,
            shareLink: resource.cloudLinks[0].link,
            taskName,
            tmdbId: tmdbInfo?.id || null,
            mode: 'lazy',
            taskIds: (tasks || []).map(task => task.id)
        };
    }

    async _resolveTmdb(title, year, currentEpisodes = 0) {
        try {
            return await this.tmdbService.searchTV(title, year, currentEpisodes);
        } catch (error) {
            return null;
        }
    }

    async searchResources({ title, year = '' }) {
        const normalizedTitle = String(title || '').trim();
        const normalizedYear = String(year || '').trim();
        if (!normalizedTitle) {
            throw new Error('剧名不能为空');
        }

        const tmdbInfo = await this._resolveTmdb(normalizedTitle, normalizedYear);
        const resources = await this._fetchResources(normalizedTitle, tmdbInfo);
        if (!resources.length) {
            return { tmdbInfo: this._pickTmdbBrief(tmdbInfo), resources: [] };
        }

        const titleCandidates = [
            normalizedTitle,
            tmdbInfo?.title,
            tmdbInfo?.originalTitle
        ].filter(Boolean).map(item => String(item).toLowerCase());
        const targetYear = normalizedYear
            || (tmdbInfo?.releaseDate ? String(new Date(tmdbInfo.releaseDate).getFullYear()) : '');

        const scored = resources
            .map(resource => ({
                messageId: resource.messageId,
                title: resource.title,
                shareLink: resource.cloudLinks?.[0]?.link || '',
                score: this._scoreResource(resource, titleCandidates, targetYear)
            }))
            .filter(item => item.shareLink)
            .sort((left, right) => right.score - left.score);

        return {
            tmdbInfo: this._pickTmdbBrief(tmdbInfo),
            resources: scored
        };
    }

    _pickTmdbBrief(tmdbInfo) {
        if (!tmdbInfo) {
            return null;
        }
        return {
            id: tmdbInfo.id || null,
            title: tmdbInfo.title || '',
            originalTitle: tmdbInfo.originalTitle || '',
            releaseDate: tmdbInfo.releaseDate || ''
        };
    }

    async _fetchResources(title, tmdbInfo) {
        const searchKeywords = [];
        if (tmdbInfo?.title) {
            searchKeywords.push(tmdbInfo.title);
        }
        if (title) {
            searchKeywords.push(title);
        }
        if (tmdbInfo?.originalTitle) {
            searchKeywords.push(tmdbInfo.originalTitle);
        }

        const uniqueKeywords = [...new Set(searchKeywords.filter(Boolean))];
        for (const keyword of uniqueKeywords) {
            const result = await cloudSaverSDK.search(keyword);
            if (result?.length) {
                return result;
            }
        }
        return [];
    }

    async _findBestResource(title, year, tmdbInfo, currentEpisodes = 0) {
        const resources = await this._fetchResources(title, tmdbInfo);
        if (!resources.length) {
            return null;
        }

        const titleCandidates = [
            title,
            tmdbInfo?.title,
            tmdbInfo?.originalTitle
        ].filter(Boolean).map(item => String(item).toLowerCase());
        const targetYear = year || (tmdbInfo?.releaseDate ? String(new Date(tmdbInfo.releaseDate).getFullYear()) : '');

        return resources
            .map(resource => ({
                ...resource,
                _score: this._scoreResource(resource, titleCandidates, targetYear, currentEpisodes)
            }))
            .sort((left, right) => right._score - left._score)[0];
    }

    _scoreResource(resource, titleCandidates, targetYear, currentEpisodes = 0) {
        const title = String(resource.title || '').toLowerCase();
        let score = 0;

        for (const candidate of titleCandidates) {
            if (!candidate) {
                continue;
            }
            if (title === candidate) {
                score += 120;
                continue;
            }
            if (title.includes(candidate)) {
                score += 80;
                continue;
            }
            const normalizedCandidate = candidate.replace(/\s+/g, '');
            const normalizedTitle = title.replace(/\s+/g, '');
            if (normalizedTitle.includes(normalizedCandidate)) {
                score += 60;
            }
        }

        if (targetYear && title.includes(targetYear)) {
            score += 20;
        }
        if (/完结|全集|全\d+集/.test(resource.title || '')) {
            score += 10;
        }
        if (currentEpisodes > 0) {
            const episodeHint = this._extractEpisodeHint(resource.title || '');
            if (episodeHint >= currentEpisodes + 1) {
                score += 30;
            } else if (episodeHint >= currentEpisodes) {
                score += 15;
            } else if (episodeHint > 0) {
                score -= 20;
            }
        }
        return score;
    }

    _extractEpisodeHint(title = '') {
        const text = String(title || '');
        const matches = text.match(/\d{1,3}(?=集)/g) || [];
        return matches.reduce((max, value) => {
            const num = Number(value);
            return num > max ? num : max;
        }, 0);
    }

    _safeParseJson(value) {
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    _shouldAutoRefreshTask(task) {
        const taskGroup = String(task?.taskGroup || '').trim();
        const totalEpisodes = Number(task?.totalEpisodes || 0);
        const currentEpisodes = Number(task?.currentEpisodes || 0);
        return taskGroup.includes('自动追剧') && !task?.enableLazyStrm && (totalEpisodes <= 0 || currentEpisodes < totalEpisodes);
    }

    _parseTaskDisplayName(task) {
        const rawName = String(task?.resourceName || '').replace(/\(根\)$/g, '').trim();
        const yearMatch = rawName.match(/\((19|20)\d{2}\)/);
        return {
            title: rawName.replace(/\((19|20)\d{2}\)/g, '').trim(),
            year: yearMatch ? yearMatch[0].replace(/[()]/g, '') : ''
        };
    }

    async maybeRefreshTaskSource(task, reason = 'stale') {
        if (!this._shouldAutoRefreshTask(task)) {
            return { updated: false, skipped: true };
        }

        const tmdbContent = this._safeParseJson(task.tmdbContent);
        const parsedName = this._parseTaskDisplayName(task);
        const title = tmdbContent?.title || tmdbContent?.originalTitle || parsedName.title;
        const year = tmdbContent?.releaseDate
            ? String(new Date(tmdbContent.releaseDate).getFullYear())
            : parsedName.year;
        const tmdbInfo = tmdbContent?.id
            ? tmdbContent
            : await this._resolveTmdb(title, year, Number(task.currentEpisodes || 0));

        if (!title) {
            return { updated: false, skipped: true };
        }

        const resource = await this._findBestResource(title, year, tmdbInfo, Number(task.currentEpisodes || 0));
        const rawLink = String(resource?.cloudLinks?.[0]?.link || '').trim();
        if (!rawLink) {
            return { updated: false };
        }

        const { url: parsedShareLink, accessCode } = cloud189Utils.parseCloudShare(rawLink);
        if (String(task.shareLink || '').trim() === parsedShareLink) {
            return { updated: false };
        }

        const account = task.account || await this.accountRepo.findOneBy({ id: task.accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        task.account = account;

        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = cloud189Utils.parseShareCode(parsedShareLink);
        const shareInfo = await this.taskService.getShareInfo(cloud189, shareCode);

        let nextShareFolderId = shareInfo.fileId;
        let nextShareFolderName = task.shareFolderName || '';
        if (task.shareFolderName) {
            const shareDir = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, accessCode || '');
            const folderList = shareDir?.fileListAO?.folderList || [];
            const matchedFolder = folderList.find(folder => String(folder.name || '').trim() === String(task.shareFolderName || '').trim());
            if (!matchedFolder?.id) {
                return { updated: false, skipped: true };
            }
            nextShareFolderId = matchedFolder.id;
            nextShareFolderName = matchedFolder.name;
        }

        task.shareLink = parsedShareLink;
        task.accessCode = accessCode || '';
        task.shareId = shareInfo.shareId;
        task.shareMode = shareInfo.shareMode;
        task.shareFileId = shareInfo.fileId;
        task.shareFolderId = nextShareFolderId;
        task.shareFolderName = nextShareFolderName;
        task.lastSourceRefreshTime = new Date();
        await this.taskService.taskRepo.save(task);

        return {
            updated: true,
            reason,
            shareLink: parsedShareLink,
            resourceTitle: resource.title
        };
    }

    _normalizeMode(mode) {
        const normalizedMode = String(mode || 'lazy').trim().toLowerCase();
        return normalizedMode === 'auto' ? 'normal' : normalizedMode;
    }
}

module.exports = { AutoSeriesService };
