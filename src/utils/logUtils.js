const { SystemLog } = require('../entities');
const { AppDataSource: dataSource } = require('../database');

// 存储所有的 SSE 客户端
const clients = new Set();

// 初始化 SSE
const initSSE = (app) => {
    app.get('/api/logs/events', async (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // 发送最近的数据库日志作为历史记录
        try {
            const logRepo = dataSource.getRepository(SystemLog);
            const history = await logRepo.find({
                order: { createdAt: 'DESC' },
                take: 100
            });
            const formattedHistory = history.reverse().map(l => `[${new Date(l.createdAt).toLocaleString()}] [${l.level.toUpperCase()}] [${l.module}] ${l.message}`);
            res.write(`data: ${JSON.stringify({type: 'history', logs: formattedHistory})}\n\n`);
        } catch (e) {
            console.error('[Logs] 获取历史日志失败:', e.message);
        }

        clients.add(res);
        req.on('close', () => clients.delete(res));
    });
};

/**
 * 记录全局任务日志
 * @param {string} message 消息内容
 * @param {string} level 级别: info, warn, error
 * @param {string} module 模块: transfer, organizer, ai, tmdb, system
 */
const logTaskEvent = async (message, level = 'info', module = 'system') => {
    if (!message) return;

    const currentTime = new Date();
    const logPrefix = `[${currentTime.toLocaleString()}] [${level.toUpperCase()}] [${module}]`;
    const fullMessage = `${logPrefix} ${message}`;
    
    // 1. 终端打印
    if (level === 'error') console.error(fullMessage);
    else if (level === 'warn') console.warn(fullMessage);
    else console.log(fullMessage);

    try {
        // 2. 数据库持久化
        const logRepo = dataSource.getRepository(SystemLog);
        await logRepo.save({
            level,
            module,
            message,
            createdAt: currentTime
        });

        // 3. SSE 实时推送
        const sseData = JSON.stringify({ type: 'log', message: fullMessage });
        clients.forEach(client => {
            client.write(`data: ${sseData}\n\n`);
        });
    } catch (error) {
        console.error('[Logs] 数据库写入日志失败:', error.message);
    }
};

/**
 * 自动清理旧日志
 * @param {number} days 保留天数
 */
const cleanOldLogs = async (days = 7) => {
    try {
        const logRepo = dataSource.getRepository(SystemLog);
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() - days);

        const result = await logRepo.createQueryBuilder()
            .delete()
            .where("createdAt < :expireDate", { expireDate })
            .execute();
        
        if (result.affected > 0) {
            logTaskEvent(`系统自动清理了 ${result.affected} 条过期日志 (${days}天前)`, 'info', 'system');
        }
    } catch (error) {
        console.error('[Logs] 清理日志失败:', error.message);
    }
};

const sendAIMessage = (message) => {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({type: 'aimessage', message})}\n\n`);
    });
};

module.exports = {
    logTaskEvent,
    initSSE,
    sendAIMessage,
    cleanOldLogs
}
