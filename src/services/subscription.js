const cloud189Utils = require('../utils/Cloud189Utils');
const { Cloud189Service } = require('./cloud189');
const { logTaskEvent } = require('../utils/logUtils');

class SubscriptionService {
    constructor(subscriptionRepo, resourceRepo, accountRepo) {
        this.subscriptionRepo = subscriptionRepo;
        this.resourceRepo = resourceRepo;
        this.accountRepo = accountRepo;
    }

    async listSubscriptions() {
        const subscriptions = await this.subscriptionRepo.find({
            order: { id: 'DESC' }
        });
        const resourceCounts = await Promise.all(
            subscriptions.map(subscription => this.resourceRepo.count({
                where: { subscriptionId: subscription.id }
            }))
        );
        return subscriptions.map((subscription, index) => ({
            ...subscription,
            resourceCount: resourceCounts[index]
        }));
    }

    async createSubscription(data) {
        const uuid = data.uuid?.trim();
        if (!uuid) {
            throw new Error('UUID 不能为空');
        }
        const exist = await this.subscriptionRepo.findOneBy({ uuid });
        if (exist) {
            throw new Error('该 UUID 已存在');
        }
        const subscription = this.subscriptionRepo.create({
            uuid,
            name: data.name?.trim() || `订阅-${uuid.slice(0, 8)}`,
            remark: data.remark?.trim() || '',
            enabled: data.enabled !== false,
            lastRefreshStatus: 'unknown',
            lastRefreshMessage: '',
            validResourceCount: 0,
            invalidResourceCount: 0,
            availableAccountCount: 0,
            totalAccountCount: 0
        });
        const savedSubscription = await this.subscriptionRepo.save(subscription);
        await logTaskEvent(`创建订阅成功: ${savedSubscription.name} (${savedSubscription.uuid})，开始同步远端资源`, 'info', 'subscription');
        await this.syncSubscriptionResources(savedSubscription.id);
        return await this.subscriptionRepo.findOneBy({ id: savedSubscription.id }) || savedSubscription;
    }

    async previewSubscriptionCreation(data) {
        const uuid = data.uuid?.trim();
        if (!uuid) {
            throw new Error('UUID 不能为空');
        }

        const exist = await this.subscriptionRepo.findOneBy({ uuid });
        const accounts = await this._getAvailableAccounts();
        const defaultAccount = accounts.find(account => account.isDefault);
        const normalizedAccounts = accounts.map(account => ({
            id: account.id,
            name: account.alias?.trim() || account.username,
            isDefault: !!account.isDefault
        }));

        const looksLikeUuid = /^[a-zA-Z0-9_-]{6,}$/.test(uuid);
        const canCreate = !exist && normalizedAccounts.length > 0 && looksLikeUuid;
        let recommendation = '';
        if (exist) {
            recommendation = '该 UUID 已存在于订阅列表中，建议直接刷新已有订阅。';
        } else if (!normalizedAccounts.length) {
            recommendation = '当前没有可用账号，无法进行订阅资源校验。';
        } else if (!looksLikeUuid) {
            recommendation = 'UUID 格式看起来不太正确，请确认后再保存。';
        } else {
            recommendation = '可以创建订阅。创建后建议立即添加资源并执行一次校验。';
        }

        return {
            uuid,
            looksLikeUuid,
            canCreate,
            hasAccounts: normalizedAccounts.length > 0,
            accountCount: normalizedAccounts.length,
            defaultAccount: defaultAccount ? {
                id: defaultAccount.id,
                name: defaultAccount.alias?.trim() || defaultAccount.username
            } : null,
            accounts: normalizedAccounts,
            existingSubscription: exist ? {
                id: exist.id,
                name: exist.name,
                enabled: exist.enabled,
                lastRefreshStatus: exist.lastRefreshStatus,
                lastRefreshTime: exist.lastRefreshTime
            } : null,
            recommendation
        };
    }

    async updateSubscription(id, updates) {
        const subscription = await this.subscriptionRepo.findOneBy({ id });
        if (!subscription) {
            throw new Error('订阅不存在');
        }
        if (updates.uuid !== undefined) {
            const nextUuid = updates.uuid.trim();
            if (!nextUuid) {
                throw new Error('UUID 不能为空');
            }
            const exist = await this.subscriptionRepo.findOneBy({ uuid: nextUuid });
            if (exist && exist.id !== id) {
                throw new Error('该 UUID 已存在');
            }
            subscription.uuid = nextUuid;
        }
        if (updates.name !== undefined) {
            subscription.name = updates.name.trim() || subscription.name;
        }
        if (updates.remark !== undefined) {
            subscription.remark = updates.remark.trim();
        }
        if (updates.enabled !== undefined) {
            subscription.enabled = !!updates.enabled;
        }
        return await this.subscriptionRepo.save(subscription);
    }

    async deleteSubscription(id) {
        const subscription = await this.subscriptionRepo.findOneBy({ id });
        if (!subscription) {
            throw new Error('订阅不存在');
        }
        await this.resourceRepo.delete({ subscriptionId: id });
        await this.subscriptionRepo.remove(subscription);
    }

    async listResources(subscriptionId) {
        const subscription = await this._ensureSubscription(subscriptionId);
        let resources = await this.resourceRepo.find({
            where: { subscriptionId },
            order: { id: 'DESC' }
        });
        if (!resources.length) {
            await logTaskEvent(`订阅[${subscription.name}]本地资源为空，尝试自动同步远端资源`, 'info', 'subscription');
            await this._syncRemoteResources(subscription);
            resources = await this.resourceRepo.find({
                where: { subscriptionId },
                order: { id: 'DESC' }
            });
        }
        return await this._decorateResources(resources);
    }

    async listRemoteResources(subscriptionId, options = {}) {
        const subscription = await this._ensureSubscription(subscriptionId);
        const account = await this._getAvailableAccount();
        const cloud189 = Cloud189Service.getInstance(account);
        const pageNum = Math.max(1, Number(options.pageNum || 1));
        const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 30)));

        const result = await cloud189.request('https://api.cloud.189.cn/open/share/getUpResourceShare.action', {
            method: 'GET',
            searchParams: {
                iconOption: 5,
                pageNum,
                pageSize,
                upUserId: subscription.uuid
            }
        });

        if (!result || result.code !== 'success') {
            const message = result?.message || result?.msg || result?.errorMsg || '获取订阅资源失败';
            throw new Error(message);
        }

        const data = result.data || {};
        const fileList = Array.isArray(data.fileList) ? data.fileList : [];
        const mapped = fileList.map(item => ({
            id: String(item.id || ''),
            title: item.name || '',
            shareLink: item.accessURL ? `https://cloud.189.cn/web/share?code=${encodeURIComponent(item.accessURL)}` : '',
            detailLink: item.accessURL ? `https://content.21cn.com/h5/subscrip/index.html#/pages/details/index?uuid=${encodeURIComponent(subscription.uuid)}&shareCode=${encodeURIComponent(item.accessURL)}` : '',
            subscriptionUuid: subscription.uuid,
            shareCode: item.accessURL || '',
            accessCode: '',
            shareId: item.shareId ? String(item.shareId) : '',
            shareMode: item.shareType ? String(item.shareType) : '',
            shareFileId: item.id ? String(item.id) : '',
            shareFileName: item.name || '',
            isFolder: item.folder !== undefined ? !!item.folder : true,
            heat: Number(item.heat || 0),
            createDate: item.createDate || '',
            accessURL: item.accessURL || ''
        }));

        return {
            pageNum,
            pageSize,
            total: Number(data.count || mapped.length || 0),
            items: mapped
        };
    }

    async searchRemoteResources(keyword, options = {}) {
        const query = String(keyword || '').trim().toLowerCase();
        if (!query) {
            return [];
        }

        const subscriptions = await this.subscriptionRepo.find({
            where: { enabled: true },
            order: { id: 'DESC' }
        });

        const limit = Math.max(1, Math.min(20, Number(options.limit || 10)));
        const pageSize = Math.max(limit, 50);
        const matched = [];

        for (const subscription of subscriptions) {
            const firstPage = await this.listRemoteResources(subscription.id, { pageNum: 1, pageSize });
            const items = Array.isArray(firstPage.items) ? firstPage.items : [];
            for (const item of items) {
                const title = String(item.title || '').toLowerCase();
                if (!title.includes(query)) {
                    continue;
                }
                matched.push({
                    ...item,
                    subscriptionId: subscription.id,
                    subscriptionName: subscription.name,
                    subscriptionUuid: subscription.uuid
                });
                if (matched.length >= limit) {
                    return matched;
                }
            }
        }

        return matched;
    }

    async createResource(subscriptionId, data) {
        await this._ensureSubscription(subscriptionId);
        const account = await this._getAvailableAccount();
        const shareData = await this._resolveShare(data.shareLink, data.accessCode, account);
        const duplicate = await this.resourceRepo.findOneBy({
            subscriptionId,
            shareLink: shareData.shareLink
        });
        if (duplicate) {
            throw new Error('该分享链接已经存在');
        }

        const resource = this.resourceRepo.create({
            subscriptionId,
            title: data.title?.trim() || shareData.shareInfo.fileName,
            shareLink: shareData.shareLink,
            accessCode: shareData.accessCode || '',
            shareId: shareData.shareInfo.shareId,
            shareMode: shareData.shareInfo.shareMode,
            shareFileId: shareData.shareInfo.fileId,
            shareFileName: shareData.shareInfo.fileName,
            isFolder: !!shareData.shareInfo.isFolder,
            verifyStatus: 'unknown',
            lastVerifyError: '',
            availableAccountIds: '',
            verifyDetails: ''
        });
        const savedResource = await this.resourceRepo.save(resource);
        await this.refreshSubscription(subscriptionId);
        const refreshedResource = await this.resourceRepo.findOneBy({ id: savedResource.id });
        return refreshedResource || savedResource;
    }

    async updateResource(id, data) {
        const resource = await this.resourceRepo.findOneBy({ id });
        if (!resource) {
            throw new Error('资源不存在');
        }

        if (data.title !== undefined) {
            resource.title = data.title?.trim() || resource.title;
        }

        if (data.shareLink !== undefined || data.accessCode !== undefined) {
            const account = await this._getAvailableAccount();
            const shareData = await this._resolveShare(
                data.shareLink ?? resource.shareLink,
                data.accessCode ?? resource.accessCode,
                account
            );
            resource.shareLink = shareData.shareLink;
            resource.accessCode = shareData.accessCode || '';
            resource.shareId = shareData.shareInfo.shareId;
            resource.shareMode = shareData.shareInfo.shareMode;
            resource.shareFileId = shareData.shareInfo.fileId;
            resource.shareFileName = shareData.shareInfo.fileName;
            resource.isFolder = !!shareData.shareInfo.isFolder;
            if (!data.title?.trim()) {
                resource.title = resource.title || shareData.shareInfo.fileName;
            }
        }

        const savedResource = await this.resourceRepo.save(resource);
        await this.refreshSubscription(resource.subscriptionId);
        const refreshedResource = await this.resourceRepo.findOneBy({ id: savedResource.id });
        return refreshedResource || savedResource;
    }

    async deleteResource(id) {
        const resource = await this.resourceRepo.findOneBy({ id });
        if (!resource) {
            throw new Error('资源不存在');
        }
        const { subscriptionId } = resource;
        await this.resourceRepo.remove(resource);
        await this._refreshSubscriptionSummary(subscriptionId);
    }

    async refreshSubscription(subscriptionId) {
        const subscription = await this._ensureSubscription(subscriptionId);
        await logTaskEvent(`开始刷新订阅[${subscription.name}]，UUID=${subscription.uuid}`, 'info', 'subscription');
        await this._syncRemoteResources(subscription);
        const resources = await this.resourceRepo.find({
            where: { subscriptionId },
            order: { id: 'DESC' }
        });
        const accounts = await this._getAvailableAccounts();
        const allAvailableAccountIds = new Set();
        let validResourceCount = 0;
        let invalidResourceCount = 0;
        const failedResources = [];

        for (const resource of resources) {
            const result = await this._validateResourceAgainstAccounts(resource, accounts);
            result.availableAccountIds.forEach(id => allAvailableAccountIds.add(id));
            if (result.verifyStatus === 'valid') {
                validResourceCount += 1;
            } else {
                invalidResourceCount += 1;
                failedResources.push(`${resource.title}: ${result.lastVerifyError || '校验失败'}`);
            }
        }

        subscription.lastRefreshTime = new Date();
        subscription.validResourceCount = validResourceCount;
        subscription.invalidResourceCount = invalidResourceCount;
        subscription.availableAccountCount = allAvailableAccountIds.size;
        subscription.totalAccountCount = accounts.length;
        if (!resources.length) {
            subscription.lastRefreshStatus = 'success';
            subscription.lastRefreshMessage = '暂无订阅资源，已更新账号状态';
        } else if (invalidResourceCount > 0) {
            subscription.lastRefreshStatus = validResourceCount > 0 ? 'warning' : 'failed';
            subscription.lastRefreshMessage = failedResources.slice(0, 3).join(' | ');
        } else {
            subscription.lastRefreshStatus = 'success';
            subscription.lastRefreshMessage = `全部 ${validResourceCount} 个资源校验成功`;
        }
        await this.subscriptionRepo.save(subscription);
        await logTaskEvent(`订阅[${subscription.name}]校验完成: 可用 ${validResourceCount}，异常 ${invalidResourceCount}，账号覆盖 ${allAvailableAccountIds.size}/${accounts.length}`, invalidResourceCount > 0 ? 'warn' : 'info', 'subscription');
        return {
            subscriptionId,
            validResourceCount,
            invalidResourceCount,
            availableAccountCount: allAvailableAccountIds.size,
            totalAccountCount: accounts.length,
            failedResources
        };
    }

    async syncSubscriptionResources(subscriptionId) {
        const subscription = await this._ensureSubscription(subscriptionId);
        return await this._syncRemoteResources(subscription);
    }

    async browseResource(resourceId, folderId, keyword = '') {
        const resource = await this.resourceRepo.findOneBy({ id: resourceId });
        if (!resource) {
            throw new Error('资源不存在');
        }

        const account = await this._getAvailableAccount();
        const cloud189 = Cloud189Service.getInstance(account);
        const currentFolderId = folderId || resource.shareFileId;
        const isRoot = currentFolderId === resource.shareFileId;

        if (!resource.isFolder) {
            return [{
                id: resource.shareFileId,
                name: resource.title || resource.shareFileName,
                type: 'file',
                isFolder: false,
                canSave: true,
                currentFolderId
            }];
        }

        const resp = await cloud189.listShareDir(
            resource.shareId,
            currentFolderId,
            resource.shareMode,
            resource.accessCode
        );

        if (!resp?.fileListAO) {
            return [];
        }

        const normalizedKeyword = keyword?.trim().toLowerCase();
        const folderList = (resp.fileListAO.folderList || []).map(folder => ({
            id: folder.id,
            name: folder.name,
            type: 'folder',
            isFolder: true,
            canSave: isRoot,
            currentFolderId
        }));
        const fileList = (resp.fileListAO.fileList || []).map(file => ({
            id: file.id,
            name: file.name,
            type: 'file',
            isFolder: false,
            canSave: false,
            size: file.size,
            lastOpTime: file.lastOpTime,
            currentFolderId
        }));

        const entries = [...folderList, ...fileList];
        if (!normalizedKeyword) {
            return entries;
        }
        return entries.filter(entry => entry.name.toLowerCase().includes(normalizedKeyword));
    }

    async _ensureSubscription(id) {
        const subscription = await this.subscriptionRepo.findOneBy({ id });
        if (!subscription) {
            throw new Error('订阅不存在');
        }
        return subscription;
    }

    async _syncRemoteResources(subscription) {
        const account = await this._getAvailableAccount();
        const cloud189 = Cloud189Service.getInstance(account);
        const pageSize = 100;
        const remoteResources = [];
        let pageNum = 1;
        let totalCount = 0;

        await logTaskEvent(`开始同步订阅资源: ${subscription.name} (${subscription.uuid})，使用账号 ${account.alias?.trim() || account.username}`, 'info', 'subscription');

        do {
            const result = await cloud189.request('https://api.cloud.189.cn/open/share/getUpResourceShare.action', {
                method: 'GET',
                searchParams: {
                    iconOption: 5,
                    pageNum,
                    pageSize,
                    upUserId: subscription.uuid
                }
            });

            if (!result || result.code !== 'success') {
                const message = result?.message || result?.msg || result?.errorMsg || '获取订阅资源失败';
                await logTaskEvent(`订阅资源同步失败: ${subscription.name} (${subscription.uuid}) 第 ${pageNum} 页拉取失败: ${message}`, 'error', 'subscription');
                throw new Error(message);
            }

            const data = result.data || {};
            const fileList = Array.isArray(data.fileList) ? data.fileList : [];
            totalCount = Number(data.count || fileList.length || 0);
            remoteResources.push(...fileList);
            await logTaskEvent(`订阅资源分页拉取成功: ${subscription.name} 第 ${pageNum} 页 ${fileList.length} 条，累计 ${remoteResources.length}/${totalCount || remoteResources.length}`, 'info', 'subscription');
            if (!fileList.length) {
                break;
            }
            pageNum += 1;
        } while (remoteResources.length < totalCount);

        const existingResources = await this.resourceRepo.find({
            where: { subscriptionId: subscription.id }
        });
        const existingMap = new Map(existingResources.map(resource => [resource.shareLink, resource]));

        let importedCount = 0;
        for (const item of remoteResources) {
            const shareCode = String(item?.accessURL || '').trim();
            if (!shareCode) {
                continue;
            }
            const shareLink = `https://cloud.189.cn/web/share?code=${encodeURIComponent(shareCode)}`;
            const current = existingMap.get(shareLink);
            if (current) {
                current.title = item.name?.trim() || current.title;
                current.shareId = item.shareId ? String(item.shareId) : current.shareId;
                current.shareMode = item.shareType ? String(item.shareType) : current.shareMode;
                current.shareFileId = item.id ? String(item.id) : current.shareFileId;
                current.shareFileName = item.name?.trim() || current.shareFileName;
                current.isFolder = item.folder !== undefined ? !!item.folder : current.isFolder;
                await this.resourceRepo.save(current);
                continue;
            }

            const resource = this.resourceRepo.create({
                subscriptionId: subscription.id,
                title: item.name?.trim() || `资源-${shareCode}`,
                shareLink,
                accessCode: '',
                shareId: item.shareId ? String(item.shareId) : '',
                shareMode: item.shareType ? String(item.shareType) : '',
                shareFileId: item.id ? String(item.id) : '',
                shareFileName: item.name?.trim() || '',
                isFolder: item.folder !== undefined ? !!item.folder : true,
                verifyStatus: 'unknown',
                lastVerifyError: '',
                availableAccountIds: '',
                verifyDetails: ''
            });
            await this.resourceRepo.save(resource);
            importedCount += 1;
        }

        subscription.lastRefreshStatus = remoteResources.length ? 'unknown' : 'success';
        subscription.lastRefreshMessage = remoteResources.length
            ? `已同步 ${remoteResources.length} 条订阅资源，等待校验`
            : '未获取到订阅资源';
        await this.subscriptionRepo.save(subscription);
        await logTaskEvent(`订阅资源同步完成: ${subscription.name} 共拉取 ${remoteResources.length} 条，新增 ${importedCount} 条，本地已存在 ${remoteResources.length - importedCount} 条`, 'info', 'subscription');

        return {
            totalCount: remoteResources.length,
            importedCount
        };
    }

    async _getAvailableAccounts() {
        return await this.accountRepo.find({
            order: {
                isDefault: 'DESC',
                id: 'ASC'
            }
        });
    }

    async _getAvailableAccount() {
        const defaultAccount = await this.accountRepo.findOneBy({ isDefault: true });
        if (defaultAccount) {
            return defaultAccount;
        }
        const [account] = await this.accountRepo.find({
            order: { id: 'ASC' },
            take: 1
        });
        if (!account) {
            throw new Error('请先添加账号');
        }
        return account;
    }

    async _decorateResources(resources) {
        if (!resources.length) {
            return resources;
        }
        const accounts = await this._getAvailableAccounts();
        const accountMap = new Map(accounts.map(account => [
            account.id,
            account.alias?.trim() || account.username
        ]));
        return resources.map(resource => {
            let availableAccounts = [];
            let verifyDetails = [];
            try {
                const ids = resource.availableAccountIds ? JSON.parse(resource.availableAccountIds) : [];
                if (Array.isArray(ids)) {
                    availableAccounts = ids.map(id => ({
                        id,
                        name: accountMap.get(Number(id)) || `账号${id}`
                    }));
                }
            } catch (error) {
                availableAccounts = [];
            }
            try {
                const details = resource.verifyDetails ? JSON.parse(resource.verifyDetails) : [];
                if (Array.isArray(details)) {
                    verifyDetails = details;
                }
            } catch (error) {
                verifyDetails = [];
            }
            return {
                ...resource,
                availableAccounts,
                verifyDetails
            };
        });
    }

    async _validateResourceAgainstAccounts(resource, accounts) {
        const availableAccountIds = [];
        const errors = [];
        const verifyDetails = [];
        let shareData = null;

        for (const account of accounts) {
            try {
                const result = await this._resolveShare(resource.shareLink, resource.accessCode, account);
                availableAccountIds.push(account.id);
                verifyDetails.push({
                    accountId: account.id,
                    accountName: account.alias?.trim() || account.username,
                    status: 'valid',
                    error: ''
                });
                if (!shareData) {
                    shareData = result;
                }
            } catch (error) {
                const accountName = account.alias?.trim() || account.username;
                errors.push(`${accountName}: ${error.message}`);
                verifyDetails.push({
                    accountId: account.id,
                    accountName,
                    status: 'invalid',
                    error: error.message
                });
            }
        }

        const originalShareFileName = resource.shareFileName;
        if (shareData) {
            resource.shareLink = shareData.shareLink;
            resource.accessCode = shareData.accessCode || '';
            resource.shareId = shareData.shareInfo.shareId;
            resource.shareMode = shareData.shareInfo.shareMode;
            resource.shareFileId = shareData.shareInfo.fileId;
            resource.shareFileName = shareData.shareInfo.fileName;
            resource.isFolder = !!shareData.shareInfo.isFolder;
            if (!resource.title || resource.title === originalShareFileName) {
                resource.title = shareData.shareInfo.fileName;
            }
        }

        resource.verifyStatus = availableAccountIds.length > 0 ? 'valid' : 'invalid';
        resource.lastVerifiedAt = new Date();
        resource.lastVerifyError = availableAccountIds.length > 0 ? '' : (errors[0] || '资源校验失败');
        resource.availableAccountIds = JSON.stringify(availableAccountIds);
        resource.verifyDetails = JSON.stringify(verifyDetails);
        await this.resourceRepo.save(resource);

        return {
            verifyStatus: resource.verifyStatus,
            availableAccountIds,
            lastVerifyError: resource.lastVerifyError,
            verifyDetails
        };
    }

    async _refreshSubscriptionSummary(subscriptionId) {
        const subscription = await this._ensureSubscription(subscriptionId);
        const resources = await this.resourceRepo.find({
            where: { subscriptionId }
        });
        let validResourceCount = 0;
        let invalidResourceCount = 0;
        const availableAccountIds = new Set();

        resources.forEach(resource => {
            if (resource.verifyStatus === 'valid') {
                validResourceCount += 1;
            }
            if (resource.verifyStatus === 'invalid') {
                invalidResourceCount += 1;
            }
            try {
                const ids = resource.availableAccountIds ? JSON.parse(resource.availableAccountIds) : [];
                if (Array.isArray(ids)) {
                    ids.forEach(id => availableAccountIds.add(id));
                }
            } catch (error) {
                // ignore malformed historical data
            }
        });

        const accounts = await this._getAvailableAccounts();
        subscription.validResourceCount = validResourceCount;
        subscription.invalidResourceCount = invalidResourceCount;
        subscription.availableAccountCount = availableAccountIds.size;
        subscription.totalAccountCount = accounts.length;
        await this.subscriptionRepo.save(subscription);
    }

    async _resolveShare(shareLink, accessCode, account) {
        if (!shareLink?.trim()) {
            throw new Error('分享链接不能为空');
        }
        const { url, accessCode: parsedAccessCode } = cloud189Utils.parseCloudShare(shareLink.trim());
        if (!url) {
            throw new Error('无效的分享链接');
        }
        const finalAccessCode = accessCode?.trim() || parsedAccessCode || '';
        const shareCode = cloud189Utils.parseShareCode(url);
        const cloud189 = Cloud189Service.getInstance(account);
        const shareInfo = await cloud189.getShareInfo(shareCode);

        if (!shareInfo) {
            throw new Error('获取分享信息失败');
        }
        if (shareInfo.shareMode == 1) {
            if (!finalAccessCode) {
                throw new Error('分享链接为私密链接, 请输入访问码');
            }
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, finalAccessCode);
            if (!accessCodeResponse?.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        if (!shareInfo.shareId) {
            throw new Error('获取分享信息失败');
        }
        return {
            shareLink: url,
            accessCode: finalAccessCode,
            shareInfo
        };
    }
}

module.exports = { SubscriptionService };
