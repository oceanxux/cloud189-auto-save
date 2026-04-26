const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// 存储所有的 SSE 客户端
const clients = new Set();
const dataDir = path.join(__dirname, '../../data');
const logFilePath = path.join(dataDir, 'system.log');

const ensureLogFile = async () => {
    await fsPromises.mkdir(dataDir, { recursive: true });
    try {
        await fsPromises.access(logFilePath);
    } catch {
        await fsPromises.writeFile(logFilePath, '', 'utf8');
    }
};

const parseLogLine = (line) => {
    if (!line) return null;
    try {
        const payload = JSON.parse(line);
        if (!payload || !payload.ts || !payload.level || !payload.module) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
};

const formatLogMessage = (payload) => {
    const date = new Date(payload.ts);
    return `[${date.toLocaleString()}] [${String(payload.level || 'info').toUpperCase()}] [${payload.module || 'system'}] ${payload.message || ''}`;
};

const readRecentLogs = async (limit = 100) => {
    await ensureLogFile();
    const content = await fsPromises.readFile(logFilePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const logs = lines
        .slice(-Math.max(1, limit))
        .map(parseLogLine)
        .filter(Boolean)
        .map(formatLogMessage);
    return logs;
};

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
            const formattedHistory = await readRecentLogs(100);
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
    const payload = {
        ts: currentTime.toISOString(),
        level,
        module,
        message: String(message)
    };
    const fullMessage = formatLogMessage(payload);
    
    // 1. 终端打印
    if (level === 'error') console.error(fullMessage);
    else if (level === 'warn') console.warn(fullMessage);
    else console.log(fullMessage);

    try {
        // 2. 文件持久化
        await ensureLogFile();
        await fsPromises.appendFile(logFilePath, `${JSON.stringify(payload)}\n`, 'utf8');

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
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() - days);

        await ensureLogFile();
        const content = await fsPromises.readFile(logFilePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const remainLines = [];
        let cleaned = 0;

        for (const line of lines) {
            const parsed = parseLogLine(line);
            if (!parsed) {
                cleaned += 1;
                continue;
            }
            const ts = new Date(parsed.ts);
            if (Number.isNaN(ts.getTime()) || ts < expireDate) {
                cleaned += 1;
                continue;
            }
            remainLines.push(JSON.stringify(parsed));
        }

        await fsPromises.writeFile(logFilePath, remainLines.length ? `${remainLines.join('\n')}\n` : '', 'utf8');

        if (cleaned > 0) {
            logTaskEvent(`系统自动清理了 ${cleaned} 条过期日志 (${days}天前)`, 'info', 'system');
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
