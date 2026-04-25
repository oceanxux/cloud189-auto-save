require('dotenv').config();
const express = require('express');
const { AppDataSource } = require('./database');
const { Account, Task, CommonFolder, Subscription, SubscriptionResource, StrmConfig, TaskProcessedFile, WorkflowRun } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager')
const ConfigService = require('./services/ConfigService');
const packageJson = require('../package.json');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SchedulerService } = require('./services/scheduler');
const { logTaskEvent, initSSE, sendAIMessage } = require('./utils/logUtils');
const TelegramBotManager = require('./utils/TelegramBotManager');
const fs = require('fs').promises;
const path = require('path');
const { setupCloudSaverRoutes, clearCloudSaverToken } = require('./sdk/cloudsaver');
const { Like, Not, IsNull, In, Or } = require('typeorm');
const cors = require('cors'); 
const { EmbyService } = require('./services/emby');
const { EmbyPrewarmService } = require('./services/embyPrewarm');
const { StrmService } = require('./services/strm');
const AIService = require('./services/ai');
const CustomPushService = require('./services/message/CustomPushService');
const { SubscriptionService } = require('./services/subscription');
const { StrmConfigService } = require('./services/strmConfig');
const { TMDBService } = require('./services/tmdb');
const { StreamProxyService } = require('./services/streamProxy');
const { LazyShareStrmService } = require('./services/lazyShareStrm');
const { OrganizerService } = require('./services/organizer');
const { AutoSeriesService } = require('./services/autoSeries');
const { CasService } = require('./services/casService');
const { WorkflowRunner } = require('./services/workflow/WorkflowRunner');
const { createWorkflowExecutors } = require('./services/workflow/executors');

const appPort = Number(process.env.PORT || 3000);
let embyStandaloneProxyServer = null;
const resolvePublicDir = () => {
    const candidates = [
        path.join(__dirname, 'public'),
        path.join(__dirname, '../src/public')
    ];
    for (const dir of candidates) {
        try {
            require('fs').accessSync(path.join(dir, 'index.html'));
            return dir;
        } catch (error) {
            continue;
        }
    }
    return candidates[0];
};
const publicDir = resolvePublicDir();
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key'],
    credentials: true
};

const getStandaloneEmbyProxyPort = () => {
    const configuredPort = Number(
        ConfigService.getConfigValue('emby.proxy.port')
        || process.env.EMBY_PROXY_PORT
        || 8097
    );
    return Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 8097;
};

const closeStandaloneEmbyProxyServer = async () => {
    if (!embyStandaloneProxyServer) {
        return;
    }

    const server = embyStandaloneProxyServer;
    embyStandaloneProxyServer = null;
    await new Promise((resolve) => {
        server.close((error) => {
            if (error) {
                console.error('关闭 Emby 独立反代端口失败:', error.message);
            } else {
                console.log('Emby 独立反代端口已关闭');
            }
            resolve();
        });
    });
};

const isEmbyProxyRequestPath = (requestUrl = '', basePath = '/emby-proxy') => {
    const pathname = String(requestUrl || '/').split('?')[0];
    if (!basePath) {
        return true;
    }
    return pathname === basePath || pathname.startsWith(`${basePath}/`);
};

const loginPageFallbackHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录 - 天翼云盘自动转存系统</title>
    <style>
        :root {
            --bg: #f8fafc;
            --card: #ffffff;
            --border: #dbe3f0;
            --text: #0f172a;
            --muted: #475569;
            --primary: #0b57d0;
            --primary-hover: #0948ad;
            --danger: #dc2626;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --card: #1e293b;
                --border: #334155;
                --text: #f8fafc;
                --muted: #94a3b8;
            }
        }

        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: var(--bg);
            color: var(--text);
            transition: background-color 0.3s, color 0.3s;
        }
        .card {
            width: 100%;
            max-width: 420px;
            padding: 40px;
            border-radius: 28px;
            background: var(--card);
            border: 1px solid var(--border);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
        }
        .eyebrow {
            margin: 0 0 12px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.1em;
            color: var(--primary);
            text-transform: uppercase;
        }
        h1 {
            margin: 0 0 8px;
            font-size: 32px;
            font-weight: 600;
            color: var(--text);
        }
        p {
            margin: 0 0 32px;
            color: var(--muted);
            line-height: 1.6;
            font-size: 15px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 600;
            color: var(--text);
        }
        input {
            width: 100%;
            height: 52px;
            padding: 0 16px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
            border-radius: 16px;
            font-size: 16px;
            background: var(--bg);
            color: var(--text);
            outline: none;
            transition: all 0.2s;
        }
        input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 4px rgba(11, 87, 208, 0.1);
        }
        button {
            width: 100%;
            height: 52px;
            border: 0;
            border-radius: 16px;
            background: var(--primary);
            color: #ffffff;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 8px;
        }
        button:hover { 
            background: var(--primary-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(11, 87, 208, 0.2);
        }
        button:active {
            transform: translateY(0);
        }
        button:disabled { 
            opacity: 0.6; 
            cursor: not-allowed; 
            transform: none;
        }
        .error {
            min-height: 20px;
            margin-top: 16px;
            color: var(--danger);
            font-size: 14px;
            text-align: center;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="eyebrow">Cloud189 Auto Save</div>
        <h1>登录</h1>
        <p>输入系统账号后进入控制台。</p>
        <form id="loginForm">
            <label for="username">用户名</label>
            <input id="username" name="username" type="text" autocomplete="username" required />
            <label for="password">密码</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
            <button id="submitButton" type="submit">登录</button>
            <div id="errorMessage" class="error"></div>
        </form>
    </main>
    <script>
        const form = document.getElementById('loginForm');
        const submitButton = document.getElementById('submitButton');
        const errorMessage = document.getElementById('errorMessage');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorMessage.textContent = '';
            submitButton.disabled = true;
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    })
                });
                const data = await response.json();
                if (data.success) {
                    window.location.href = '/';
                    return;
                }
                errorMessage.textContent = data.error || '登录失败';
            } catch (error) {
                errorMessage.textContent = '登录请求失败';
            } finally {
                submitButton.disabled = false;
            }
        });
    </script>
</body>
</html>`;

const sendPublicFileOrFallback = async (res, fileName, fallbackHtml) => {
    const filePath = path.join(publicDir, fileName);
    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        if (fallbackHtml) {
            res.type('html').send(fallbackHtml);
            return;
        }
        throw error;
    }
};

const createStandaloneEmbyProxyApp = (embyService) => {
    const proxyApp = express();
    proxyApp.set('trust proxy', true);
    proxyApp.use(cors(corsOptions));
    proxyApp.use(async (req, res) => {
        await embyService.handleProxyRequest(req, res, { basePath: '' });
    });
    return proxyApp;
};

const syncStandaloneEmbyProxyServer = async (embyService) => {
    const shouldEnableStandaloneProxy = !!ConfigService.getConfigValue('emby.proxy.enable');
    const proxyPort = getStandaloneEmbyProxyPort();

    if (!shouldEnableStandaloneProxy) {
        await closeStandaloneEmbyProxyServer();
        return;
    }

    if (proxyPort === appPort) {
        console.warn(`Emby 独立反代端口 ${proxyPort} 与主服务端口冲突，已跳过启动`);
        await closeStandaloneEmbyProxyServer();
        return;
    }

    if (embyStandaloneProxyServer) {
        const currentPort = embyStandaloneProxyServer.address()?.port;
        if (currentPort === proxyPort) {
            return;
        }
        await closeStandaloneEmbyProxyServer();
    }

    const proxyApp = createStandaloneEmbyProxyApp(embyService);
    await new Promise((resolve, reject) => {
        const server = proxyApp.listen(proxyPort, () => {
            embyStandaloneProxyServer = server;
            console.log(`Emby 独立反代运行在 http://localhost:${proxyPort}`);
            resolve();
        });
        server.on('upgrade', (req, socket, head) => {
            embyService.handleProxyUpgrade(req, socket, head, { basePath: '' }).catch((error) => {
                console.error('Emby 独立反代 WebSocket 失败:', error.message);
                socket.destroy();
            });
        });
        server.once('error', reject);
    });
};

const app = express();
app.set('trust proxy', true);
app.use(cors(corsOptions));
app.use(express.json());

app.use(session({
    store: new FileStore({
        path: './data/sessions',  // session文件存储路径
        ttl: 30 * 24 * 60 * 60,  // session过期时间，单位秒
        reapInterval: 3600,       // 清理过期session间隔，单位秒
        retries: 0,           // 设置重试次数为0
        logFn: () => {},      // 禁用内部日志
        reapAsync: true,      // 异步清理过期session
    }),
    secret: 'LhX2IyUcMAz2',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000 * 30 // 30天
    }
}));


// 验证会话的中间件
const authenticateSession = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const configApiKey = ConfigService.getConfigValue('system.apiKey');
    if (apiKey && configApiKey && apiKey === configApiKey) {
        return next();
    }
    if (req.session.authenticated) {
        next();
    } else {
        // API 请求返回 401，页面请求重定向到登录页
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ success: false, error: '未登录' });
        } else {
            res.redirect('/login');
        }
    }
};

// 添加根路径处理
app.get('/', async (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
        return;
    }
    await sendPublicFileOrFallback(res, 'index.html');
});


// 登录页面
app.get('/login', async (req, res) => {
    await sendPublicFileOrFallback(res, 'login.html', loginPageFallbackHtml);
});

// 登录接口
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ConfigService.getConfigValue('system.username') && 
        password === ConfigService.getConfigValue('system.password')) {
        req.session.authenticated = true;
        req.session.username = username;
        res.json({ success: true });
    } else {
        res.json({ success: false, error: '用户名或密码错误' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            res.status(500).json({ success: false, error: '退出登录失败' });
            return;
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.post('/api/system/restart', authenticateSession, (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({ success: true, message: '重启请求已接受' }));
    setTimeout(() => {
        console.log('收到容器重启请求，准备退出进程');
        process.exit(0);
    }, 1500);
});

app.use(express.static(publicDir));
// 为所有路由添加认证（除了登录页和登录接口）
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/login' 
        || req.path === '/api/auth/login' 
        || req.path.startsWith('/api/stream/')
        || req.path === '/emby-proxy'
        || req.path.startsWith('/emby-proxy/')
        || req.path === '/emby/notify'
        || req.path.startsWith('/assets/')
        || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$/)) {
        return next();
    }
    authenticateSession(req, res, next);
});
let accountRepo, taskRepo, commonFolderRepo, subscriptionRepo, subscriptionResourceRepo, strmConfigRepo, taskProcessedFileRepo, workflowRunRepo;
let taskService, organizerService, subscriptionService, strmConfigService, streamProxyService, lazyShareStrmService, autoSeriesService, tmdbService, embyService, messageUtil;

// 初始化数据库连接
AppDataSource.initialize().then(async () => {
    // 当前版本:
    const currentVersion = packageJson.version;
    console.log(`当前系统版本: ${currentVersion}`);
    console.log('数据库连接成功');

    // 初始化 STRM 目录权限
    const strmBaseDir = path.join(__dirname, '../strm');
    try {
        await fs.mkdir(strmBaseDir, { recursive: true });
        if (process.getuid && process.getuid() === 0) {
            await fs.chown(strmBaseDir, parseInt(process.env.PUID || 0), parseInt(process.env.PGID || 0));
        }
        await fs.chmod(strmBaseDir, 0o777);
        console.log('STRM目录权限初始化完成');
    } catch (error) {
        console.error('STRM目录权限初始化失败:', error);
    }

    accountRepo = AppDataSource.getRepository(Account);
    taskRepo = AppDataSource.getRepository(Task);
    commonFolderRepo = AppDataSource.getRepository(CommonFolder);
    subscriptionRepo = AppDataSource.getRepository(Subscription);
    subscriptionResourceRepo = AppDataSource.getRepository(SubscriptionResource);
    strmConfigRepo = AppDataSource.getRepository(StrmConfig);
    taskProcessedFileRepo = AppDataSource.getRepository(TaskProcessedFile);
    workflowRunRepo = AppDataSource.getRepository(WorkflowRun);
    
    taskService = new TaskService(taskRepo, accountRepo, taskProcessedFileRepo);
    organizerService = new OrganizerService(taskService, taskRepo);
    subscriptionService = new SubscriptionService(subscriptionRepo, subscriptionResourceRepo, accountRepo);
    strmConfigService = new StrmConfigService(strmConfigRepo, accountRepo, subscriptionRepo, subscriptionResourceRepo);
    streamProxyService = new StreamProxyService(accountRepo);
    lazyShareStrmService = new LazyShareStrmService(accountRepo, taskService);
    autoSeriesService = new AutoSeriesService(taskService, accountRepo, lazyShareStrmService);
    taskService.autoSeriesService = autoSeriesService;
    tmdbService = new TMDBService();
    const casService = new CasService();
    embyService = new EmbyService(taskService);
    messageUtil = new MessageUtil();
    const embyPrewarmService = new EmbyPrewarmService(embyService);
    embyService.attachPrewarmService(embyPrewarmService);

    // 机器人管理
    const botManager = TelegramBotManager.getInstance();
    const workflowExecutors = createWorkflowExecutors({
        accountRepo,
        taskRepo,
        taskService,
        organizerService
    });
    const workflowRunner = new WorkflowRunner(workflowRunRepo, workflowExecutors, {
        sendConfirmCard: async (run, preview) => {
            if (run?.source !== 'bot' || !run?.chatId) {
                return;
            }
            const bot = botManager.getBot()?.bot;
            if (!bot) {
                return;
            }
            await bot.sendMessage(run.chatId, preview || '工作流等待确认，请回复 Y 执行，或 N 取消。');
        },
        sendResult: async (run) => {
            if (run?.source !== 'bot' || !run?.chatId) {
                return;
            }
            const bot = botManager.getBot()?.bot;
            if (!bot) {
                return;
            }
            const resultText = run?.context?.resultSummary || '工作流执行完成。';
            await bot.sendMessage(run.chatId, resultText);
        },
        sendError: async (run, error) => {
            if (run?.source !== 'bot' || !run?.chatId) {
                return;
            }
            const bot = botManager.getBot()?.bot;
            if (!bot) {
                return;
            }
            await bot.sendMessage(run.chatId, `工作流执行失败: ${error.message}`);
        },
        sendCancelled: async (run) => {
            if (run?.source !== 'bot' || !run?.chatId) {
                return;
            }
            const bot = botManager.getBot()?.bot;
            if (!bot) {
                return;
            }
            await bot.sendMessage(run.chatId, '工作流已取消。');
        }
    });
    botManager.setWorkflowRunner(workflowRunner);
    // 初始化机器人
    await botManager.handleBotStatus(
        ConfigService.getConfigValue('telegram.botToken'),
        ConfigService.getConfigValue('telegram.chatId'),
        ConfigService.getConfigValue('telegram.enable'),
        ConfigService.getConfigValue('telegram.proxyDomain')
    );
    // 初始化缓存管理器
    const folderCache = new CacheManager(parseInt(600));
    // 初始化任务定时器
    await SchedulerService.initTaskJobs(taskRepo, taskService);
    await SchedulerService.initStrmConfigJobs(strmConfigRepo, strmConfigService);
    await embyPrewarmService.reload();

    // 初始化 CAS 监控服务
    const casAutoRestoreEnabled = ConfigService.getConfigValue('cas.enableAutoRestore', false);
    if (casAutoRestoreEnabled) {
        const { casMonitorService } = require('./services/casMonitorService');
        casMonitorService.start();
    }

    app.use('/emby-proxy', async (req, res) => {
        await embyService.handleProxyRequest(req, res, { basePath: '/emby-proxy' });
    });
    
    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        const accounts = await accountRepo.find();
        // 获取容量
        for (const account of accounts) {
            
            account.capacity = {
                cloudCapacityInfo: {usedSize:0,totalSize:0},
                familyCapacityInfo: {usedSize:0,totalSize:0}
            }
            // 如果账号名是s打头 则不获取容量
            if (!account.username.startsWith('n_')) {
                const cloud189 = Cloud189Service.getInstance(account);
                const capacity = await cloud189.getUserSizeInfo()
                if (capacity && capacity.res_code == 0) {
                    account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                    account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
                }
            }
            account.original_username = account.username;
            account.accountType = account.accountType || 'personal';
            account.familyId = account.familyId || '';
            account.driveLabel = account.accountType === 'family' ? '家庭云' : '个人云';
            // username脱敏
            account.username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
        }
        res.json({ success: true, data: accounts });
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const account = accountRepo.create(req.body);
            account.accountType = account.accountType || 'personal';
            account.familyId = account.accountType === 'family' ? (account.familyId || '') : null;
            Cloud189Service.invalidateByUsername(account.username);
            // 尝试登录, 登录成功写入store, 如果需要验证码, 则返回用户验证码图片
            if (!account.username.startsWith('n_') && account.password) {
                // 尝试登录
                const cloud189 = Cloud189Service.getInstance(account);
                const loginResult = await cloud189.login(account.username, account.password, req.body.validateCode);
                if (!loginResult.success) {
                    if (loginResult.code == "NEED_CAPTCHA") {
                        res.json({
                            success: false,
                            code: "NEED_CAPTCHA",
                            data: {
                                captchaUrl: loginResult.data
                            }
                        });
                        return;
                    }
                    res.json({ success: false, error: loginResult.message });
                    return;
                }
            }
            if (!account.username.startsWith('n_') && account.accountType === 'family') {
                const cloud189 = Cloud189Service.getInstance(account);
                account.familyId = await cloud189.resolveFamilyId(account.familyId || null);
            }
            await accountRepo.save(account);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.put('/api/accounts/:id', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const existingAccount = await accountRepo.findOneBy({ id: accountId });
            if (!existingAccount) {
                throw new Error('账号不存在');
            }

            const nextAccountType = req.body.accountType || existingAccount.accountType || 'personal';
            const mergedAccount = accountRepo.merge(existingAccount, {
                alias: req.body.alias ?? existingAccount.alias,
                cookies: req.body.cookies ? req.body.cookies : existingAccount.cookies,
                password: req.body.password ? req.body.password : existingAccount.password,
                accountType: nextAccountType,
                familyId: nextAccountType === 'family' ? (req.body.familyId || existingAccount.familyId || '') : null,
                cloudStrmPrefix: req.body.cloudStrmPrefix ?? existingAccount.cloudStrmPrefix,
                localStrmPrefix: req.body.localStrmPrefix ?? existingAccount.localStrmPrefix
            });

            if (!mergedAccount.username.startsWith('n_') && req.body.password) {
                Cloud189Service.invalidateByUsername(mergedAccount.username);
                const cloud189 = Cloud189Service.getInstance(mergedAccount);
                const loginResult = await cloud189.login(mergedAccount.username, mergedAccount.password, req.body.validateCode);
                if (!loginResult.success) {
                    if (loginResult.code == "NEED_CAPTCHA") {
                        res.json({
                            success: false,
                            code: "NEED_CAPTCHA",
                            data: {
                                captchaUrl: loginResult.data
                            }
                        });
                        return;
                    }
                    res.json({ success: false, error: loginResult.message });
                    return;
                }
            }

            if (!mergedAccount.username.startsWith('n_') && mergedAccount.accountType === 'family') {
                const cloud189 = Cloud189Service.getInstance(mergedAccount);
                mergedAccount.familyId = await cloud189.resolveFamilyId(mergedAccount.familyId || null);
            }

            await accountRepo.save(mergedAccount);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

     // 清空回收站
     app.delete('/api/accounts/recycle', async (req, res) => {
        try {
            taskService.clearRecycleBin(true, true);
            res.json({ success: true, data: "ok" });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.delete('/api/accounts/:id', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');

            // 历史 sqlite schema 中外键并非 CASCADE，删除账号前显式清理依赖数据。
            await commonFolderRepo.delete({ accountId });
            await taskRepo.delete({ accountId });

            Cloud189Service.invalidateByUsername(account.username);
            await accountRepo.remove(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });
    app.put('/api/accounts/:id/strm-prefix', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { strmPrefix, type } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            if (type == 'local') {
                account.localStrmPrefix = strmPrefix;
            }
            if (type == 'cloud') {
                account.cloudStrmPrefix = strmPrefix;
            }
            if (type == 'emby') {
                account.embyPathReplace = strmPrefix;
            }
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    // 修改别名
    app.put('/api/accounts/:id/alias', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { alias } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            account.alias = alias;
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
    app.put('/api/accounts/:id/default', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            // 清除所有账号的默认状态
            await accountRepo.update({}, { isDefault: false });
            // 设置指定账号为默认
            await accountRepo.update({ id: accountId }, { isDefault: true });
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
    // 任务相关API
    app.get('/api/tasks', async (req, res) => {
        const { status, search } = req.query;
        let whereClause = { }; // 用于构建最终的 where 条件

        // 基础条件（AND）
        if (status && status !== 'all') {
            whereClause.status = status;
        }
        whereClause.enableSystemProxy = Or(IsNull(), false);

        // 添加搜索过滤
        if (search) {
            const searchConditions = [
                { resourceName: Like(`%${search}%`) },
                { realFolderName: Like(`%${search}%`) },
                { remark: Like(`%${search}%`) },
                { taskGroup: Like(`%${search}%`) },
                { account: { username: Like(`%${search}%`) } }
            ];
            if (Object.keys(whereClause).length > 0) {
                whereClause = searchConditions.map(searchCond => ({
                    ...whereClause, // 包含基础条件 (如 status)
                    ...searchCond   // 包含一个搜索条件
                }));
            }else{
                whereClause = searchConditions;
            }
        }
        const tasks = await taskRepo.find({
            order: { id: 'DESC' },
            relations: {
                account: true
            },
            where: whereClause
        });
        await taskService.syncTaskProgressFromProcessedRecords(tasks);
        // username脱敏
        tasks.forEach(task => {
            task.account.username = task.account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
            task.account.accountType = task.account.accountType || 'personal';
        });
        res.json({ success: true, data: tasks });
    });

    app.get('/api/organizer/tasks', async (req, res) => {
        try {
            const search = String(req.query.search || '').trim();
            let tasks = await taskRepo.find({
                relations: {
                    account: true
                },
                select: {
                    account: {
                        username: true,
                        alias: true,
                        accountType: true
                    }
                },
                order: {
                    id: 'DESC'
                }
            });

            if (search) {
                const normalizedSearch = search.toLowerCase();
                tasks = tasks.filter(task => [
                    task.resourceName,
                    task.remark,
                    task.taskGroup,
                    task.account?.username,
                    task.account?.alias
                ].some(value => String(value || '').toLowerCase().includes(normalizedSearch)));
            }

            tasks.forEach(task => {
                if (task.account?.username) {
                    task.account.username = task.account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
                }
                task.account && (task.account.accountType = task.account.accountType || 'personal');
            });
            res.json({ success: true, data: tasks });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const tasks = await taskService.createTask(req.body);
            if (req.body?.executeNow) {
                for (const createdTask of tasks || []) {
                    const taskWithAccount = await taskService.getTaskById(createdTask.id);
                    if (taskWithAccount) {
                        await taskService.processTask(taskWithAccount);
                    }
                }
            }
            res.json({ success: true, data: tasks });
        } catch (error) {
            console.log(error)
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/batch-create', async (req, res) => {
        try {
            const result = await taskService.createTasksBatch(req.body.tasks);
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/batch', async (req, res) => {
        try {
            const taskIds = req.body.taskIds;
            const deleteCloud = req.body.deleteCloud;
            await taskService.deleteTasks(taskIds, deleteCloud);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 删除任务文件
    app.delete('/api/tasks/files', async (req, res) => {
        try{
            const { taskId, files } = req.body;
            if (!files || files.length === 0) {
                throw new Error('未选择要删除的文件');
            }
            await taskService.deleteFiles(taskId, files);
            res.json({ success: true, data: null });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.get('/api/tasks/processed-files', async (req, res) => {
        try {
            const taskIds = String(req.query.taskIds || '')
                .split(',')
                .map(id => parseInt(id))
                .filter(id => Number.isInteger(id) && id > 0);
            if (taskIds.length === 0) throw new Error('任务ID不能为空');
            const syncUpdatedCount = await taskService.syncProcessedRecordsWithActualFilesByTaskIds(taskIds);
            const records = await taskService.getProcessedRecordsByTaskIds(taskIds, {
                status: String(req.query.status || 'all'),
                search: String(req.query.search || '').trim()
            });
            res.json({ success: true, data: records, syncUpdatedCount });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/processed-files', async (req, res) => {
        try {
            if (Array.isArray(req.body?.recordIds)) {
                await taskService.deleteProcessedRecordsByIds(req.body.recordIds);
                return res.json({ success: true });
            }

            const taskIds = Array.isArray(req.body?.taskIds)
                ? req.body.taskIds
                : String(req.query.taskIds || '')
                    .split(',')
                    .filter(Boolean);
            await taskService.resetProcessedRecordsByTaskIds(taskIds);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            const deleteCloud = req.body.deleteCloud;
            await taskService.deleteTask(parseInt(req.params.id), deleteCloud);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });


    app.put('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const updatedTask = await taskService.updateTask(taskId, req.body);
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/replace-source', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const updatedTask = await taskService.replaceTaskSource(taskId, req.body || {});
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/execute', async (req, res) => {
        try {
            const task = await taskRepo.findOne({
                where: { id: parseInt(req.params.id) },
                relations: {
                    account: true
                },
                select: {
                    account: {
                        username: true,
                        localStrmPrefix: true,
                        cloudStrmPrefix: true,
                        embyPathReplace: true
                    }
                }
            });
            if (!task) throw new Error('任务不存在');
            logTaskEvent(`================================`);
            const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
            logTaskEvent(`任务[${taskName}]开始执行`);
            const result = await taskService.processTask(task);
            if (result) {
                messageUtil.sendMessage(result)
            }
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/repair', authenticateSession, async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const result = await taskService.repairTaskStatus(taskId);
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tasks/:id/season-info', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            if (!taskId) throw new Error('任务ID不能为空');
            const task = await taskRepo.findOneBy({ id: taskId });
            if (!task) throw new Error('任务不存在');
            logTaskEvent(`任务[${task.resourceName}]开始识别 TMDB 季集数`, 'info', 'tmdb');
            const result = await taskService.resolveTmdbSeasonInfo(task, { updateTask: false });
            logTaskEvent(`任务[${task.resourceName}]识别 TMDB 季集数完成: ${result.seasonNumber ? `S${String(result.seasonNumber).padStart(2, '0')} ` : ''}${result.totalEpisodes || 0}集`, 'info', 'tmdb');
            res.json({ success: true, data: result });
        } catch (error) {
            logTaskEvent(`识别 TMDB 季集数失败: ${error.message}`, 'error', 'tmdb');
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/sync-season-episodes', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            if (!taskId) throw new Error('任务ID不能为空');
            const task = await taskRepo.findOneBy({ id: taskId });
            if (!task) throw new Error('任务不存在');
            logTaskEvent(`任务[${task.resourceName}]开始同步 TMDB 季集数`, 'info', 'tmdb');
            const result = await taskService.resolveTmdbSeasonInfo(task, { updateTask: true });
            logTaskEvent(`任务[${task.resourceName}]同步 TMDB 季集数完成: ${result.seasonNumber ? `S${String(result.seasonNumber).padStart(2, '0')} ` : ''}${result.totalEpisodes || 0}集`, 'info', 'tmdb');
            res.json({ success: true, data: result });
        } catch (error) {
            logTaskEvent(`同步 TMDB 季集数失败: ${error.message}`, 'error', 'tmdb');
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tasks/:id/processed-files', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            if (!taskId) throw new Error('任务ID不能为空');
            const syncUpdatedCount = await taskService.syncProcessedRecordsWithActualFilesByTaskIds([taskId]);
            const records = await taskService.getProcessedRecords(taskId, {
                status: String(req.query.status || 'all'),
                search: String(req.query.search || '').trim()
            });
            res.json({ success: true, data: records, syncUpdatedCount });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/:id/processed-files', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            if (!taskId) throw new Error('任务ID不能为空');
            await taskService.resetProcessedRecords(taskId);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/:id/processed-files/:recordId', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const recordId = parseInt(req.params.recordId);
            if (!taskId || !recordId) throw new Error('参数不能为空');
            await taskService.deleteProcessedRecord(taskId, recordId);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/organizer/tasks/:id/run', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const result = await organizerService.organizeTaskById(taskId, {
                triggerStrm: true,
                force: true
            });
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/auto-series', async (req, res) => {
        try {
            console.log('[API] POST /api/auto-series body:', req.body);
            const result = await autoSeriesService.createByTitle(req.body || {});
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 手动模式：先搜索候选资源，由前端选择后再调用 /api/auto-series 创建
    app.get('/api/auto-series/search', async (req, res) => {
        try {
            const result = await autoSeriesService.searchResources({
                title: req.query.title,
                year: req.query.year
            });
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // TMDB 相关 API
    app.get('/api/tmdb/trending', async (req, res) => {
        try {
            const { type, window } = req.query;
            const result = await tmdbService.getTrending(type || 'all', window || 'day');
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tmdb/popular', async (req, res) => {
        try {
            const { type, page } = req.query;
            const result = await tmdbService.getPopular(type || 'movie', page || 1);
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // CAS 秒传相关 API
    app.post('/api/cas/restore', async (req, res) => {
        try {
            const { accountId, folderId, casContent, fileName } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const casInfo = CasService.parseCasContent(casContent);
            const result = await casService.restoreFromCas(cloud189, folderId, casInfo, fileName || casInfo.name);
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 云端CAS文件恢复 - 下载并解析云端CAS文件后恢复
    app.post('/api/cas/restore-file', async (req, res) => {
        try {
            const { accountId, folderId, casFileId, casFileName } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            
            // 下载并解析CAS文件
            const casInfo = await casService.downloadAndParseCas(cloud189, casFileId);
            const restoreName = CasService.getOriginalFileName(casFileName, casInfo);
            
            // 执行恢复
            const result = await casService.restoreFromCas(cloud189, folderId, casInfo, restoreName);
            
            // 恢复后删除CAS文件（如果配置启用）
            await casService.deleteCasFileAfterRestore(cloud189, casFileId, casFileName, account.accountType === 'family');
            
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 恢复并播放 - 临时恢复文件用于播放
    app.post('/api/cas/restore-and-play', async (req, res) => {
        try {
            const { CasPlaybackService } = require('./services/casPlaybackService');
            const { accountId, casFileId, casFileName, folderId } = req.body;
            
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            
            const playbackService = new CasPlaybackService();
            const result = await playbackService.restoreAndGetPlaybackUrl(
                cloud189, casFileId, casFileName, folderId || '-11'
            );
            
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // CAS自动恢复配置管理
    app.get('/api/cas/auto-restart-config', async (req, res) => {
        try {
            const config = ConfigService.getConfigValue('cas', {});
            res.json({ 
                success: true, 
                data: {
                    enableAutoRestore: config.enableAutoRestore || false,
                    autoRestorePaths: config.autoRestorePaths || [],
                    deleteCasAfterRestore: config.deleteCasAfterRestore !== false,
                    deleteSourceAfterGenerate: config.deleteSourceAfterGenerate || false,
                    enableFamilyTransit: config.enableFamilyTransit !== false,
                    familyTransitFirst: config.familyTransitFirst || false,
                    scanInterval: config.scanInterval || 300
                }
            });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/cas/auto-restart-config', async (req, res) => {
        try {
            const { 
                enableAutoRestore, 
                autoRestorePaths, 
                deleteCasAfterRestore,
                deleteSourceAfterGenerate,
                enableFamilyTransit,
                familyTransitFirst,
                scanInterval
            } = req.body;
            
            ConfigService.setConfigValue('cas.enableAutoRestore', enableAutoRestore);
            ConfigService.setConfigValue('cas.autoRestorePaths', autoRestorePaths || []);
            ConfigService.setConfigValue('cas.deleteCasAfterRestore', deleteCasAfterRestore !== false);
            ConfigService.setConfigValue('cas.deleteSourceAfterGenerate', deleteSourceAfterGenerate || false);
            ConfigService.setConfigValue('cas.enableFamilyTransit', enableFamilyTransit !== false);
            ConfigService.setConfigValue('cas.familyTransitFirst', familyTransitFirst || false);
            ConfigService.setConfigValue('cas.scanInterval', scanInterval || 300);
            
            // 重启监控服务
            const { casMonitorService } = require('./services/casMonitorService');
            if (enableAutoRestore) {
                casMonitorService.reload();
            } else {
                casMonitorService.stop();
            }
            
            res.json({ success: true, data: '配置已保存' });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 手动触发CAS扫描
    app.post('/api/cas/trigger-scan', async (req, res) => {
        try {
            const { accountId, folderId } = req.body;
            const { casMonitorService } = require('./services/casMonitorService');
            const result = await casMonitorService.triggerScan(accountId, folderId);
            res.json(result);
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 获取CAS监控状态
    app.get('/api/cas/monitor-status', async (req, res) => {
        try {
            const { casMonitorService } = require('./services/casMonitorService');
            const status = casMonitorService.getStatus();
            res.json({ success: true, data: status });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 批量清理CAS文件
    app.post('/api/cas/batch-cleanup', async (req, res) => {
        try {
            const { CasCleanupService } = require('./services/casCleanupService');
            const { accountId, folderId, options } = req.body;
            
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            
            const cleanupService = new CasCleanupService();
            const result = await cleanupService.batchCleanupCasFiles(cloud189, folderId, options);
            
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/cas/create', async (req, res) => {
        try {
            const { accountId, fileId, parentId } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            
            const result = await cloud189.listFiles(parentId || '-11');
            const file = (result?.fileListAO?.fileList || []).find(f => String(f.id) === String(fileId));
            
            if (!file) throw new Error('未找到文件或文件信息不完整(需MD5)');
            
            const casContent = CasService.generateCasContent(file, 'base64');
            
            // 生成CAS后删除源文件（如果配置启用）
            await casService.deleteSourceFileAfterGenerate(cloud189, fileId, file.name || file.fileName, account.accountType === 'family');
            
            res.json({ success: true, data: { casContent, fileName: (file.name || file.fileName) + '.cas' } });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/cas/generate-folder-files', async (req, res) => {
        try {
            const { accountId, jobs, format, overwrite } = req.body || {};
            const account = await accountRepo.findOneBy({ id: Number(accountId) });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const result = await casService.generateCasFilesToCloud(cloud189, jobs, {
                format,
                overwrite: overwrite !== false
            });
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('生成云端CAS文件失败:', error);
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/cas/export-folder-to-cloud', async (req, res) => {
        try {
            const { accountId, sourceFolderId, targetFolderId, recursive, overwrite } = req.body || {};
            const account = await accountRepo.findOneBy({ id: Number(accountId) });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const result = await casService.exportFolderCasFilesToCloud(cloud189, sourceFolderId, targetFolderId, {
                recursive: recursive !== false,
                overwrite: overwrite !== false,
                mediaOnly: true
            });
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('网盘文件另存为CAS失败:', error);
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/cas/export-folder', async (req, res) => {
        try {
            const { accountId, folderId } = req.body;
            const account = await accountRepo.findOneBy({ id: Number(accountId) });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            
            const exportData = [];
            
            // 递归扫描函数
            const scanFolder = async (fId) => {
                logTaskEvent(`[CAS Export] 正在扫描目录: ${fId}`);
                const result = await cloud189.listFiles(fId);
                
                const listAO = result?.fileListAO || {};
                const files = Array.isArray(listAO.fileList) ? listAO.fileList : (Array.isArray(result?.fileList) ? result.fileList : []);
                const folders = Array.isArray(listAO.folderList) ? listAO.folderList : (Array.isArray(result?.folderList) ? result.folderList : []);
                
                logTaskEvent(`[CAS Export] 目录 ${fId} 下找到 ${files.length} 个文件, ${folders.length} 个文件夹`);

                for (const f of files) {
                    try {
                        let md5 = f.md5 || f.fileMd5 || f.md5Sum;
                        let sliceMd5 = f.sliceMd5 || f.slice_md5 || f.slice_md5_hash;
                        let size = f.size || f.fileSize;
                        
                        // 某些接口返回的字段名不同，做最后补救
                        if (!md5) md5 = f.fileMd5;
                        if (!size) size = f.fileSize;

                        const name = f.name || f.fileName || '';
                        const isMedia = ['.mp4', '.mkv', '.ts', '.iso', '.rmvb', '.avi', '.mp3', '.flac', '.mov', '.wmv'].some(ext => name.toLowerCase().endsWith(ext));
                        
                        if (!md5 && isMedia) {
                            logTaskEvent(`[CAS Export] 列表无MD5，尝试获取详情: ${name}`);
                            const detail = await cloud189.getFileInfo(f.id || f.fileId);
                            if (detail) {
                                md5 = detail.md5 || detail.fileMd5;
                                sliceMd5 = detail.sliceMd5 || detail.slice_md5;
                                size = detail.size || detail.fileSize;
                            }
                        }

                        if (md5) {
                            logTaskEvent(`[CAS Export] 命中文件: ${name}, MD5: ${md5}`);
                            const content = CasService.generateCasContent({
                                name: name,
                                size: size,
                                md5: md5,
                                sliceMd5: sliceMd5 || md5
                            }, 'base64');
                            
                            exportData.push({ name, content });
                        } else {
                            logTaskEvent(`[CAS Export] 跳过文件(无MD5): ${name}`);
                        }
                    } catch (e) {
                        logTaskEvent(`[CAS Export] 处理文件出错 ${f.name || f.fileName}: ${e.message}`);
                    }
                }
                
                for (const subFolder of folders) {
                    await scanFolder(subFolder.id || subFolder.fileId);
                }
            };

            await scanFolder(folderId || '-11');
            
            res.json({ success: true, data: exportData });
        } catch (error) {
            console.error('递归导出存根失败:', error);
            res.json({ success: false, error: error.message });
        }
    });
    // 根据任务生成STRM文件
    app.post('/api/tasks/strm', async (req, res) => {
        try {
            const taskIds = req.body.taskIds;
            if (!taskIds || taskIds.length == 0) {
                throw new Error('任务ID不能为空');
            }
            const overwrite = req.body.overwrite || false;
            taskService.createStrmFileByTask(taskIds, overwrite);
            return res.json({ success: true, data: 'ok' });
        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
     // 获取目录树
     app.get('/api/folders/:accountId', async (req, res) => {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '-11';
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `folders_${accountId}_${folderId}`;
            // forceRefresh 为true 则清空所有folders_开头的缓存
            if (forceRefresh) {
                folderCache.clearPrefix("folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                throw new Error('获取目录失败');
            }
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', async (req, res) => {
        try {
            const taskId = parseInt(req.query.taskId);
            const folderId = req.query.folderId;
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `share_folders_${taskId}_${folderId}`;
            if (forceRefresh) {
                folderCache.clearPrefix("share_folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const task = await taskRepo.findOneBy({ id: parseInt(taskId) });
            if (!task) {
                throw new Error('任务不存在');
            }
            if (folderId == -11) {
                // 返回顶级目录
                res.json({success: true, data: [{id: task.shareFileId, name: task.resourceName}]});
                return 
            }
            const account = await accountRepo.findOneBy({ id: req.params.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            // 查询分享目录
            const shareDir = await cloud189.listShareDir(task.shareId, req.query.folderId, task.shareMode);
            if (!shareDir || !shareDir.fileListAO) {
                res.json({ success: true, data: [] });    
            }
            const folders = shareDir.fileListAO.folderList;
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

     // 获取目录下的文件
     app.get('/api/folder/files', async (req, res) => {
        const { accountId, taskId } = req.query;
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = await taskRepo.findOneBy({ id: taskId });
        if (!task) {
            throw new Error('任务不存在');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        try {
            const fileList =  await taskService.getAllFolderFiles(cloud189, task);    
            res.json({ success: true, data: fileList });
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/file-manager/list', async (req, res) => {
        try {
            const accountId = parseInt(req.query.accountId);
            const folderId = req.query.folderId || '-11';
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const result = await cloud189.listFiles(folderId);
            
            const listAO = result?.fileListAO || {};
            const rawFolders = Array.isArray(listAO.folderList) ? listAO.folderList : (Array.isArray(result?.folderList) ? result.folderList : []);
            const rawFiles = Array.isArray(listAO.fileList) ? listAO.fileList : (Array.isArray(result?.fileList) ? result.fileList : []);

            const folderList = rawFolders.map((folder) => ({
                id: String(folder.id || folder.fileId),
                name: folder.name || folder.fileName,
                isFolder: true,
                size: Number(folder.size || 0),
                lastOpTime: folder.lastOpTime || folder.lastModifyTime || folder.createDate || ''
            }));
            const fileList = rawFiles.map((file) => ({
                id: String(file.id || file.fileId),
                name: file.name || file.fileName,
                isFolder: false,
                size: Number(file.size || 0),
                lastOpTime: file.lastOpTime || file.lastModifyTime || file.createDate || '',
                ext: path.extname(file.name || file.fileName || '').toLowerCase()
            }));
            const entries = [...folderList, ...fileList].sort((left, right) => {
                if (left.isFolder !== right.isFolder) {
                    return left.isFolder ? -1 : 1;
                }
                return String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN');
            });

            res.json({
                success: true,
                data: {
                    currentFolderId: folderId,
                    accountType: account.accountType || 'personal',
                    driveLabel: account.accountType === 'family' ? '家庭云' : '个人云',
                    entries
                }
            });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/folder', async (req, res) => {
        try {
            const accountId = parseInt(req.body.accountId);
            const parentFolderId = req.body.parentFolderId || '-11';
            const folderName = String(req.body.folderName || '').trim();
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!folderName) {
                throw new Error('目录名称不能为空');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const createResult = await cloud189.createFolder(folderName, parentFolderId);
            if (!createResult || createResult.res_code && createResult.res_code !== 0) {
                throw new Error(createResult?.res_msg || '创建目录失败');
            }
            folderCache.clearPrefix('folders_');
            res.json({ success: true, data: createResult });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/rename', async (req, res) => {
        try {
            const accountId = parseInt(req.body.accountId);
            const fileId = String(req.body.fileId || '').trim();
            const destFileName = String(req.body.destFileName || '').trim();
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!fileId) {
                throw new Error('文件ID不能为空');
            }
            if (!destFileName) {
                throw new Error('新名称不能为空');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const renameResult = await cloud189.renameFile(fileId, destFileName);
            if (!renameResult || renameResult.res_code && renameResult.res_code !== 0) {
                throw new Error(renameResult?.res_msg || '重命名失败');
            }
            folderCache.clearPrefix('folders_');
            res.json({ success: true, data: renameResult });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/batch-rename', async (req, res) => {
        try {
            const accountId = parseInt(req.body.accountId);
            const files = Array.isArray(req.body.files) ? req.body.files : [];
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!files.length) {
                throw new Error('未选择需要重命名的文件');
            }

            const normalizedFiles = files.map((file) => ({
                fileId: String(file?.fileId || '').trim(),
                oldName: String(file?.oldName || '').trim(),
                destFileName: String(file?.destFileName || '').trim()
            })).filter((file) => file.fileId && file.destFileName);

            if (!normalizedFiles.length) {
                throw new Error('未生成有效的重命名计划');
            }

            const duplicateName = normalizedFiles.find((file, index) =>
                normalizedFiles.findIndex((item) => item.destFileName === file.destFileName) !== index
            );
            if (duplicateName) {
                throw new Error(`目标文件名重复: ${duplicateName.destFileName}`);
            }

            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const failures = [];
            let successCount = 0;

            for (const file of normalizedFiles) {
                const renameResult = await cloud189.renameFile(file.fileId, file.destFileName);
                if (!renameResult || (renameResult.res_code && renameResult.res_code !== 0)) {
                    failures.push(`${file.oldName || file.fileId} -> ${file.destFileName}: ${renameResult?.res_msg || '重命名失败'}`);
                    continue;
                }
                successCount++;
            }

            folderCache.clearPrefix('folders_');
            res.json({
                success: failures.length === 0,
                data: {
                    successCount,
                    failureCount: failures.length,
                    failures
                },
                error: failures.length ? '部分文件重命名失败' : undefined
            });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/delete', async (req, res) => {
        try {
            const accountId = parseInt(req.body.accountId);
            const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!entries.length) {
                throw new Error('未选择需要删除的文件');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const folders = entries.filter((entry) => entry.isFolder);
            const files = entries.filter((entry) => !entry.isFolder);
            if (folders.length) {
                await taskService.deleteCloudFile(cloud189, folders, 1);
            }
            if (files.length) {
                await taskService.deleteCloudFile(cloud189, files, 0);
            }
            folderCache.clearPrefix('folders_');
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

        // 批量转换 .cas 存根
    app.post('/api/file-manager/batch-convert-cas', async (req, res) => {
        try {
            const { accountId, fileIds } = req.body || {};
            const account = await accountRepo.findOneBy({ id: Number(accountId) });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const MEDIA_EXTS = ['.mkv', '.iso', '.ts', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.mpg', '.flv', '.rm', '.mov'];
            let count = 0;
            for (const fileId of fileIds) {
                const fileInfo = await cloud189.getFileInfo(fileId);
                if (fileInfo && !fileInfo.isFolder) {
                    const ext = (fileInfo.name || '').split('.').pop().toLowerCase();
                    if (MEDIA_EXTS.includes('.' + ext)) {
                        await cloud189.renameFile(fileId, `${fileInfo.name}.cas`);
                        count++;
                    }
                }
            }
            res.json({ success: true, data: { count } });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/move', async (req, res) => {
        try {
            const accountId = parseInt(req.body.accountId);
            const targetFolderId = String(req.body.targetFolderId || '').trim();
            const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!targetFolderId) {
                throw new Error('目标目录不能为空');
            }
            if (!entries.length) {
                throw new Error('未选择需要移动的文件');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            await taskService.moveCloudFile(cloud189, entries.map((entry) => ({
                id: entry.id,
                name: entry.name,
                isFolder: entry.isFolder
            })), targetFolderId);
            folderCache.clearPrefix('folders_');
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/file-manager/download-link', async (req, res) => {
        try {
            const accountId = parseInt(req.query.accountId);
            const fileId = String(req.query.fileId || '').trim();
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            if (!fileId) {
                throw new Error('文件ID不能为空');
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const downloadUrl = await cloud189.getDownloadLink(fileId);
            res.json({ success: true, data: { url: downloadUrl } });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/files/rename', async (req, res) => {
        const {taskId, accountId, files, sourceRegex, targetRegex } = req.body;
        if (files.length == 0) {
            throw new Error('未获取到需要修改的文件');
        }
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = await taskService.getTaskById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }
        // 从realFolderName中获取文件夹名称 删除对应的本地文件
        const folderName = task.realFolderName.substring(task.realFolderName.indexOf('/') + 1);
        const strmService = new StrmService();
        const strmEnabled = ConfigService.getConfigValue('strm.enable') && task.account.localStrmPrefix
        if (strmEnabled && task.enableSystemProxy){
            throw new Error('系统代理模式已移除');
        }
        const newFiles = files.map(file => ({id: file.fileId, name: file.destFileName}))
        if(task.enableSystemProxy) {
            throw new Error('系统代理模式已移除');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const result = []
        const successFiles = []
        for (const file of files) {
            const renameResult = await cloud189.renameFile(file.fileId, file.destFileName);
            if (!renameResult) {
                throw new Error('重命名失败');
            }
            if (renameResult.res_code != 0) {
                result.push(`文件${file.destFileName} ${renameResult.res_msg}`)
            }else{
                if (strmEnabled){
                    // 从realFolderName中获取文件夹名称 删除对应的本地文件
                    const oldFile = path.join(folderName, file.oldName);
                    await strmService.delete(path.join(task.account.localStrmPrefix, oldFile))
                }
                successFiles.push({id: file.fileId, name: file.destFileName})
            }
        }
        // 重新生成STRM文件
        if (strmEnabled){
            strmService.generate(task, successFiles, false, false)
        }
        if (sourceRegex && targetRegex) {
            task.sourceRegex = sourceRegex
            task.targetRegex = targetRegex
            taskRepo.save(task)
        }
        if (result.length > 0) {
            logTaskEvent(result.join('\n'));
        }
        res.json({ success: true, data: result });
    });

    app.post('/api/tasks/executeAll', async (req, res) => {
        taskService.processAllTasks(true);
        res.json({ success: true, data: null });
    });

    app.get('/api/subscriptions', async (req, res) => {
        try {
            const subscriptions = await subscriptionService.listSubscriptions();
            res.json({ success: true, data: subscriptions });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/subscriptions/preview', async (req, res) => {
        try {
            const preview = await subscriptionService.previewSubscriptionCreation(req.query);
            res.json({ success: true, data: preview });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/subscriptions', async (req, res) => {
        try {
            const subscription = await subscriptionService.createSubscription(req.body);
            res.json({ success: true, data: subscription });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.put('/api/subscriptions/:id', async (req, res) => {
        try {
            const subscription = await subscriptionService.updateSubscription(parseInt(req.params.id), req.body);
            res.json({ success: true, data: subscription });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/subscriptions/:id/refresh', async (req, res) => {
        try {
            const result = await subscriptionService.refreshSubscription(parseInt(req.params.id));
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/subscriptions/:id', async (req, res) => {
        try {
            await subscriptionService.deleteSubscription(parseInt(req.params.id));
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/subscriptions/:id/resources', async (req, res) => {
        try {
            const resources = await subscriptionService.listResources(parseInt(req.params.id));
            res.json({ success: true, data: resources });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/subscriptions/:id/resources', async (req, res) => {
        try {
            const resource = await subscriptionService.createResource(parseInt(req.params.id), req.body);
            res.json({ success: true, data: resource });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/subscriptions/resources/:id', async (req, res) => {
        try {
            await subscriptionService.deleteResource(parseInt(req.params.id));
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/subscriptions/resources/:id/browse', async (req, res) => {
        try {
            const entries = await subscriptionService.browseResource(
                parseInt(req.params.id),
                req.query.folderId,
                req.query.keyword
            );
            res.json({ success: true, data: entries });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 系统设置
    app.get('/api/settings', async (req, res) => {
        res.json({success: true, data: ConfigService.getConfig()})
    })

    app.post('/api/settings', async (req, res) => {
        const settings = req.body;
        SchedulerService.handleScheduleTasks(settings,taskService);
        ConfigService.setConfig(settings)
        await botManager.handleBotStatus(
        settings.telegram?.botToken,
        settings.telegram?.chatId,
        settings.telegram?.enable,
        settings.telegram?.proxyDomain
        );
        // 修改配置, 重新实例化消息推送
        messageUtil.updateConfig()
        Cloud189Service.setProxy()
        await embyPrewarmService.reload();
        res.json({success: true, data: null})
    })


    // 保存媒体配置
    app.post('/api/settings/media', async (req, res) => {
        try {
            const settings = req.body;
            // 如果cloudSaver的配置变更 就清空cstoken.json
            if (settings.cloudSaver?.baseUrl != ConfigService.getConfigValue('cloudSaver.baseUrl')
            || settings.cloudSaver?.username != ConfigService.getConfigValue('cloudSaver.username')
            || settings.cloudSaver?.password != ConfigService.getConfigValue('cloudSaver.password')
        ) {
                clearCloudSaverToken();
            }
            ConfigService.setConfig(settings)
            await syncStandaloneEmbyProxyServer(embyService);
            await embyPrewarmService.reload();
            res.json({success: true, data: null})
        } catch (error) {
            res.json({success: false, error: error.message})
        }
    })

    app.get('/api/settings/regex-presets', async (req, res) => {
        try {
            res.json({ success: true, data: ConfigService.getConfigValue('regexPresets', []) });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.post('/api/settings/regex-presets', async (req, res) => {
        try {
            const regexPresets = Array.isArray(req.body.regexPresets) ? req.body.regexPresets : [];
            ConfigService.setConfigValue('regexPresets', regexPresets);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.get('/api/version', (req, res) => {
        res.json({ version: currentVersion });
    });

    app.post('/api/strm/lazy-share/generate', async (req, res) => {
        try {
            const result = await lazyShareStrmService.generateFromShare(req.body || {});
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/stream/:token', async (req, res) => {
        try {
            const payload = streamProxyService.parseToken(req.params.token);
            const latestUrl = payload.type === 'lazyShare'
                ? await lazyShareStrmService.resolveLatestUrlByPayload(payload)
                : await streamProxyService.resolveLatestUrlByPayload(payload);
            res.set('Cache-Control', 'no-store');
            res.redirect(302, latestUrl);
        } catch (error) {
            res.status(403).json({ success: false, error: error.message });
        }
    });

    // 解析分享链接
    app.post('/api/share/parse', async (req, res) => {
        try{
            const shareLink = req.body.shareLink;
            const accountId = req.body.accountId;
            const accessCode = req.body.accessCode;
            const shareFolders = await taskService.parseShareFolderByShareLink(shareLink, accountId, accessCode);
            res.json({success: true, data: shareFolders})
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    // 保存常用目录
    app.post('/api/saveFavorites', async (req, res) => {
        try{
            const favorites = req.body.favorites;
            const accountId = req.body.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            // 先删除该账号下的所有常用目录
            await commonFolderRepo.delete({ accountId: accountId });
            // 构建新的常用目录数据
            const commonFolders = favorites.map(favorite => ({
                accountId: accountId,
                name: favorite.name,
                path: favorite.path,
                id: favorite.id
            }));
            if (commonFolders.length == 0) {
                res.json({ success: true, data: [] });
                return;
            }
            // 批量保存新的常用目录
            const result = await commonFolderRepo.save(commonFolders);
            res.json({ success: true, data: result });
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    // 获取常用目录
    app.get('/api/favorites/:accountId', async (req, res) => {
        try{
            const accountId = req.params.accountId;
            if (!accountId) {
                throw new Error('账号ID不能为空');
            }
            const favorites = await commonFolderRepo.find({
                where: { accountId: accountId },
                order: { id: 'ASC' }
            });
            res.json({ success: true, data: favorites });
        }catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    })
    
    // emby 回调
    app.post('/emby/notify', async (req, res) => {
        try {
            await embyService.handleWebhookNotification(req.body);
            res.status(200).send('OK');
        }catch (error) {
            console.log(error);
            res.status(500).send('Error');
        }
    })

    const listRecentTasksForChat = async () => {
        return await taskRepo.find({
            order: { id: 'DESC' },
            take: 30
        });
    };

    const formatTaskLabel = (task) => {
        return task.shareFolderName ? `${task.resourceName}/${task.shareFolderName}` : task.resourceName;
    };

    const summarizeTaskForChat = (task) => {
        return `#${task.id} ${formatTaskLabel(task)} | 状态:${task.status} | 进度:${task.currentEpisodes || 0}/${task.totalEpisodes || '?'} | 整理器:${task.enableOrganizer ? '开' : '关'}`;
    };

    const normalizeChatPath = (value = '') => String(value || '').trim().replace(/^\/+|\/+$/g, '');
    const mediaFilePattern = /\.(mkv|mp4|avi|mov|m2ts|ts|flv|rmvb|wmv|iso|mpg|rm|cas)$/i;

    const resolveChatFolderAlias = (value = '') => {
        const normalized = normalizeChatPath(value).toLowerCase();
        if (!normalized) {
            return '';
        }
        if (['未刮削', 'unorganized', 'unscraped', 'unsorted'].includes(normalized)) {
            return '未刮削';
        }
        if (['未整理', 'unprocessed', 'unorganized-media'].includes(normalized)) {
            return '未整理';
        }
        return normalizeChatPath(value);
    };

    const parseTaskTmdbForChat = (task) => {
        try {
            return task?.tmdbContent ? JSON.parse(task.tmdbContent) : null;
        } catch (error) {
            return null;
        }
    };

    const resolveTaskMediaTypeForChat = (task) => {
        const tmdb = parseTaskTmdbForChat(task);
        const mediaType = String(tmdb?.type || tmdb?.media_type || task?.videoType || '').toLowerCase();
        if (mediaType === 'movie') {
            return 'movie';
        }
        if (mediaType === 'tv') {
            return 'tv';
        }
        return Number(task?.totalEpisodes || 0) > 1 ? 'tv' : 'movie';
    };

    const inferChatMediaType = (text = '') => {
        const normalized = String(text || '');
        const hasMovie = /电影/.test(normalized);
        const hasTv = /电视剧|剧集|连续剧/.test(normalized);
        if (hasMovie && !hasTv) {
            return 'movie';
        }
        if (hasTv && !hasMovie) {
            return 'tv';
        }
        return 'all';
    };

    const summarizeFolderTaskForChat = (task) => {
        const mediaType = resolveTaskMediaTypeForChat(task) === 'tv' ? '电视剧' : '电影';
        const currentPath = normalizeChatPath(task.realFolderName || '');
        return `#${task.id} ${formatTaskLabel(task)} | 类型:${mediaType} | 当前目录:${currentPath || '(空)'} | 进度:${task.currentEpisodes || 0}/${task.totalEpisodes || '?'}`;
    };

    const listTasksInFolderForChat = async (folderName = '', mediaType = 'all') => {
        const normalizedFolder = resolveChatFolderAlias(folderName);
        if (!normalizedFolder) {
            return [];
        }

        const tasks = await taskRepo.find({
            order: { id: 'DESC' },
            take: 200
        });

        return tasks.filter(task => {
            const currentPath = normalizeChatPath(task.realFolderName || '');
            if (!currentPath) {
                return false;
            }
            const inFolder = currentPath === normalizedFolder || currentPath.startsWith(`${normalizedFolder}/`);
            if (!inFolder) {
                return false;
            }
            if (mediaType === 'all') {
                return true;
            }
            return resolveTaskMediaTypeForChat(task) === mediaType;
        });
    };

    const listCloudMediaInFolderForChat = async (folderName = '', mediaType = 'all') => {
        const entries = await listCloudMediaEntriesInFolderForChat(folderName, mediaType);
        return entries.map(item => item.relativePath);
    };

    const listCloudMediaEntriesInFolderForChat = async (folderName = '', mediaType = 'all') => {
        const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
        const accountId = Number(autoCreateConfig.accountId || 0);
        const rootFolderId = String(autoCreateConfig.targetFolderId || '').trim();
        const configuredRootName = resolveChatFolderAlias(autoCreateConfig.targetFolder || '');
        const requestedFolder = resolveChatFolderAlias(folderName || configuredRootName);
        if (!accountId || !rootFolderId) {
            return [];
        }

        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            return [];
        }

        const cloud189 = Cloud189Service.getInstance(account);
        const results = [];
        const visited = new Set();
        const mediaTypeFilter = ['movie', 'tv'].includes(String(mediaType || '')) ? String(mediaType) : 'all';

        const inferPathMediaType = (pathName = '') => {
            if (/电视剧|动漫|综艺|纪录片/i.test(pathName)) {
                return 'tv';
            }
            if (/电影/i.test(pathName)) {
                return 'movie';
            }
            return 'all';
        };

        const walkFolder = async (folderId, currentPath, depth = 0) => {
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedFolderId || visited.has(normalizedFolderId) || depth > 6 || results.length >= 200) {
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
                const relativePath = normalizeChatPath(`${currentPath}/${fileName}`);
                const inferredType = inferPathMediaType(relativePath);
                if (mediaTypeFilter !== 'all' && inferredType !== 'all' && inferredType !== mediaTypeFilter) {
                    continue;
                }
                results.push({
                    id: String(file.id || file.fileId || '').trim(),
                    name: fileName,
                    parentFolderId: normalizedFolderId,
                    relativePath,
                    relativeDir: normalizeChatPath(path.posix.dirname(relativePath)),
                    size: Number(file.size || file.fileSize || 0),
                    md5: String(file.md5 || '').trim(),
                    isFolder: false
                });
                if (results.length >= 200) {
                    return;
                }
            }

            for (const folder of folderList) {
                const childId = String(folder.id || '').trim();
                const childName = String(folder.name || '').trim();
                if (!childId || !childName) {
                    continue;
                }
                await walkFolder(childId, normalizeChatPath(`${currentPath}/${childName}`), depth + 1);
                if (results.length >= 200) {
                    return;
                }
            }
        };

        if (requestedFolder && requestedFolder !== configuredRootName) {
            return [];
        }

        await walkFolder(rootFolderId, configuredRootName || requestedFolder || '未刮削', 0);
        return results;
    };

    const groupCloudEntriesForWorkflow = (requestedFolder = '', entries = []) => {
        const normalizedRoot = resolveChatFolderAlias(requestedFolder);
        const groups = new Map();
        const skipped = [];

        for (const entry of entries) {
            const relativePath = normalizeChatPath(entry?.relativePath || '');
            if (!relativePath) {
                continue;
            }
            const rootPrefix = `${normalizedRoot}/`;
            const relativeToRoot = relativePath === normalizedRoot
                ? ''
                : relativePath.startsWith(rootPrefix)
                    ? normalizeChatPath(relativePath.slice(rootPrefix.length))
                    : relativePath;
            const parts = relativeToRoot.split('/').filter(Boolean);
            if (parts.length < 2) {
                skipped.push(relativePath);
                continue;
            }

            const groupParts = parts.length >= 3
                ? parts.slice(0, 2)
                : parts.slice(0, 2);
            const groupTail = groupParts.join('/');
            const groupRootPath = normalizeChatPath(`${normalizedRoot}/${groupTail}`);
            const fileRelativeToGroup = normalizeChatPath(relativePath.substring(groupRootPath.length + 1));
            const fileRelativeDir = normalizeChatPath(path.posix.dirname(fileRelativeToGroup));
            const resourceName = groupParts[groupParts.length - 1] || path.posix.basename(groupRootPath);

            if (!groups.has(groupRootPath)) {
                groups.set(groupRootPath, {
                    groupPath: groupRootPath,
                    resourceName,
                    files: []
                });
            }
            groups.get(groupRootPath).files.push({
                ...entry,
                relativeDir: fileRelativeDir === '.' ? '' : fileRelativeDir,
                relativePath: fileRelativeToGroup
            });
        }

        return {
            groups: Array.from(groups.values()),
            skipped
        };
    };

    const resolveFolderTargetFromContext = (text = '', history = []) => {
        const directMatch = text.match(/(未刮削|未整理)(?:目录)?/);
        if (directMatch) {
            return directMatch[1];
        }

        for (let index = history.length - 1; index >= 0; index--) {
            const item = history[index];
            const content = String(item?.content || '');
            const matchedFolder = content.match(/(未刮削|未整理)(?:目录)?/);
            if (matchedFolder) {
                return matchedFolder[1];
            }
        }
        return '';
    };

    const splitChatCommands = (message = '') => {
        const normalized = String(message || '').trim();
        if (!normalized) {
            return [];
        }
        return normalized
            .split(/\s*(?:然后|再|并且|并|接着|之后|随后|,|，|；|;)\s*/g)
            .map(item => item.trim())
            .filter(Boolean);
    };

    const parseChatCommandHeuristically = (message, history = []) => {
        const text = String(message || '').trim();
        if (!text) {
            return null;
        }

        const taskIdMatch = text.match(/(?:任务\s*#?\s*|#)(\d+)/i) || text.match(/\b(\d{1,8})\b/);
        const taskId = taskIdMatch ? Number(taskIdMatch[1]) : null;
        const contextualFolder = resolveFolderTargetFromContext(text, history);

        if (/重启.*(容器|服务)|restart/i.test(text)) {
            return {
                mode: 'action',
                action: 'restart_container',
                target: { type: 'none', value: '' },
                reply: '我可以帮你重启当前服务进程。',
                needsConfirmation: false
            };
        }

        if (/列出|查看/.test(text) && /失败任务/.test(text)) {
            return {
                mode: 'action',
                action: 'list_tasks',
                target: { type: 'status', value: 'failed' },
                reply: '我来帮你查看失败任务。',
                needsConfirmation: false
            };
        }

        if (/列出|查看/.test(text) && /任务/.test(text)) {
            return {
                mode: 'action',
                action: 'list_tasks',
                target: { type: 'all', value: '' },
                reply: '我来帮你查看最近任务。',
                needsConfirmation: false
            };
        }

        const folderQueryMatch = text.match(/(未刮削|未整理)(?:目录)?/);
        if ((/列出|查看|查询|哪些|有没有|帮我查/.test(text)) && folderQueryMatch && (/(没移动|未移动|没整理|未整理|还在|没有归档|未归档|移动端)/.test(text) || /文件|资源|电影|电视剧|剧集/.test(text))) {
            const folderName = folderQueryMatch[1];
            return {
                mode: 'action',
                action: 'list_unorganized_media',
                target: {
                    type: 'folder_name',
                    value: folderName,
                    mediaType: inferChatMediaType(text)
                },
                reply: `我来帮你查询 ${folderName} 目录下仍停留在中转目录的媒体任务。`,
                needsConfirmation: false
            };
        }

        if ((/列出|查看|查询|多少|几个|数量|统计|帮我查/.test(text)) && folderQueryMatch && /(文件|资源|电影|电视剧|剧集)/.test(text)) {
            const folderName = folderQueryMatch[1];
            return {
                mode: 'action',
                action: 'list_unorganized_media',
                target: {
                    type: 'folder_name',
                    value: folderName,
                    mediaType: inferChatMediaType(text),
                    countOnly: true
                },
                reply: `我来帮你统计 ${folderName} 目录下当前还有多少未归档文件。`,
                needsConfirmation: false
            };
        }

        if (/(刮削|整理|重命名|移动|归档)/.test(text) && (folderQueryMatch || contextualFolder) && !taskId) {
            const workflowFolder = folderQueryMatch?.[1] || contextualFolder;
            return {
                mode: 'action',
                action: 'organize_folder_workflow',
                target: {
                    type: 'folder_name',
                    value: workflowFolder,
                    mediaType: inferChatMediaType(text)
                },
                reply: `我可以帮你查询 ${workflowFolder} 目录，并让程序按 TMDB 识别、重命名后再移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        if (/(刮削|整理|重命名|移动|归档)/.test(text) && contextualFolder && !taskId) {
            return {
                mode: 'action',
                action: 'run_organizer_folder',
                target: {
                    type: 'folder_name',
                    value: contextualFolder,
                    mediaType: inferChatMediaType(text)
                },
                reply: `我可以帮你把 ${contextualFolder} 目录下当前识别到的任务批量执行整理器。`,
                needsConfirmation: false
            };
        }

        if (/默认整理根目录|默认整理目录|整理根目录|默认整理地|默认整理位置|默认整理路径/.test(text) && contextualFolder && !taskId) {
            return {
                mode: 'action',
                action: 'run_organizer_folder',
                target: {
                    type: 'folder_name',
                    value: contextualFolder,
                    mediaType: inferChatMediaType(text)
                },
                reply: `我可以帮你把 ${contextualFolder} 目录下当前识别到的任务移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        if (/执行刮削|开始刮削|执行整理器|开始整理器/.test(text) && contextualFolder && !taskId) {
            return {
                mode: 'action',
                action: 'run_organizer_folder',
                target: {
                    type: 'folder_name',
                    value: contextualFolder,
                    mediaType: inferChatMediaType(text)
                },
                reply: `我可以帮你对 ${contextualFolder} 目录执行整理器并移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        if (/执行所有任务|运行所有任务/.test(text)) {
            return {
                mode: 'action',
                action: 'run_all_tasks',
                target: { type: 'all', value: '' },
                reply: '我可以帮你执行所有待处理任务。',
                needsConfirmation: false
            };
        }

        if (/通知.*emby|刷新.*emby/i.test(text)) {
            return {
                mode: 'action',
                action: 'notify_emby',
                target: taskId ? { type: 'task_id', value: String(taskId) } : { type: 'task_name', value: text.replace(/通知.*emby|刷新.*emby/ig, '').trim() },
                reply: '我可以帮你触发 Emby 通知。',
                needsConfirmation: false
            };
        }

        if (/搜索(剧名|电影|电视剧|名字|名称)/.test(text)) {
            // 只移除带 # 的 ID，保留普通数字 (如 101)
            const keyword = text.replace(/.*搜索(?:剧名|电影|电视剧|名字|名称)\s*/, '').replace(/#\d+/g, '').trim();
            return {
                mode: 'action',
                action: 'search_tmdb_candidates',
                target: { 
                    keyword: keyword || (taskId ? "" : text), 
                    taskId: taskId || undefined 
                },
                reply: `我来帮你搜索 "${keyword}" 的候选结果。`,
                needsConfirmation: false
            };
        }

        if (/绑定.*(?:为|到)?(电影|电视剧|tv|movie)\s*(?:id)?\s*:?\s*(\d+)/i.test(text) && taskId) {
            const match = text.match(/绑定.*(?:为|到)?(电影|电视剧|tv|movie)\s*(?:id)?\s*:?\s*(\d+)/i);
            const typeMap = { '电影': 'movie', 'movie': 'movie', '电视剧': 'tv', 'tv': 'tv' };
            const mediaType = typeMap[match[1]] || 'movie';
            const tmdbId = match[2];
            
            return {
                mode: 'action',
                action: 'correct_ai_recognition',
                target: { 
                    type: 'task_id', 
                    value: String(taskId),
                    tmdbId: tmdbId,
                    mediaType: mediaType
                },
                reply: `我来帮你将任务 #${taskId} 绑定为 [${match[1]}] ID: ${tmdbId}。`,
                needsConfirmation: false
            };
        }

        if (/识别(错|不对|有问题)|(不|没)识别对/.test(text) || (/它是|它是|正确的(?:剧名|名字)?是/.test(text) && taskId)) {
            let correction = text.replace(/.*(?:识别错|不对|有问题|不识别对|它是|正确的(?:剧名|名字)?是)/, '').replace(/[#\d]+/g, '').trim();
            const tmdbIdMatch = text.match(/tmdb\s*(?:id)?\s*:?\s*(\d+)/i) || text.match(/id\s*是\s*(\d+)/);
            
            return {
                mode: 'action',
                action: 'correct_ai_recognition',
                target: taskId ? { 
                    type: 'task_id', 
                    value: String(taskId),
                    correction: correction,
                    tmdbId: tmdbIdMatch ? tmdbIdMatch[1] : undefined
                } : { 
                    type: 'task_name', 
                    value: text.replace(/帮我|请|修正|识别错|不对|有问题/g, '').trim() 
                },
                reply: '我可以帮你修正 AI 的识别结果并重新执行刮削。',
                needsConfirmation: false
            };
        }

        if (/删除.*任务/.test(text)) {
            return {
                mode: 'action',
                action: 'delete_task',
                target: taskId ? { type: 'task_id', value: String(taskId) } : { type: 'task_name', value: text.replace(/删除.*任务/g, '').trim() },
                reply: '我可以帮你删除这个任务记录。',
                needsConfirmation: false
            };
        }

        if (/整理|重命名|移动/.test(text)) {
            return {
                mode: 'action',
                action: 'run_organizer',
                target: taskId ? { type: 'task_id', value: String(taskId) } : /最新/.test(text) ? { type: 'latest', value: '' } : { type: 'task_name', value: text.replace(/帮我|请|执行|运行|整理器|整理|重命名|移动/g, '').trim() },
                reply: '我可以帮你调用整理器执行整理、重命名和移动。',
                needsConfirmation: false
            };
        }

        if (/执行|运行/.test(text) && /任务/.test(text)) {
            return {
                mode: 'action',
                action: 'run_task',
                target: taskId ? { type: 'task_id', value: String(taskId) } : /最新/.test(text) ? { type: 'latest', value: '' } : { type: 'task_name', value: text.replace(/帮我|请|执行|运行|任务/g, '').trim() },
                reply: '我可以帮你执行这个任务。',
                needsConfirmation: false
            };
        }

        return null;
    };

    const parseChatPlanHeuristically = (message, history = []) => {
        const fullText = String(message || '').trim();
        const contextualFolder = resolveFolderTargetFromContext(fullText, history);
        if (contextualFolder && /(列出|查看|查询|统计|多少|几个|数量|帮我查)/.test(fullText) && /(刮削|整理|重命名|移动|归档)/.test(fullText)) {
            const mediaType = inferChatMediaType(fullText);
            return {
                mode: 'action',
                action: 'organize_folder_workflow',
                target: {
                    type: 'folder_name',
                    value: contextualFolder,
                    mediaType,
                    countOnly: /(多少|几个|数量|统计)/.test(fullText)
                },
                reply: `我可以帮你查询 ${contextualFolder} 目录，然后让程序按 TMDB 识别、重命名并移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        const directFolderMatch = fullText.match(/(未刮削|未整理)(?:目录)?/);
        if (directFolderMatch && /(列出|查看|查询|统计|多少|几个|数量|帮我查)/.test(fullText) && /(刮削|整理|重命名|移动|归档)/.test(fullText)) {
            const mediaType = inferChatMediaType(fullText);
            return {
                mode: 'action',
                action: 'organize_folder_workflow',
                target: {
                    type: 'folder_name',
                    value: directFolderMatch[1],
                    mediaType,
                    countOnly: /(多少|几个|数量|统计)/.test(fullText)
                },
                reply: `我可以帮你查询 ${directFolderMatch[1]} 目录，然后让程序按 TMDB 识别、重命名并移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        const segments = splitChatCommands(message);
        if (segments.length <= 1) {
            return parseChatCommandHeuristically(message, history);
        }

        const actions = [];
        const planHistory = [...history];

        for (const segment of segments) {
            const parsed = parseChatCommandHeuristically(segment, planHistory);
            if (!parsed || parsed.mode !== 'action' || !parsed.action) {
                return parseChatCommandHeuristically(message, history);
            }
            actions.push(parsed);
            planHistory.push({ role: 'user', content: segment });
        }

        if (actions.length <= 1) {
            return actions[0] || parseChatCommandHeuristically(message, history);
        }

        const hasMutatingAction = actions.some(item => item.needsConfirmation);
        const canCollapseToWorkflow = actions.some(item => item.action === 'list_unorganized_media')
            && actions.some(item => item.action === 'run_organizer_folder');
        if (canCollapseToWorkflow) {
            const folderTarget = actions.find(item => item.target?.value)?.target?.value || contextualFolder || '';
            const mediaType = actions.find(item => item.target?.mediaType)?.target?.mediaType || 'all';
            return {
                mode: 'action',
                action: 'organize_folder_workflow',
                target: {
                    type: 'folder_name',
                    value: folderTarget,
                    mediaType
                },
                reply: `我可以帮你查询 ${folderTarget} 目录，然后让程序按 TMDB 识别、重命名并移动到默认整理根目录。`,
                needsConfirmation: false
            };
        }

        const planReply = actions.map((item, index) => `${index + 1}. ${item.reply || item.action}`).join('\n');
        return {
            mode: 'plan',
            reply: `我识别到 ${actions.length} 个连续动作：\n${planReply}`,
            needsConfirmation: hasMutatingAction,
            actions
        };
    };

    const parseChatCommandWithAI = async (message, tasks = [], history = []) => {
        if (!AIService.isEnabled()) {
            return null;
        }

        const taskContext = tasks.map(task => ({
            id: task.id,
            name: formatTaskLabel(task),
            status: task.status,
            currentEpisodes: task.currentEpisodes || 0,
            totalEpisodes: task.totalEpisodes || 0,
            enableOrganizer: !!task.enableOrganizer
        }));

        const prompt = [
            {
                role: 'system',
                content: `你是一个“程序动作解释器”，不要读取目录，不要假装执行操作。你的职责只有两件事：
1. 将用户自然语言解析成程序动作
2. 返回严格 JSON

允许的 action 只有：
- list_tasks
- list_unorganized_media
- organize_folder_workflow
- run_organizer_folder
- run_task
- run_all_tasks
- run_organizer
- notify_emby
- delete_task
- restart_container
- correct_ai_recognition

target.type 只能是：
- task_id
- task_name
- latest
- all
- status
- none

返回格式固定为：
{
  "mode": "action" | "reply",
  "action": "list_tasks" | "list_unorganized_media" | "organize_folder_workflow" | "run_organizer_folder" | "run_task" | "run_all_tasks" | "run_organizer" | "notify_emby" | "delete_task" | "restart_container" | "correct_ai_recognition" | "",
  "target": { "type": "task_id" | "task_name" | "latest" | "all" | "status" | "none" | "folder_name", "value": "string", "mediaType": "movie" | "tv" | "all", "countOnly": true | false, "correction": "string", "tmdbId": "string" },
  "reply": "string",
  "needsConfirmation": true | false
}

规则：
- 查询任务列表、失败任务属于 list_tasks，needsConfirmation=false
- 查询“未刮削/未整理目录下面还有哪些没移动/没归档的电影或电视剧”属于 list_unorganized_media，needsConfirmation=false
- 查询“未刮削/未整理有多少文件/多少电影/多少电视剧”也属于 list_unorganized_media，needsConfirmation=false
- 如果用户要求“查询后整理并移动”，优先使用 organize_folder_workflow
- 如果用户说“帮我移动一下/整理一下/刮削一下”且上下文刚提到“未刮削/未整理”，则使用 run_organizer_folder
- 如果用户反馈某个任务“识别错了”、“不对”、“应该是xxx”或提供了正确的 TMDB ID，使用 correct_ai_recognition。在 correction 中放入正确的剧名，在 tmdbId 中放入数字 ID。
- 一切会改动系统状态的动作 needsConfirmation=true
- 如果用户意思不明确，mode=reply，action留空，reply里要求用户补充任务编号或任务名
- 不要输出 markdown，不要输出解释，只输出 JSON`
            },
            {
                role: 'user',
                content: `最近任务上下文: ${JSON.stringify(taskContext)}\n最近对话上下文: ${JSON.stringify(history)}\n用户输入: ${message}`
            }
        ];

        const result = await AIService.chat(prompt, {
            temperature: 0.1,
            max_tokens: 600
        });

        if (!result.success) {
            return null;
        }

        try {
            const parsed = JSON.parse(String(result.data || '').replace(/```(?:json)?|```/g, '').trim());
            return parsed;
        } catch (error) {
            return null;
        }
    };

    const resolveTaskTarget = async (target = {}) => {
        const tasks = await listRecentTasksForChat();
        const type = String(target.type || '').trim();
        const value = String(target.value || '').trim();

        if (type === 'task_id' && value) {
            const task = await taskService.getTaskById(Number(value));
            if (!task) {
                throw new Error(`未找到任务 #${value}`);
            }
            return task;
        }

        if (type === 'latest') {
            const latestTask = tasks[0];
            if (!latestTask) {
                throw new Error('当前没有可用任务');
            }
            const task = await taskService.getTaskById(latestTask.id);
            if (!task) {
                throw new Error('当前没有可用任务');
            }
            return task;
        }

        if (type === 'task_name' && value) {
            const normalized = value.toLowerCase();
            const matched = tasks.filter(task => formatTaskLabel(task).toLowerCase().includes(normalized));
            if (matched.length === 0) {
                throw new Error(`未找到匹配任务: ${value}`);
            }
            if (matched.length > 1) {
                throw new Error(`匹配到多个任务，请指定编号: ${matched.slice(0, 5).map(task => `#${task.id} ${formatTaskLabel(task)}`).join('；')}`);
            }
            const task = await taskService.getTaskById(matched[0].id);
            if (!task) {
                throw new Error(`未找到匹配任务: ${value}`);
            }
            return task;
        }

        throw new Error('缺少有效任务目标，请提供任务编号或更明确的任务名');
    };

    const executeChatAction = async (action, target) => {
        switch (action) {
            case 'list_tasks': {
                const tasks = await listRecentTasksForChat();
                const filteredTasks = String(target?.type || '') === 'status'
                    ? tasks.filter(task => task.status === String(target.value || ''))
                    : tasks;
                if (filteredTasks.length === 0) {
                    return '当前没有匹配的任务。';
                }
                return `最近任务如下：\n${filteredTasks.slice(0, 10).map(summarizeTaskForChat).join('\n')}`;
            }
            case 'list_unorganized_media': {
                const requestedFolder = resolveChatFolderAlias(target?.value || '')
                    || resolveChatFolderAlias(ConfigService.getConfigValue('task.autoCreate.targetFolder') || '');
                const requestedMediaType = ['movie', 'tv'].includes(String(target?.mediaType || ''))
                    ? String(target.mediaType)
                    : 'all';
                const countOnly = Boolean(target?.countOnly);
                if (!requestedFolder) {
                    return '当前没有配置默认中转目录，请先到系统设置里确认默认保存目录。';
                }
                const tasks = await listTasksInFolderForChat(requestedFolder, requestedMediaType);
                const cloudFiles = await listCloudMediaInFolderForChat(requestedFolder, requestedMediaType);
                const mediaTypeLabel = requestedMediaType === 'movie'
                    ? '电影'
                    : requestedMediaType === 'tv'
                        ? '电视剧'
                        : '电影和电视剧';
                if (tasks.length === 0 && cloudFiles.length === 0) {
                    return `${requestedFolder} 目录下当前没有仍停留在中转目录的${mediaTypeLabel}任务或文件。`;
                }
                if (countOnly) {
                    const taskCount = tasks.length;
                    const fileCount = cloudFiles.length;
                    return `${requestedFolder} 目录下当前共有 ${fileCount} 个未归档${mediaTypeLabel}文件，关联任务 ${taskCount} 个。`;
                }
                const sections = [];
                if (tasks.length > 0) {
                    sections.push(`任务记录：\n${tasks.slice(0, 20).map(summarizeFolderTaskForChat).join('\n')}`);
                }
                if (cloudFiles.length > 0) {
                    sections.push(`真实文件：\n${cloudFiles.slice(0, 20).map(item => `- ${item}`).join('\n')}`);
                }
                return `${requestedFolder} 目录下仍未归档的${mediaTypeLabel}如下：\n${sections.join('\n\n')}`;
            }
            case 'organize_folder_workflow': {
                const requestedFolder = resolveChatFolderAlias(target?.value || '')
                    || resolveChatFolderAlias(ConfigService.getConfigValue('task.autoCreate.targetFolder') || '');
                const requestedMediaType = ['movie', 'tv'].includes(String(target?.mediaType || ''))
                    ? String(target.mediaType)
                    : 'all';
                const countOnly = Boolean(target?.countOnly);
                if (!requestedFolder) {
                    throw new Error('缺少有效目录目标，请先说明未刮削或未整理目录');
                }

                const autoCreateConfig = ConfigService.getConfigValue('task.autoCreate', {});
                const organizerRootId = String(autoCreateConfig.organizerTargetFolderId || '').trim();
                const organizerRootPath = String(autoCreateConfig.organizerTargetFolderName || '').trim();
                const accountId = Number(autoCreateConfig.accountId || 0);
                if (!accountId) {
                    throw new Error('未配置默认账号，无法执行目录整理工作流');
                }
                const account = await accountRepo.findOneBy({ id: accountId });
                if (!account) {
                    throw new Error('默认账号不存在，无法执行目录整理工作流');
                }
                if (!organizerRootId) {
                    throw new Error('未配置默认整理根目录，无法执行目录整理工作流');
                }

                const cloudEntries = await listCloudMediaEntriesInFolderForChat(requestedFolder, requestedMediaType);
                const cloudFiles = cloudEntries.map(item => item.relativePath);
                const mediaTypeLabel = requestedMediaType === 'movie'
                    ? '电影'
                    : requestedMediaType === 'tv'
                        ? '电视剧'
                        : '电影和电视剧';
                const { groups, skipped: groupingSkipped } = groupCloudEntriesForWorkflow(requestedFolder, cloudEntries);

                const summaryLines = [
                    `${requestedFolder} 目录工作流结果：`,
                    `- 查询到 ${cloudFiles.length} 个文件`,
                    `- 按目录分组 ${groups.length} 组`
                ];

                if (countOnly) {
                    summaryLines.push(`- 可执行整理 ${groups.length} 组`);
                    summaryLines.push(`- 因无法分组跳过 ${groupingSkipped.length} 个文件`);
                    if (groupingSkipped.length > 0) {
                        summaryLines.push('跳过文件：');
                        summaryLines.push(...groupingSkipped.slice(0, 20).map(item => `  - ${item}`));
                    }
                    return summaryLines.join('\n');
                }

                if (groups.length === 0) {
                    summaryLines.push(`- 成功整理 0 组`);
                    summaryLines.push(`- 因无法分组跳过 ${groupingSkipped.length} 个文件`);
                    if (groupingSkipped.length > 0) {
                        summaryLines.push('跳过文件：');
                        summaryLines.push(...groupingSkipped.slice(0, 20).map(item => `  - ${item}`));
                    }
                    summaryLines.push(`当前没有可直接交给程序整理的${mediaTypeLabel}目录分组。`);
                    return summaryLines.join('\n');
                }

                const successResults = [];
                const failedResults = [];
                for (const group of groups.slice(0, 20)) {
                    try {
                        const result = await organizerService.organizeLooseGroup({
                            account,
                            organizerRootId,
                            organizerRootPath,
                            sourceFolderPath: group.groupPath,
                            resourceName: group.resourceName,
                            files: group.files
                        });
                        const taskIdStr = result?.taskId ? `[#${result.taskId}] ` : '';
                        successResults.push(`- ${group.groupPath}: ${taskIdStr}${result?.message || '整理完成'}`);
                    } catch (error) {
                        failedResults.push(`- ${group.groupPath}: 失败，${error.message}`);
                    }
                }

                summaryLines.push(`- 成功整理 ${successResults.length} 组`);
                summaryLines.push(`- 整理失败 ${failedResults.length} 组`);
                summaryLines.push(`- 因无法分组跳过 ${groupingSkipped.length} 个文件`);

                if (successResults.length > 0) {
                    summaryLines.push('成功整理：');
                    summaryLines.push(...successResults);
                }
                if (failedResults.length > 0) {
                    summaryLines.push('整理失败：');
                    summaryLines.push(...failedResults);
                }
                if (groupingSkipped.length > 0) {
                    summaryLines.push('跳过文件：');
                    summaryLines.push(...groupingSkipped.slice(0, 20).map(item => `  - ${item}`));
                }

                const summary = summaryLines.join('\n');
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'run_organizer_folder': {
                const requestedFolder = resolveChatFolderAlias(target?.value || '')
                    || resolveChatFolderAlias(ConfigService.getConfigValue('task.autoCreate.targetFolder') || '');
                const requestedMediaType = ['movie', 'tv'].includes(String(target?.mediaType || ''))
                    ? String(target.mediaType)
                    : 'all';
                if (!requestedFolder) {
                    throw new Error('缺少有效目录目标，请先说明未刮削或未整理目录');
                }
                const tasks = await listTasksInFolderForChat(requestedFolder, requestedMediaType);
                if (tasks.length === 0) {
                    return `${requestedFolder} 目录下没有可执行整理器的任务记录。`;
                }
                const results = [];
                for (const task of tasks.slice(0, 20)) {
                    try {
                        const result = await organizerService.organizeTaskById(task.id, { triggerStrm: true, force: true });
                        results.push(`- #${task.id} ${formatTaskLabel(task)}: ${result?.message || '整理完成'}`);
                    } catch (error) {
                        results.push(`- #${task.id} ${formatTaskLabel(task)}: 失败，${error.message}`);
                    }
                }
                const summary = `${requestedFolder} 目录批量整理结果：\n${results.join('\n')}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'run_all_tasks': {
                const result = await taskService.processAllTasks(true);
                const summary = result && result.length > 0 ? `已执行所有待处理任务：\n${result.join('\n\n')}` : '已执行所有待处理任务，没有新的转存结果。';
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'run_task': {
                const task = await resolveTaskTarget(target);
                const result = await taskService.processTask(task);
                const summary = result ? `任务已执行：${formatTaskLabel(task)}\n${result}` : `任务已执行：${formatTaskLabel(task)}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'run_organizer': {
                const task = await resolveTaskTarget(target);
                const result = await organizerService.organizeTaskById(task.id, { triggerStrm: true, force: true });
                const summary = result?.message || `整理器已执行：${formatTaskLabel(task)}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'notify_emby': {
                const task = await resolveTaskTarget(target);
                const embyService = new EmbyService(taskService);
                await embyService.notify(task);
                const summary = `已通知 Emby：${formatTaskLabel(task)}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'delete_task': {
                const task = await resolveTaskTarget(target);
                await taskService.deleteTask(task.id, false);
                const summary = `已删除任务：${formatTaskLabel(task)}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'correct_ai_recognition': {
                const task = await resolveTaskTarget(target);
                const correction = String(target?.correction || '').trim();
                const tmdbId = String(target?.tmdbId || '').trim();
                const mediaType = String(target?.mediaType || '').toLowerCase(); // movie 或 tv

                const updates = {
                    tmdbContent: '' // 清空内容以强制重新刮削
                };

                if (tmdbId) {
                    updates.tmdbId = tmdbId;
                    // 如果指定了 ID，我们可以预设一个基础的 tmdbContent，这样后续识别就能直接锁定类型
                    if (mediaType === 'movie' || mediaType === 'tv') {
                        updates.tmdbContent = JSON.stringify({ id: tmdbId, type: mediaType });
                    }
                }
                
                if (correction && correction !== String(task.id)) {
                    updates.resourceName = correction;
                }

                await taskRepo.update(task.id, updates);
                
                // 重新加载任务并执行整理器
                const updatedTask = await taskService.getTaskById(task.id);
                const result = await organizerService.organizeTaskById(updatedTask.id, { triggerStrm: true, force: true });
                
                const summary = `已修正任务 #${task.id} 的识别信息：\n${tmdbId ? `- 指定 TMDB ID: ${tmdbId} (${mediaType || '自动识别'})\n` : ''}${correction ? `- 指定剧名: ${correction}\n` : ''}\n程序已重新执行整理与刮削：\n${result?.message || '整理完成'}`;
                messageUtil.sendMessage(summary);
                return summary;
            }
            case 'search_tmdb_candidates': {
                const keyword = String(target?.keyword || '').trim();
                const taskId = target?.taskId;
                if (!keyword) throw new Error('请输入要搜索的剧名或电影名');
                
                const result = await tmdbService.search(keyword);
                const movies = (result.movies || []).slice(0, 5);
                const tvs = (result.tvShows || []).slice(0, 5);
                
                if (movies.length === 0 && tvs.length === 0) {
                    return `抱歉，在 TMDB 中未找到关于 "${keyword}" 的任何结果。请尝试缩简名称再次搜索。`;
                }

                const lines = [`为您找到关于 "${keyword}" 的候选结果：`];
                if (movies.length > 0) {
                    lines.push('\n🎬 电影：');
                    movies.forEach(m => lines.push(`- [电影] ${m.title} (${new Date(m.releaseDate).getFullYear() || '未知'}) | TMDB ID: ${m.id}`));
                }
                if (tvs.length > 0) {
                    lines.push('\n📺 电视剧：');
                    tvs.forEach(t => lines.push(`- [电视剧] ${t.title} (${new Date(t.releaseDate).getFullYear() || '未知'}) | TMDB ID: ${t.id}`));
                }
                
                const targetRef = taskId ? `#${taskId}` : '最新的';
                lines.push(`\n您可以回复：\n"绑定${targetRef}任务为电影 ID xxx" 或\n"绑定${targetRef}任务为电视剧 ID xxx"\n来完成手动指定。`);
                
                return lines.join('\n');
            }
            case 'restart_container': {
                setTimeout(() => {
                    console.log('收到 AI 重启请求，准备退出进程');
                    process.exit(0);
                }, 1500);
                return '已发送重启请求，服务将在数秒后断开并等待容器拉起。';
            }
            default:
                throw new Error('暂不支持该动作');
        }
    };

    const executeChatPlan = async (actions = []) => {
        if (!Array.isArray(actions) || actions.length === 0) {
            throw new Error('缺少可执行动作');
        }
        const results = [];
        for (const item of actions) {
            const reply = await executeChatAction(item.action, item.target || {});
            results.push(reply);
        }
        return results.join('\n\n');
    };

    app.post('/api/workflow/confirm', async (req, res) => {
        try {
            const { runId, key, approved } = req.body || {};
            if (!runId || !key) {
                throw new Error('runId 和 key 不能为空');
            }
            const run = await workflowRunner.confirm(String(runId), String(key), !!approved);
            if (!run) {
                throw new Error('工作流不存在或确认已失效');
            }
            res.json({ success: true, data: run });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    app.post('/api/chat', async (req, res) => {
        const { message, executeAction, action, history } = req.body || {};
        try {
            if (executeAction && action?.mode === 'workflow_confirm' && action?.runId && action?.key) {
                const run = await workflowRunner.confirm(String(action.runId), String(action.key), true);
                if (!run) {
                    throw new Error('工作流不存在或确认已失效');
                }
                res.json({
                    success: true,
                    data: {
                        reply: run.context?.resultSummary || run.context?.notifySummary || '工作流已执行完成。'
                    }
                });
                return;
            }

            if (executeAction && Array.isArray(action?.actions) && action.actions.length > 0) {
                const reply = await executeChatPlan(action.actions);
                res.json({ success: true, data: { reply } });
                return;
            }

            if (executeAction && action?.action) {
                const reply = await executeChatAction(action.action, action.target || {});
                res.json({ success: true, data: { reply } });
                return;
            }

            const userMessage = String(message || '').trim();
            if (!userMessage) {
                res.json({ success: true, data: { reply: '请输入指令。' } });
                return;
            }

            if (workflowRunner) {
                const pendingRun = await workflowRunner.getPendingConfirm(req.sessionID || req.ip || 'web', 'web');
                if (pendingRun) {
                    const normalizedReply = userMessage.toLowerCase();
                    if (['y', 'yes', '1', '确认', '确认执行', '执行'].includes(normalizedReply)) {
                        const run = await workflowRunner.confirm(pendingRun.id, pendingRun.confirmKey, true);
                        if (!run) {
                            throw new Error('工作流不存在或确认已失效');
                        }
                        res.json({
                            success: true,
                            data: {
                                reply: run.context?.resultSummary || run.context?.notifySummary || '工作流已执行完成。'
                            }
                        });
                        return;
                    }
                    if (['n', 'no', '2', '取消', '拒绝'].includes(normalizedReply)) {
                        const run = await workflowRunner.confirm(pendingRun.id, pendingRun.confirmKey, false);
                        if (!run) {
                            throw new Error('工作流不存在或确认已失效');
                        }
                        res.json({
                            success: true,
                            data: {
                                reply: '工作流已取消。'
                            }
                        });
                        return;
                    }
                    res.json({
                        success: true,
                        data: {
                            reply: '当前有待确认工作流，请回复 Y 确认执行，或 N 取消。'
                        }
                    });
                    return;
                }
            }

            const recentTasks = await listRecentTasksForChat();
            const normalizedHistory = Array.isArray(history)
                ? history
                    .map(item => ({
                        role: String(item?.role || ''),
                        content: String(item?.content || '').trim()
                    }))
                    .filter(item => item.role && item.content)
                    .slice(-8)
                : [];
            const heuristicAction = parseChatPlanHeuristically(userMessage, normalizedHistory);
            const parsedAction = heuristicAction || await parseChatCommandWithAI(userMessage, recentTasks, normalizedHistory);

            if (parsedAction?.mode === 'plan' && Array.isArray(parsedAction?.actions) && parsedAction.actions.length > 0) {
                const previewLines = [];
                for (const [index, item] of parsedAction.actions.entries()) {
                    if (['run_task', 'run_organizer', 'notify_emby', 'delete_task', 'correct_ai_recognition'].includes(item.action)) {
                        const task = await resolveTaskTarget(item.target || {});
                        previewLines.push(`${index + 1}. ${item.reply || item.action}\n目标任务：#${task.id} ${formatTaskLabel(task)}`);
                    } else if (item.action === 'organize_folder_workflow') {
                        const folderLabel = resolveChatFolderAlias(item.target?.value || '')
                            || resolveChatFolderAlias(ConfigService.getConfigValue('task.autoCreate.targetFolder') || '');
                        const folderEntries = await listCloudMediaEntriesInFolderForChat(folderLabel, item.target?.mediaType || 'all');
                        const grouped = groupCloudEntriesForWorkflow(folderLabel, folderEntries);
                        previewLines.push(`${index + 1}. ${item.reply || item.action}\n目标目录：${folderLabel}\n真实文件数：${folderEntries.length}\n目录分组数：${grouped.groups.length}`);
                    } else if (item.action === 'run_organizer_folder') {
                        const folderLabel = resolveChatFolderAlias(item.target?.value || '')
                            || resolveChatFolderAlias(ConfigService.getConfigValue('task.autoCreate.targetFolder') || '');
                        const folderTasks = await listTasksInFolderForChat(folderLabel, item.target?.mediaType || 'all');
                        previewLines.push(`${index + 1}. ${item.reply || item.action}\n目标目录：${folderLabel}\n匹配任务数：${folderTasks.length}`);
                    } else if (item.action === 'run_all_tasks') {
                        previewLines.push(`${index + 1}. ${item.reply || item.action}\n目标：所有待处理任务`);
                    } else if (item.action === 'restart_container') {
                        previewLines.push(`${index + 1}. ${item.reply || item.action}\n目标：当前服务进程`);
                    } else {
                        previewLines.push(`${index + 1}. ${item.reply || item.action}`);
                    }
                }

                if (!parsedAction.needsConfirmation) {
                    const reply = await executeChatPlan(parsedAction.actions);
                    res.json({ success: true, data: { reply } });
                    return;
                }

                res.json({
                    success: true,
                    data: {
                        reply: `${parsedAction.reply || '我已识别到一个多步执行计划。'}\n\n${previewLines.join('\n\n')}\n\n确认后我会按顺序执行。`,
                        action: {
                            mode: 'plan',
                            actions: parsedAction.actions
                        }
                    }
                });
                return;
            }

            if (parsedAction?.mode === 'action' && parsedAction?.action) {
                // 强制关闭任何确认逻辑，直接进入执行环节
                parsedAction.needsConfirmation = false;
                const reply = await executeChatAction(parsedAction.action, parsedAction.target || {});
                res.json({
                    success: true,
                    data: { reply }
                });
                return;
            }

            const fallback = await AIService.chat([
                {
                    role: 'system',
                    content: '你是天翼自动转存系统助手。优先简洁回答用户关于当前程序功能、任务、配置和使用方式的问题。'
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ]);

            res.json({
                success: true,
                data: {
                    reply: fallback.success ? String(fallback.data || '') : '我暂时无法理解这条指令。你可以直接说“执行任务 123”或“帮我整理任务 123”。'
                }
            });
        } catch (error) {
            console.error('处理聊天消息失败:', error);
            res.status(500).json({ success: false, error: error.message || '处理消息失败' });
        }
    })


    // STRM相关API
    app.post('/api/strm/generate-all', async (req, res) => {
        try {
            const overwrite = req.body.overwrite || false;
            const accountIds = req.body.accountIds;
            if (!accountIds || accountIds.length == 0) {
                throw new Error('账号ID不能为空');
            }
            const accounts = await accountRepo.find({
                where: {
                    localStrmPrefix: Not(IsNull()),
                    cloudStrmPrefix: Not(IsNull()),
                    id: In(accountIds)
                }
            });
            const strmService = new StrmService();
            strmService.generateAll(accounts, overwrite);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/strm/list', async (req, res) => {
        try {
            const path = req.query.path || '';
            const strmService = new StrmService();
            const files = await strmService.listStrmFiles(path);
            res.json({ success: true, data: files });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/strm/configs', async (req, res) => {
        try {
            const configs = await strmConfigService.listConfigs();
            res.json({ success: true, data: configs });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/strm/configs', async (req, res) => {
        try {
            const config = await strmConfigService.createConfig(req.body);
            await SchedulerService.refreshStrmConfigJob(config, strmConfigService);
            res.json({ success: true, data: config });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.put('/api/strm/configs/:id', async (req, res) => {
        try {
            const config = await strmConfigService.updateConfig(parseInt(req.params.id), req.body);
            await SchedulerService.refreshStrmConfigJob(config, strmConfigService);
            res.json({ success: true, data: config });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/strm/configs/:id', async (req, res) => {
        try {
            await strmConfigService.deleteConfig(parseInt(req.params.id));
            SchedulerService.removeTaskJob(`strm-config-${parseInt(req.params.id)}`);
            res.json({ success: true, data: null });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/strm/configs/:id/run', async (req, res) => {
        try {
            const result = await strmConfigService.runConfig(parseInt(req.params.id));
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/strm/configs/:id/reset', async (req, res) => {
        try {
            const config = await strmConfigService.resetSubscriptionConfig(parseInt(req.params.id));
            res.json({ success: true, data: config });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tmdb/search', async (req, res) => {
        try {
            const keyword = req.query.keyword?.trim();
            const year = req.query.year?.trim() || '';
            console.log(`[API] GET /api/tmdb/search - keyword: "${keyword}", year: "${year}"`);
            if (!keyword) {
                throw new Error('搜索关键字不能为空');
            }
            const result = await tmdbService.search(keyword, year);
            res.json({
                success: true,
                data: [
                    ...(result.movies || []),
                    ...(result.tvShows || [])
                ].slice(0, 10)
            });
        } catch (error) {
            console.error('[API] TMDB搜索失败:', error.message);
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tmdb/tv/:id/season/:seasonNumber', async (req, res) => {
        try {
            const { id, seasonNumber } = req.params;
            if (!id || !seasonNumber) {
                throw new Error('TMDB ID 和季号不能为空');
            }
            const data = await tmdbService.getTVSeasonDetails(id, seasonNumber);
            if (!data) {
                throw new Error('获取 TMDB 季详情失败');
            }
            res.json({ success: true, data });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.get('/api/tmdb/:type/:id', async (req, res) => {
        try {
            const { type, id } = req.params;
            if (!id) {
                throw new Error('TMDB ID 不能为空');
            }
            if (!['tv', 'movie'].includes(type)) {
                throw new Error('无效的 TMDB 类型');
            }
            const data = type === 'tv'
                ? await tmdbService.getTVDetails(id)
                : await tmdbService.getMovieDetails(id);
            if (!data) {
                throw new Error('获取 TMDB 详情失败');
            }
            res.json({ success: true, data });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // ai重命名
    app.post('/api/files/ai-rename', async (req, res) => {
        try {
            const { taskId, files } = req.body;
            if (files.length == 0) {
                throw new Error('未获取到需要修改的文件');
            }
            const task = await taskService.getTaskById(taskId);
            if (!task) {
                throw new Error('任务不存在');
            }
            // 开始ai分析
            const resourceInfo = await taskService._analyzeResourceInfo(
                task.resourceName,
                files,
                'file'
            )
            return res.json({ success: true, data: await taskService.handleAiRename(files, resourceInfo) });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    app.post('/api/custom-push/test', async (req, res) => {
        try{
            const configTest = req.body
            if (await new CustomPushService([]).testPush(configTest)){
                res.json({ success: true, data: null });
            }else{
                res.json({ success: false, error: '推送测试失败' });
            }

        }catch (error) {
            res.json({ success: false, error: error.message });
        }
    })
    
    // 全局错误处理中间件
    app.use((err, req, res, next) => {
        console.error('捕获到全局异常:', err.message);
        res.status(500).json({ success: false, error: err.message });
    });


    initSSE(app)

    // 初始化cloudsaver
    setupCloudSaverRoutes(app);
    // 启动服务器
    const server = app.listen(appPort, '0.0.0.0', async () => {
        console.log(`服务器运行在 http://0.0.0.0:${appPort}`);
        try {
            await syncStandaloneEmbyProxyServer(embyService);
        } catch (error) {
            console.error('启动 Emby 独立反代端口失败:', error.message);
        }
    });
    server.on('upgrade', (req, socket, head) => {
        if (!isEmbyProxyRequestPath(req.url, '/emby-proxy')) {
            socket.destroy();
            return;
        }
        embyService.handleProxyUpgrade(req, socket, head, { basePath: '/emby-proxy' }).catch((error) => {
            console.error('Emby 内置反代 WebSocket 失败:', error.message);
            socket.destroy();
        });
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});
