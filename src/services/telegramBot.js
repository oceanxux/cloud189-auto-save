const TelegramBot = require('node-telegram-bot-api');
const { AppDataSource } = require('../database');
const { Task, Account, CommonFolder } = require('../entities');
const { TaskService } = require('./task');
const { EmbyService } = require('./emby');
const { Cloud189Service } = require('./cloud189');
const { TMDBService } = require('./tmdb');
const { AutoSeriesService } = require('./autoSeries');
const { OrganizerService } = require('./organizer');
const path = require('path');
const { default: cloudSaverSDK } = require('../sdk/cloudsaver/sdk');
const ProxyUtil = require('../utils/ProxyUtil');
const cloud189Utils = require('../utils/Cloud189Utils');
const { LazyShareStrmService } = require('./lazyShareStrm');

class TelegramBotService {
    constructor(token, chatId, proxyDomain) {
        this.token = token;
        this.chatId = chatId;
        this.proxyDomain = proxyDomain || '';
        this.accountRepo = AppDataSource.getRepository(Account);
        this.commonFolderRepo = AppDataSource.getRepository(CommonFolder);
        this.taskRepo = AppDataSource.getRepository(Task);
        this.taskService = new TaskService(this.taskRepo, this.accountRepo);
        this.organizerService = new OrganizerService(this.taskService, this.taskRepo);
        this.lazyShareStrmService = new LazyShareStrmService(this.accountRepo, this.taskService);
        this.autoSeriesService = new AutoSeriesService(this.taskService, this.accountRepo, this.lazyShareStrmService);
        this.currentAccountId = null;
        this.currentAccount = null;
        this.currentShareLink = null;
        this.currentAccessCode = null;
        this.lastButtonMessageId = null;  // 上次按钮消息
        this.currentFolderPath = '';  // 当前路径
        this.currentFolderId = '-11';  // 当前文件夹ID
        this.folders = new Map();
        this.parentFolderIds = new Set();

        // 全局任务列表消息id
        this.globalTaskListMessageId = null;
        // 全局常用目录列表消息id
        this.globalCommonFolderListMessageId = null;

        this.cloudSaverSdk = cloudSaverSDK;
        this.isSearchMode = false;
        this.searchModeTimeout = null;  // 搜索模式超时计时器

        this.cloudSaverSearchMap = new Map();

        this.tmdbService = new TMDBService();

        // 批量重命名状态机
        // step: null | 'folder' | 'tmdb' | 'confirm'
        this.renameState = {
            step: null,
            folderId: null,
            folderPath: '',
            tmdbResults: [],       // TMDB 搜索结果列表
            selectedTitle: null,   // 最终确定的剧名
            plans: [],             // [{ fileId, oldName, newName }]
        };
    }

    async start() {
        if (this.bot) {
            return;
        }
        // 从配置文件获取代理
        const proxy = ProxyUtil.getProxy('telegram');
        const botOptions = {
            polling: true,
            request: {
                proxy: proxy,
                agentOptions: {
                    keepAlive: true,
                    family: 4,
                    timeout: 30000
                },
                timeout: 30000,
                forever: true,
                retries: 3
            }
        };
        if (this.proxyDomain) {
            botOptions.baseApiUrl = `https://${this.proxyDomain}`;
        }
        this.bot = new TelegramBot(this.token, botOptions);

        // 添加错误处理
        this.bot.on('polling_error', (error) => {
            console.error('Telegram Bot polling error:', error.message);
        });

        this.bot.on('error', (error) => {
            console.error('Telegram Bot error:', error.message);
        });

        // 设置命令菜单
        await this.bot.setMyCommands([
            { command: 'help', description: '帮助信息' },
            { command: 'search_cs', description: '搜索CloudSaver资源' },
            { command: 'series', description: '自动追剧(正常任务)' },
            { command: 'lazy_series', description: '自动追剧(懒转存STRM)' },
            { command: 'accounts', description: '账号列表' },
            { command: 'tasks', description: '任务列表' },
            { command: 'execute_all', description: '执行所有任务' },
            { command: 'organize', description: '执行任务整理' },
            { command: 'fl', description: '常用目录列表' },
            { command: 'fs', description: '添加常用目录' },
            { command: 'rename', description: '批量剧集重命名' },
            { command: 'cancel', description: '取消当前操作' }
        ]);
        // 从数据库中加载默认的账号
        const account = await this.accountRepo.findOne({
            where: { tgBotActive: true }
        });
        this.currentAccount = account;
        this.currentAccountId = account?.id;
        this.initCommands();
        return true;
    }

    async stop() {
        if (!this.bot) {
            return;
        }
        try {
            // 发送机器人停止消息
            await this.bot.stopPolling();
            this.bot = null;
            // 清理状态
            this.currentAccountId = null;
            this.currentAccount = null;
            this.currentShareLink = null;
            this.currentAccessCode = null;
            this.lastButtonMessageId = null;
            this.currentFolderPath = '';
            this.currentFolderId = '-11';
            this.folders.clear();
            this.parentFolderIds.clear();
            this.globalTaskListMessageId = null;
            this.globalCommonFolderListMessageId = null;
            return true;
        } catch (error) {
            console.error('停止机器人失败:', error);
            return false;
        }
    }

    initCommands() {
        this.bot.onText(/\/help/, async (msg) => {
            const helpText =
                '🤖 天翼云盘机器人使用指南\n\n' +
                '📋 基础命令：\n' +
                '/help - 显示帮助信息\n' +
                '/accounts - 账号列表与切换\n' +
                '/tasks - 显示下载任务列表\n' +
                '/fl - 显示常用目录列表\n' +
                '/fs - 添加常用目录\n' +
                '/search_cs - 搜索CloudSaver资源\n' +
                '/series 剧名 [年份] - 自动追剧(正常任务)\n' +
                '/lazy_series 剧名 [年份] - 自动追剧(懒转存STRM)\n' +
                '/cancel - 取消当前操作\n\n' +
                '📥 创建任务：\n' +
                '直接发送天翼云盘分享链接即可创建任务\n' +
                '格式：链接（支持访问码的链接）\n\n' +
                '🎬 自动追剧：\n' +
                '1. /series 北上 2025\n' +
                '2. /lazy_series 北上 2025\n' +
                '3. 使用系统页里配置的默认账号与默认目录\n\n' +
                '📝 任务操作：\n' +
                '/execute_[ID] - 执行指定任务\n' +
                '/execute_all - 执行所有任务\n' +
                '/organize_[ID] - 执行指定任务整理\n' +
                '/strm_[ID] - 生成STRM文件\n' +
                '/emby_[ID] - 通知Emby刷新\n' +
                '/dt_[ID] - 删除指定任务\n' +
                '/df_[ID] - 删除指定常用目录\n\n' +
                '🔍 资源搜索：\n' +
                '1. 输入 /search_cs 进入搜索模式\n' +
                '2. 直接输入关键字搜索资源\n' +
                '3. 点击搜索结果中的链接可复制\n' +
                '4. 输入 /cancel 退出搜索模式';

            await this.bot.sendMessage(msg.chat.id, helpText);
        });


        this.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) {
                return;
            }
            // 忽略命令消息
            if (msg.text?.startsWith('/')) return;

            // ── 批量重命名状态机 ──
            if (this.renameState.step === 'tmdb') {
                await this._handleRenameInput(chatId, msg.text?.trim());
                return;
            }

            // 搜索模式下处理消息
            if (this.isSearchMode) {
                const input = msg.text?.trim();
                // 判断是否为纯数字
                if (/^\d+$/.test(input)) {
                    const index = parseInt(input);
                    const cacheShareLink = this.cloudSaverSearchMap.get(index);
                    if (!cacheShareLink) {
                        this.bot.sendMessage(chatId, '无效的编号');
                        return;
                    }
                    try {
                        const { url: shareLink, accessCode } = cloud189Utils.parseCloudShare(cacheShareLink);
                        // 处理分享链接
                        await this.handleFolderSelection(chatId, shareLink, null, accessCode);
                        return
                    } catch (e) {
                        this.bot.sendMessage(chatId, `处理失败: ${e.message}`);
                        return;
                    }
                }
                this.cloudSaverSearch(chatId, msg)
            }
        });

        this.bot.onText(/cloud\.189\.cn/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) {
                return;
            }
            // 如果处于搜索模式，则不处理
            if (this.isSearchMode) {
                return;
            }
            try {
                if (!this._checkUserId(chatId)) return;
                const { url: shareLink, accessCode } = cloud189Utils.parseCloudShare(msg.text);
                await this.handleFolderSelection(chatId, shareLink, null, accessCode);
            } catch (error) {
                console.log(error)
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });


        // 添加账号列表命令
        this.bot.onText(/\/accounts/, async (msg) => {
            await this.showAccounts(msg.chat.id);
        });

        // 添加任务列表命令
        this.bot.onText(/\/tasks/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showTasks(msg.chat.id);
        });

        // 添加常用目录查询命令
        this.bot.onText(/\/fl$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showCommonFolders(chatId);
        });

        this.bot.onText(/\/fs$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showFolderTree(chatId);
        });

        // 执行任务
        this.bot.onText(/^\/execute_(\d+)$/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkTaskId(taskId)) return;
            const message = await this.bot.sendMessage(chatId, `任务开始执行`);
            try {
                await this.taskService.processAllTasks(true, [taskId])
                this.bot.deleteMessage(chatId, message.message_id);
                await this.bot.sendMessage(chatId, `任务执行完成`);
            } catch (e) {
                await this.bot.editMessageText(`任务执行失败: ${e.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
                return;
            }
        })

        // 执行所有任务
        this.bot.onText(/^\/execute_all$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            const message = await this.bot.sendMessage(chatId, `开始执行所有任务...`);
            try {
                await this.taskService.processAllTasks(true);
                this.bot.editMessageText("所有任务执行完成", {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            } catch (e) {
                await this.bot.editMessageText(`任务执行失败: ${e.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            }
        });

        this.bot.onText(/^\/organize$/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return
            await this.showOrganizerTasks(chatId);
        });

        this.bot.onText(/^\/organize_(\d+)$/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkTaskId(taskId)) return;
            const message = await this.bot.sendMessage(chatId, '开始执行整理...');
            try {
                const result = await this.organizerService.organizeTaskById(taskId, {
                    triggerStrm: true,
                    force: true
                });
                await this.bot.editMessageText(result?.message || '整理完成', {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            } catch (e) {
                await this.bot.editMessageText(`整理失败: ${e.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            }
        });

        // 生成strm
        this.bot.onText(/\/strm_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始生成strm...');
            try {
                this.taskService._createStrmFileByTask(task, false);
            } catch (e) {
                await this.bot.sendMessage(chatId, `生成strm失败: ${e.message}`);
                return;
            }
            // 删除消息
            await this.bot.deleteMessage(chatId, message.message_id);
        })
        // 通知emby
        this.bot.onText(/\/emby_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始通知emby...');
            try {
                const embyService = new EmbyService(this.taskService)
                await embyService.notify(task)
                // 删除消息
                await this.bot.deleteMessage(chatId, msg.message_id);
            } catch (e) {
                await this.bot.sendMessage(chatId, `通知失败: ${e.message}`);
                return;
            }
        })
        // 添加删除任务命令
        this.bot.onText(/\/dt_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if (!this._checkChatId(chatId)) return
            const keyboard = [
                [
                    { text: '是', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: true }) },
                    { text: '否', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: false }) }
                ],
                [{ text: '取消', callback_data: JSON.stringify({ t: 'dt', c: false }) }]
            ];
            await this.bot.sendMessage(chatId, '是否同步删除网盘文件？', {
                reply_markup: { inline_keyboard: keyboard }
            });
        });

        // 删除常用目录
        this.bot.onText(/\/df_(-?\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const folderId = match[1];
            if (!this._checkChatId(chatId)) return
            if (!this._checkUserId(chatId)) return

            try {
                await this.commonFolderRepo.delete({
                    id: folderId,
                    accountId: this.currentAccountId
                });
                await this.bot.sendMessage(chatId, '删除成功');
                await this.showCommonFolders(chatId);
            } catch (error) {
                await this.bot.sendMessage(chatId, `删除失败: ${error.message}`);
            }
        });

        // 搜索CloudSaver命令
        this.bot.onText(/\/search_cs/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            if (this.isSearchMode) {
                await this.bot.sendMessage(chatId, '当前已处于搜索模式, 请直接输入关键字搜索资源\n输入 /cancel 退出搜索模式');
                return;
            }
            if (!this._checkUserId(chatId)) return;
            // 判断用户是否开启了CloudSaver
            if (!this.cloudSaverSdk.enabled) {
                await this.bot.sendMessage(chatId, '未开启CloudSaver, 请先在网页端配置CloudSaver');
                return;
            }
            this.isSearchMode = true;
            // 设置3分钟超时
            this._resetSearchModeTimeout(chatId);
            await this.bot.sendMessage(chatId, '已进入搜索模式，请输入关键字搜索资源\n输入 /cancel 退出搜索模式\n3分钟内未搜索将自动退出搜索模式');
        });

        this.bot.onText(/^\/series(?:\s+(.+))?$/i, async (msg, match) => {
            await this.handleAutoSeriesCommand(msg, match?.[1], 'normal');
        });

        this.bot.onText(/^\/lazy_series(?:\s+(.+))?$/i, async (msg, match) => {
            await this.handleAutoSeriesCommand(msg, match?.[1], 'lazy');
        });

        this.bot.onText(/\/cancel/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return
            // 清除缓存
            this.currentShareLink = null;
            this.currentAccessCode = null;
            this.isSearchMode = false;  // 退出搜索模式
            this._resetRenameState();  // 退出重命名模式
            try {
                if (this.lastButtonMessageId) {
                    await this.bot.deleteMessage(chatId, this.lastButtonMessageId);
                    this.lastButtonMessageId = null;
                }
            } catch (error) {
                console.error('删除消息失败:', error);
            }

            await this.bot.sendMessage(chatId, '已取消当前操作');
        });

        // 批量重命名命令
        this.bot.onText(/\/rename/, async (msg) => {
            const chatId = msg.chat.id;
            if (!this._checkChatId(chatId)) return;
            if (!this._checkUserId(chatId)) return;
            this._resetRenameState();
            this.renameState.step = 'folder';
            // 复用 showFolderTree，但"确认"按钮走重命名流程
            await this._showRenameFolderTree(chatId);
        });

        // 修改回调处理
        this.bot.on('callback_query', async (callbackQuery) => {
            const data = JSON.parse(callbackQuery.data);
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            try {
                switch (data.t) {
                    case 'f': // 文件夹选择
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'of': // 覆盖文件夹
                        if (!data.o) {
                            await this.bot.editMessageText("已取消任务创建", {
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'sa': // 设置当前账号
                        await this.setCurrentAccount(chatId, data, messageId);
                        break;
                    case 'tp': // 任务分页
                        await this.showTasks(chatId, data.p, messageId);
                        break;
                    case 'dt': // 删除任务
                        if (!data.c) {
                            await this.bot.editMessageText("已取消删除", {
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.deleteTask(chatId, data, messageId);
                        break;
                    case 'fd': // 进入下一级目录
                        if (this.renameState.step === 'folder') {
                            await this._showRenameFolderTree(chatId, data, messageId);
                        } else {
                            await this.showFolderTree(chatId, data, messageId);
                        }
                        break;
                    case 'fc': // 取消操作
                        if (this.renameState.step === 'folder') {
                            this._resetRenameState();
                        }
                        await this.bot.deleteMessage(chatId, messageId);
                        break;
                    case 'fs': // 保存当前目录
                        await this.saveFolderAsFavorite(chatId, data, messageId);
                        break;
                    case 'rn_folder': // 重命名：确认文件夹
                        await this._onRenameFolderConfirm(chatId, data, messageId);
                        break;
                    case 'rn_pick': // 重命名：从TMDB结果选择
                        await this._onRenameTmdbPick(chatId, data, messageId);
                        break;
                    case 'rn_confirm': // 重命名：最终执行确认
                        await this._onRenameExecute(chatId, messageId);
                        break;
                    case 'rn_cancel': // 重命名：取消
                        this._resetRenameState();
                        await this.bot.editMessageText('已取消重命名', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                        break;
                }
            } catch (error) {
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });



        // 添加TMDB搜索命令
        this.bot.onText(/\/tmdb (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const input = match[1];
            if (!this._checkChatId(chatId)) return
            let title, year;

            // 解析输入的标题和年份
            const yearMatch = input.match(/^(.+?)(?:\s+(\d{4}))?$/);
            if (yearMatch) {
                title = yearMatch[1].trim();
                year = yearMatch[2];
            }

            const message = await this.bot.sendMessage(chatId, '正在搜索...');
            try {
                const results = await this.tmdbService.search(title, year);
                let responseText = '';
                console.log('搜索结束')
                // 先发送海报图片
                const firstPoster = results.movies[0]?.posterPath || results.tvShows[0]?.posterPath;

                if (results.movies.length > 0) {
                    responseText += '📽 电影：\n\n';
                    results.movies.forEach(movie => {
                        const shortOverview = movie.overview ?
                            (movie.overview.length > 20 ? movie.overview.substring(0, 20) + '...' : movie.overview) :
                            '暂无';

                        responseText += `标题：${movie.title}\n` +
                            `原标题：${movie.originalTitle}\n` +
                            `上映日期：${movie.releaseDate}\n` +
                            `评分：${movie.voteAverage}\n` +
                            `简介：${shortOverview}\n\n`;
                    });
                }

                if (results.tvShows.length > 0) {
                    responseText += '📺 剧集：\n\n';
                    results.tvShows.forEach(show => {
                        const shortOverview = show.overview ?
                            (show.overview.length > 20 ? show.overview.substring(0, 20) + '...' : show.overview) :
                            '暂无';

                        responseText += `标题：${show.title}\n` +
                            `原标题：${show.originalTitle}\n` +
                            `首播日期：${show.releaseDate}\n` +
                            `评分：${show.voteAverage}\n` +
                            `简介：${shortOverview}\n\n`;
                    });
                }

                if (!results.movies.length && !results.tvShows.length) {
                    responseText = '未找到相关影视信息';
                }
                console.log('获取到的海报', firstPoster)
                this.bot.deleteMessage(chatId, message.message_id);
                this.bot.sendPhoto(chatId, firstPoster, {
                    caption: responseText,
                    parse_mode: 'HTML'
                });
            } catch (error) {
                await this.bot.editMessageText(`搜索失败: ${error.message}`, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
            }
        });
    }

    async showAccounts(chatId, messageId = null) {
        if (!this._checkChatId(chatId)) {
            return;
        }
        const accounts = await this.accountRepo.find();
        const keyboard = accounts.map(account => [{
            text: `${account.username.slice(0, 3)}***${account.username.slice(-3)} ${account.id === this.currentAccountId ? '✅' : ''}`,
            callback_data: JSON.stringify({ t: 'sa', i: account.id, a: `${account.username.slice(0, 3)}***${account.username.slice(-3)}` })
        }]);

        const message = '账号列表 (✅表示当前选中账号):';
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async showTasks(chatId, page = 1, messageId = null) {
        const pageSize = 5;
        const skip = (page - 1) * pageSize;

        const [tasks, total] = await this.taskRepo.findAndCount({
            order: { updatedAt: 'DESC' },
            take: pageSize,
            skip: skip
        });

        const totalPages = Math.ceil(total / pageSize);

        const taskList = tasks.map(task =>
            `📺 ${this._getDisplayTaskName(task)}\n` +
            `⏱ 进度：${task.currentEpisodes}${task.totalEpisodes ? '/' + task.totalEpisodes : ''} 集\n` +
            `🔄 状态：${this.formatStatus(task.status)}\n` +
            `⌚️ 更新：${new Date(task.lastFileUpdateTime).toLocaleString('zh-CN')}\n` +
            `📁 执行: /execute_${task.id}\n` +
            `🗂 整理：/organize_${task.id}\n` +
            `📁 STRM：/strm_${task.id}\n` +
            `🎬 Emby：/emby_${task.id}\n` +
            `❌ 删除: /dt_${task.id}`
        ).join('\n\n');

        const keyboard = [];

        // 添加分页按钮
        if (totalPages > 1) {
            const pageButtons = [];
            if (page > 1) {
                pageButtons.push({
                    text: '⬅️',
                    callback_data: JSON.stringify({ t: 'tp', p: page - 1 })
                });
            }
            pageButtons.push({
                text: `${page}/${totalPages}`,
                callback_data: JSON.stringify({ t: 'tp', p: page })
            });
            if (page < totalPages) {
                pageButtons.push({
                    text: '➡️',
                    callback_data: JSON.stringify({ t: 'tp', p: page + 1 })
                });
            }
            keyboard.push(pageButtons);
        }

        const message = tasks.length > 0 ?
            `📋 任务列表 (第${page}页):\n\n${taskList}` :
            '📭 暂无任务';

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            // 先删除之前的消息
            if (this.globalTaskListMessageId) {
                await this.bot.deleteMessage(chatId, this.globalTaskListMessageId);
            }
            const newMessage = await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
            this.globalTaskListMessageId = newMessage.message_id;
        }
    }

    async showOrganizerTasks(chatId) {
        const tasks = await this.taskRepo.find({
            where: {
                enableOrganizer: true
            },
            order: { updatedAt: 'DESC' },
            take: 10
        });

        if (!tasks.length) {
            await this.bot.sendMessage(chatId, '当前没有启用整理器的任务');
            return;
        }

        const lines = tasks.map(task =>
            `📺 ${this._getDisplayTaskName(task)}\n` +
            `🗂 /organize_${task.id}\n` +
            `⌚️ 最近整理：${task.lastOrganizedAt ? new Date(task.lastOrganizedAt).toLocaleString('zh-CN') : '从未执行'}${task.lastOrganizeError ? `\n⚠️ ${task.lastOrganizeError}` : ''}`
        );

        await this.bot.sendMessage(chatId, `整理器任务列表：\n\n${lines.join('\n\n')}`);
    }

    formatStatus(status) {
        const statusMap = {
            'pending': '⏳ 等待执行',
            'processing': '🔄 追剧中',
            'completed': '✅ 已完结',
            'failed': '❌ 失败'
        };
        return statusMap[status] || status;
    }

    async setCurrentAccount(chatId, data, messageId) {
        try {
            const accountId = data.i;
            if (this.currentAccountId == accountId) {
                await this.bot.sendMessage(chatId, `账号[${data.a}]已被选中`);
                await this.bot.deleteMessage(chatId, messageId);
                return;
            }
            this.currentAccountId = accountId;
            // 获取账号信息
            const account = await this.accountRepo.findOneBy({ id: accountId });
            if (!account) {
                await this.bot.sendMessage(chatId, '未找到该账号');
            }
            this.currentAccount = account;
            account.tgBotActive = true;
            this.accountRepo.save(account);
            // 删除原消息
            await this.bot.deleteMessage(chatId, messageId);
            await this.bot.sendMessage(chatId, `已选择账号: ${this._getDesensitizedUserName()}`);

        } catch (error) {
            this.bot.sendMessage(chatId, `设置当前账号失败: ${error.message}`);
        }
    }

    async handleFolderSelection(chatId, shareLink, messageId = null, accessCode) {
        const folders = await this.commonFolderRepo.find({ where: { accountId: this.currentAccountId } });

        if (folders.length === 0) {
            const keyboard = [[{
                text: '📁 添加常用目录',
                callback_data: JSON.stringify({ t: 'fd', f: '-11' })
            }]];
            const message = `当前账号: ${this._getDesensitizedUserName()} \n 未找到常用目录，请添加常用目录`;
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
                this.globalCommonFolderListMessageId = null
            } else {
                await this.bot.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
            }
            return;
        }
        // 缓存当前分享信息
        this.currentShareLink = shareLink;
        this.currentAccessCode = accessCode;
        let taskName = ""
        // 解析链接
        try {
            const shareFolders = await this.taskService.parseShareFolderByShareLink(shareLink, this.currentAccountId, accessCode);
            taskName = shareFolders[0].name;
        } catch (e) {
            await this.bot.sendMessage(chatId, `解析分享链接失败: ${e.message}`);
            return;
        }

        const keyboard = folders.map(folder => [{
            text: folder.path.length > 30 ?
                '.../' + folder.path.split('/').slice(-2).join('/') :
                folder.path,
            callback_data: JSON.stringify({
                t: 'f',               // type
                f: folder.id,   // folderId
            })
        }]);

        const message = `当前账号: ${this._getDesensitizedUserName()} \n资源名称: ${taskName}\n请选择保存目录:`;
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            this.lastButtonMessageId = messageId;
        } else {
            const msg = await this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            this.lastButtonMessageId = msg.message_id;
        }
    }

    async createTask(chatId, data, messageId) {
        try {
            const targetFolderId = data.f;
            // 根据targetFolderId查询出folderName
            const targetFolder = await this.commonFolderRepo.findOne({ where: { id: targetFolderId } });
            if (!targetFolder) {
                await this.bot.sendMessage(chatId, '未找到该目录');
                return
            }
            // 发送任务创建中消息
            const message = await this.bot.editMessageText('任务创建中...', {
                chat_id: chatId,
                message_id: messageId
            });
            const taskDto = {
                accountId: this.currentAccountId,
                shareLink: this.currentShareLink,
                targetFolderId: targetFolderId,
                targetFolder: targetFolder.path,
                tgbot: true,
                overwriteFolder: data?.o,
                accessCode: this.currentAccessCode
            };
            const tasks = await this.taskService.createTask(taskDto);
            // 遍历获取task.id
            const taskIds = tasks.map(task => task.id);
            this.bot.editMessageText('任务创建成功, 执行中...', {
                chat_id: chatId,
                message_id: message.message_id
            });
            if (taskIds.length > 0) {
                await this.taskService.processAllTasks(true, taskIds)
            }
            this.bot.deleteMessage(chatId, message.message_id);
            // 发送任务执行完成消息
            this.bot.sendMessage(chatId, '任务执行完成');
            // 清空缓存
            this.currentShareLink = null;
            this.currentAccessCode = null;
        } catch (error) {
            // 如果报错是 folder already exists 则提示用户是否需要覆盖
            if (error.message.includes('folder already exists')) {
                const keyboard = [
                    [{ text: '是', callback_data: JSON.stringify({ t: 'of', f: data.f, o: true }) }],
                    [{ text: '否', callback_data: JSON.stringify({ t: 'of', f: data.f, o: false }) }]
                ];
                await this.bot.editMessageText('该目录下已有同名文件夹，是否覆盖？', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                return;
            } else {
                await this.bot.editMessageText(`任务创建失败: ${error.message}`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                // 清空缓存
                this.currentShareLink = null;
                this.currentAccessCode = null;
                return;
            }
        }
    }

    async deleteTask(chatId, data, messageId) {
        try {
            // 判断data.i是否为数字
            if (isNaN(data.i)) {
                await this.bot.editMessageText('任务ID无效', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            // 发送任务删除中消息
            await this.bot.editMessageText('任务删除中...', {
                chat_id: chatId,
                message_id: messageId
            });

            await this.taskService.deleteTask(parseInt(data.i), data.df);
            await this.bot.editMessageText('任务删除成功', {
                chat_id: chatId,
                message_id: messageId
            });
            // 刷新任务列表
            setTimeout(() => this.showTasks(chatId, 1), 800);
        } catch (e) {
            this.bot.editMessageText(`任务删除失败: ${e.message}`, {
                chat_id: chatId,
                message_id: messageId
            });
        }
    }

    async showCommonFolders(chatId, messageId = null) {
        const folders = await this.commonFolderRepo.find({
            where: {
                accountId: this.currentAccountId
            },
            order: {
                path: 'ASC'
            }
        });
        const keyboard = [[{
            text: '📁 添加常用目录',
            callback_data: JSON.stringify({ t: 'fd', f: '-11' })
        }]];
        if (folders.length === 0) {
            const message = `当前账号: ${this._getDesensitizedUserName()} \n 未找到常用目录，请先添加常用目录`;
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
                this.globalCommonFolderListMessageId = null
            } else {
                if (this.globalCommonFolderListMessageId) {
                    await this.bot.deleteMessage(chatId, this.globalCommonFolderListMessageId);
                    this.globalCommonFolderListMessageId = null;
                }
                await this.bot.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
            }
            return;
        }

        const folderList = folders.map(folder =>
            `📁 ${folder.path}\n❌ 删除: /df_${folder.id}`
        ).join('\n\n');

        const message = `当前账号: ${this._getDesensitizedUserName()} \n 常用目录列表:\n\n${folderList}`;
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            });
            this.globalCommonFolderListMessageId = null
        } else {
            if (this.globalCommonFolderListMessageId) {
                await this.bot.deleteMessage(chatId, this.globalCommonFolderListMessageId);
            }
            const newMessage = await this.bot.sendMessage(chatId, message, { reply_markup: { inline_keyboard: keyboard } });
            this.globalCommonFolderListMessageId = newMessage.message_id;
        }
    }

    async showFolderTree(chatId, data, messageId = null) {
        try {
            let folderId = data?.f || '-11';
            if (!this._checkUserId(chatId)) return;
            if (data?.r) {
                // 返回上一级目录，从记录的父级ID中获取
                const parentId = Array.from(this.parentFolderIds).pop() || '-11';
                this.parentFolderIds.delete(parentId);
                const path = this.currentFolderPath.split('/').filter(Boolean);
                path.pop();
                path.pop();
                this.currentFolderPath = path.join('/');
                folderId = parentId;
            } else if (folderId !== '-11') {
                // 非根目录时记录父级ID
                const folder = this.folders.get(folderId);
                if (folder?.pId) {
                    this.parentFolderIds.add(folder.pId);
                }
            }
            const cloud189 = Cloud189Service.getInstance(this.currentAccount);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                await this.bot.sendMessage(chatId, '获取文件夹列表失败');
                return;
            }

            // 获取当前账号的所有常用目录
            const commonFolders = await this.commonFolderRepo.find({
                where: { accountId: this.currentAccountId }
            });
            const commonFolderIds = new Set(commonFolders.map(f => f.id));

            // 更新当前ID
            this.currentFolderId = folderId;

            // 处理路径更新
            if (folderId === '-11') {
                // 根目录
                this.currentFolderPath = '/';
            } else {
                this.currentFolderPath = path.join(this.currentFolderPath, this.folders.get(folderId).name);
            }

            const keyboard = [];

            // 添加文件夹按钮
            for (const folder of folders) {
                keyboard.push([{
                    text: `📁 ${folder.name}${commonFolderIds.has(folder.id) ? ' ✅' : ''}`,
                    callback_data: JSON.stringify({
                        t: 'fd',
                        f: folder.id
                    })
                }]);
                this.folders.set(folder.id, folder);
            }

            // 添加操作按钮
            keyboard.push([
                {
                    text: '❌ 关闭',
                    callback_data: JSON.stringify({ t: 'fc' })
                },
                ...(folderId !== '-11' ? [{
                    text: '🔄 返回',
                    callback_data: JSON.stringify({
                        t: 'fd',
                        f: folders[0]?.pId || '-11',
                        r: true
                    })
                }] : []),
                {
                    text: '✅ 确认',
                    callback_data: JSON.stringify({
                        t: 'fs',
                        f: folderId
                    })
                },
            ]);

            const message = `当前账号: ${this._getDesensitizedUserName()} \n 当前路径: ${this.currentFolderPath}\n请选择要添加的目录:`;

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    reply_markup: { inline_keyboard: keyboard }
                });
            }

        } catch (error) {
            console.log(error);
            this.bot.sendMessage(chatId, `获取目录失败: ${error.message}`);
        }
    }

    async saveFolderAsFavorite(chatId, data, messageId) {
        try {
            let currentPath = this.currentFolderPath || '';

            // 校验目录是否已经是常用目录
            const existingFavorite = await this.commonFolderRepo.findOne({
                where: {
                    accountId: this.currentAccountId,
                    id: data.f
                }
            });
            if (existingFavorite) {
                await this.bot.editMessageText(`${data.p || '根目录'} 已经是常用目录`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                this.globalCommonFolderListMessageId = null;
                return;
            }
            if (currentPath === '' || currentPath === '/') {
                currentPath = '/';
            } else {
                currentPath = currentPath.replace(/^\/|\/$/g, '');
            }
            const favorite = {
                accountId: this.currentAccountId,
                id: data.f,
                path: currentPath,
                name: currentPath.split('/').pop() || '根目录'
            };

            await this.commonFolderRepo.save(favorite);
            await this.bot.editMessageText(`已将 ${currentPath || '根目录'} 添加到常用目录`, {
                chat_id: chatId,
                message_id: messageId
            });

        } catch (error) {
            throw new Error(`保存常用目录失败: ${error.message}`);
        }
    }

    async cloudSaverSearch(chatId, msg) {
        const keyword = msg.text?.trim();
        if (!keyword) return;
        // 重置超时时间
        this._resetSearchModeTimeout(chatId);
        try {
            const message = await this.bot.sendMessage(chatId, '正在搜索...');
            const result = await this.cloudSaverSdk.search(keyword);
            if (result.length <= 0) {
                await this.bot.editMessageText('未找到相关资源', {
                    chat_id: chatId,
                    message_id: message.message_id
                });
                return
            }
            // 保存结果到this.cloudSaverSearchMap
            result.forEach((item, index) => {
                this.cloudSaverSearchMap.set(index + 1, item.cloudLinks[0].link);
            });
            const results = `💡 以下资源来自 CloudSaver\n` +
                `📝 共找到 ${result.length} 个结果,输入编号可转存\n` +
                result.map((item, index) =>
                    `${index + 1}. 🎬 <a href="${item.cloudLinks[0].link}">${item.title}</a>`
                ).join('\n\n');
            await this.bot.editMessageText(`搜索结果：\n\n${results}`, {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'HTML'
            });
        } catch (error) {
            await this.bot.sendMessage(chatId, `搜索失败: ${error.message}`);
        }
    }

    async handleAutoSeriesCommand(msg, input, mode = 'normal') {
        const chatId = msg.chat.id;
        if (!this._checkChatId(chatId)) return;
        const normalizedInput = String(input || '').trim();
        if (!normalizedInput) {
            await this.bot.sendMessage(
                chatId,
                mode === 'lazy'
                    ? '请输入剧名，格式：/lazy_series 剧名 [年份]'
                    : '请输入剧名，格式：/series 剧名 [年份]'
            );
            return;
        }

        const { title, year } = this._parseTitleAndYear(normalizedInput);
        const statusText = mode === 'lazy' ? '开始自动追剧(懒转存STRM)...' : '开始自动追剧(正常任务)...';
        const message = await this.bot.sendMessage(chatId, statusText);
        try {
            const result = await this.autoSeriesService.createByTitle({ title, year, mode });
            const resultText = mode === 'lazy'
                ? `✅ 懒转存STRM已生成\n剧名：${result.taskName}\n资源：${result.resourceTitle}\n文件数：${result.fileCount || 0}`
                : `✅ 自动追剧已完成\n剧名：${result.taskName}\n资源：${result.resourceTitle}\n任务数：${result.taskCount || 0}`;
            await this.bot.editMessageText(resultText, {
                chat_id: chatId,
                message_id: message.message_id
            });
        } catch (error) {
            await this.bot.editMessageText(`自动追剧失败: ${error.message}`, {
                chat_id: chatId,
                message_id: message.message_id
            });
        }
    }

    _parseTitleAndYear(input) {
        const yearMatch = String(input || '').match(/^(.+?)(?:\s+(\d{4}))?$/);
        if (!yearMatch) {
            return {
                title: String(input || '').trim(),
                year: ''
            };
        }
        return {
            title: String(yearMatch[1] || '').trim(),
            year: String(yearMatch[2] || '').trim()
        };
    }

    // 校验任务id
    _checkTaskId(taskId) {
        if (isNaN(taskId)) {
            this.bot.editMessageText('任务ID无效', {
                chat_id: chatId,
                message_id: messageId
            });
            return false;
        }
        return true;
    }
    // 校验当前是否有用户id
    _checkUserId(chatId) {
        if (!this.currentAccountId) {
            this.bot.sendMessage(chatId, '请先使用 /accounts 选择账号');
            return false;
        }
        return true;
    }
    // 校验是否是当前chatId
    _checkChatId(chatId) {
        if (chatId != this.chatId) return false;
        return true;
    }
    // 获取当前已脱敏的用户名
    _getDesensitizedUserName() {
        return this.currentAccount.username.replace(/(.{3}).*(.{4})/, '$1****$2');
    }

    _stripRootSuffix(value) {
        return String(value || '').replace(/\(根\)$/u, '').trim();
    }

    _getDisplayTaskName(task) {
        const resourceName = this._stripRootSuffix(task?.resourceName) || '未知';
        return task?.shareFolderName ? `${resourceName}/${task.shareFolderName}` : resourceName;
    }

    // 在类的底部添加新的辅助方法
    _resetSearchModeTimeout(chatId) {
        // 清除现有的超时计时器
        if (this.searchModeTimeout) {
            clearTimeout(this.searchModeTimeout);
        }

        // 设置新的超时计时器
        this.searchModeTimeout = setTimeout(async () => {
            if (this.isSearchMode) {
                this.isSearchMode = false;
                this.cloudSaverSearchMap = new Map();
                await this.bot.sendMessage(chatId, '长时间未搜索，已自动退出搜索模式');
            }
        }, 3 * 60 * 1000);  // 3分钟
    }

    // ==================== 批量重命名 ====================

    _resetRenameState() {
        this.renameState = {
            step: null,
            folderId: null,
            folderPath: '',
            tmdbResults: [],
            selectedTitle: null,
            plans: [],
        };
    }

    // 解析文件名里的 S01E01 / 1x01
    _extractSE(filename) {
        let m = filename.match(/S(\d{1,2})E(\d{1,3})/i);
        if (m) {
            const s = String(parseInt(m[1])).padStart(2, '0');
            const e = String(parseInt(m[2])).padStart(2, '0');
            return `S${s}E${e}`;
        }
        m = filename.match(/(\d{1,2})x(\d{1,3})/i);
        if (m) {
            const s = String(parseInt(m[1])).padStart(2, '0');
            const e = String(parseInt(m[2])).padStart(2, '0');
            return `S${s}E${e}`;
        }
        return null;
    }

    _extractExt(filename) {
        const m = filename.match(/(\.[a-z0-9]{2,6})$/i);
        return m ? m[1] : '';
    }

    // 根据剧名+文件列表生成重命名计划
    _buildRenamePlans(seriesTitle, files) {
        return files
            .map(f => {
                const se = this._extractSE(f.name);
                if (!se) return null;
                const ext = this._extractExt(f.name);
                return { fileId: f.id, oldName: f.name, newName: `${seriesTitle} - ${se}${ext}` };
            })
            .filter(Boolean)
            .filter(p => p.oldName !== p.newName);
    }

    // 显示重命名专用文件夹浏览器（复用 showFolderTree 的 UI，"确认"走重命名流程）
    async _showRenameFolderTree(chatId, data = null, messageId = null) {
        try {
            let folderId = data?.f || '-11';

            if (data?.r) {
                const parentId = Array.from(this.parentFolderIds).pop() || '-11';
                this.parentFolderIds.delete(parentId);
                const pathParts = this.currentFolderPath.split('/').filter(Boolean);
                pathParts.pop();
                this.currentFolderPath = pathParts.length ? '/' + pathParts.join('/') : '/';
                folderId = parentId;
            } else if (folderId !== '-11') {
                const folder = this.folders.get(folderId);
                if (folder?.pId) this.parentFolderIds.add(folder.pId);
            }

            const cloud189 = Cloud189Service.getInstance(this.currentAccount);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                await this.bot.sendMessage(chatId, '获取文件夹列表失败');
                return;
            }

            this.currentFolderId = folderId;
            if (folderId === '-11') {
                this.currentFolderPath = '/';
            } else {
                const folderName = this.folders.get(folderId)?.name || '';
                if (folderName) {
                    this.currentFolderPath = (this.currentFolderPath === '/' ? '' : this.currentFolderPath) + '/' + folderName;
                }
            }
            this.renameState.folderId = folderId;
            this.renameState.folderPath = this.currentFolderPath;

            const keyboard = [];
            for (const folder of folders) {
                keyboard.push([{
                    text: `📁 ${folder.name}`,
                    callback_data: JSON.stringify({ t: 'fd', f: folder.id })
                }]);
                this.folders.set(folder.id, folder);
            }
            keyboard.push([
                { text: '❌ 取消', callback_data: JSON.stringify({ t: 'fc' }) },
                ...(folderId !== '-11' ? [{
                    text: '🔄 返回',
                    callback_data: JSON.stringify({ t: 'fd', f: folders[0]?.pId || '-11', r: true })
                }] : []),
                { text: '✅ 选此目录', callback_data: JSON.stringify({ t: 'rn_folder', f: folderId }) }
            ]);

            const message = `🔤 批量重命名 — 选择文件夹\n当前路径: ${this.currentFolderPath}`;
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    reply_markup: { inline_keyboard: keyboard }
                });
            }
        } catch (e) {
            this.bot.sendMessage(chatId, `获取目录失败: ${e.message}`);
        }
    }

    // 用户点击"选此目录"后，提示输入剧名或TMDB ID
    async _onRenameFolderConfirm(chatId, data, messageId) {
        this.renameState.folderId = data.f;
        this.renameState.step = 'tmdb';
        await this.bot.editMessageText(
            `📂 已选择目录: ${this.renameState.folderPath || '根目录'}\n\n` +
            `请输入剧名或 TMDB ID（直接回复）：\n` +
            `例如：剑来 / 120分钟 / 12345\n\n` +
            `输入 /cancel 取消`,
            { chat_id: chatId, message_id: messageId }
        );
    }

    // 接收用户输入的剧名/TMDB ID
    async _handleRenameInput(chatId, input) {
        if (!input) return;

        const waitMsg = await this.bot.sendMessage(chatId, '🔍 正在搜索 TMDB...');
        try {
            let title = null;
            let tmdbId = null;

            // 判断是否为纯数字 TMDB ID
            if (/^\d+$/.test(input)) {
                tmdbId = parseInt(input);
                const detail = await this.tmdbService.getTVDetails(tmdbId);
                if (detail?.title) {
                    title = detail.title;
                    await this.bot.editMessageText(
                        `✅ 找到剧集：${title}\n将重命名为：${title} - S01E01.mkv 格式\n\n读取文件列表中...`,
                        { chat_id: chatId, message_id: waitMsg.message_id }
                    );
                    await this._proceedWithTitle(chatId, waitMsg.message_id, title);
                    return;
                } else {
                    throw new Error(`TMDB ID ${tmdbId} 未找到剧集`);
                }
            }

            // 关键字搜索
            const results = await this.tmdbService.search(input);
            const allResults = [
                ...results.tvShows.map(r => ({ ...r, label: `📺 ${r.title}（${r.releaseDate?.slice(0, 4) || '?'}）` })),
                ...results.movies.map(r => ({ ...r, label: `🎬 ${r.title}（${r.releaseDate?.slice(0, 4) || '?'}）` })),
            ].slice(0, 5);

            if (!allResults.length) {
                // 没有TMDB结果，直接用输入的文字作为剧名
                await this.bot.editMessageText(
                    `⚠️ TMDB 未找到「${input}」，直接使用该名称重命名。`,
                    { chat_id: chatId, message_id: waitMsg.message_id }
                );
                await this._proceedWithTitle(chatId, waitMsg.message_id, input);
                return;
            }

            if (allResults.length === 1) {
                // 只有一个结果，直接用
                await this.bot.editMessageText(
                    `✅ 唯一匹配：${allResults[0].title}，读取文件列表中...`,
                    { chat_id: chatId, message_id: waitMsg.message_id }
                );
                await this._proceedWithTitle(chatId, waitMsg.message_id, allResults[0].title);
                return;
            }

            // 多个结果，让用户选
            this.renameState.tmdbResults = allResults;
            const keyboard = allResults.map((r, i) => ([{
                text: r.label,
                callback_data: JSON.stringify({ t: 'rn_pick', i })
            }]));
            keyboard.push([{ text: `✏️ 直接用「${input}」`, callback_data: JSON.stringify({ t: 'rn_pick', i: -1, raw: input }) }]);
            keyboard.push([{ text: '❌ 取消', callback_data: JSON.stringify({ t: 'rn_cancel' }) }]);

            await this.bot.editMessageText(
                `找到 ${allResults.length} 个结果，请选择正确的剧集：`,
                { chat_id: chatId, message_id: waitMsg.message_id, reply_markup: { inline_keyboard: keyboard } }
            );
            this.renameState.step = 'confirm';

        } catch (e) {
            await this.bot.editMessageText(`搜索失败: ${e.message}`, {
                chat_id: chatId, message_id: waitMsg.message_id
            });
            this._resetRenameState();
        }
    }

    // 用户从TMDB列表点选某一个
    async _onRenameTmdbPick(chatId, data, messageId) {
        let title;
        if (data.i === -1) {
            title = data.raw;
        } else {
            title = this.renameState.tmdbResults[data.i]?.title;
        }
        if (!title) {
            await this.bot.editMessageText('选择无效，请重试', { chat_id: chatId, message_id: messageId });
            return;
        }
        await this._proceedWithTitle(chatId, messageId, title);
    }

    // 拿到剧名后，读取文件列表并生成预览
    async _proceedWithTitle(chatId, messageId, title) {
        try {
            const cloud189 = Cloud189Service.getInstance(this.currentAccount);
            const resp = await cloud189.listFiles(this.renameState.folderId || '-11');
            const files = resp?.fileListAO?.fileList || [];

            if (!files.length) {
                await this.bot.editMessageText('该目录下没有找到文件', { chat_id: chatId, message_id: messageId });
                this._resetRenameState();
                return;
            }

            const plans = this._buildRenamePlans(title, files);
            if (!plans.length) {
                await this.bot.editMessageText(
                    `⚠️ 在 ${files.length} 个文件中未识别到 S01E01 格式的集数编号，无法重命名。`,
                    { chat_id: chatId, message_id: messageId }
                );
                this._resetRenameState();
                return;
            }

            this.renameState.selectedTitle = title;
            this.renameState.plans = plans;
            this.renameState.step = 'confirm';

            // 预览前5条
            const preview = plans.slice(0, 5)
                .map(p => `  ${p.oldName}\n  → ${p.newName}`)
                .join('\n\n');
            const more = plans.length > 5 ? `\n...等共 ${plans.length} 个文件` : '';

            const keyboard = [[
                { text: `✅ 确认重命名 ${plans.length} 个文件`, callback_data: JSON.stringify({ t: 'rn_confirm' }) },
                { text: '❌ 取消', callback_data: JSON.stringify({ t: 'rn_cancel' }) }
            ]];

            await this.bot.editMessageText(
                `📋 重命名预览（剧名：${title}）\n\n${preview}${more}\n\n确认执行？`,
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } }
            );
        } catch (e) {
            await this.bot.editMessageText(`读取文件列表失败: ${e.message}`, {
                chat_id: chatId, message_id: messageId
            });
            this._resetRenameState();
        }
    }

    // 执行批量重命名
    async _onRenameExecute(chatId, messageId) {
        const plans = this.renameState.plans;
        if (!plans.length) {
            await this.bot.editMessageText('没有可执行的重命名计划', { chat_id: chatId, message_id: messageId });
            this._resetRenameState();
            return;
        }

        await this.bot.editMessageText(`⏳ 正在重命名，共 ${plans.length} 个文件...`, {
            chat_id: chatId, message_id: messageId
        });

        const cloud189 = Cloud189Service.getInstance(this.currentAccount);
        let success = 0, failed = 0;
        const errors = [];

        for (const plan of plans) {
            try {
                await cloud189.renameFile(plan.fileId, plan.newName);
                success++;
                await new Promise(r => setTimeout(r, 700)); // 避免请求过快
            } catch (e) {
                failed++;
                errors.push(`${plan.oldName}: ${e.message}`);
            }
        }

        const resultText = `✅ 重命名完成\n成功: ${success}  失败: ${failed}` +
            (errors.length ? `\n\n前几个错误：\n${errors.slice(0, 3).join('\n')}` : '');

        await this.bot.editMessageText(resultText, { chat_id: chatId, message_id: messageId });
        this._resetRenameState();
    }
}

module.exports = { TelegramBotService };
