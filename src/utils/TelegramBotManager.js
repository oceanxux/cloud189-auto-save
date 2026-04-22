const { TelegramBotService } = require('../services/telegramBot');
const { logTaskEvent } = require('./logUtils');

class TelegramBotManager {
    static instance = null;
    static bot = null;
    static chatId = null;

    static getInstance() {
        if (!TelegramBotManager.instance) {
            TelegramBotManager.instance = new TelegramBotManager();
        }
        return TelegramBotManager.instance;
    }

    async handleBotStatus(botToken, chatId, enable, proxyDomain = '') {
        const shouldEnableBot = !!(enable && botToken && chatId);
        const botTokenChanged = TelegramBotManager.bot?.token !== botToken;
        const chatIdChanged = TelegramBotManager.bot?.chatId !== chatId;
        const proxyDomainChanged = (TelegramBotManager.bot?.proxyDomain || '') !== (proxyDomain || '');
        if (TelegramBotManager.bot && (!shouldEnableBot || botTokenChanged || chatIdChanged || proxyDomainChanged)) {
            await TelegramBotManager.bot.stop();
            TelegramBotManager.bot = null;
            logTaskEvent(`Telegram机器人已停用`);
        }

        if (shouldEnableBot && (!TelegramBotManager.bot || botTokenChanged || chatIdChanged || proxyDomainChanged)) {
            TelegramBotManager.bot = new TelegramBotService(botToken, chatId, proxyDomain);
            TelegramBotManager.bot.start()
            .then(() => {
                logTaskEvent(`Telegram机器人已启动`);
            })
            .catch(error => {
                logTaskEvent(`Telegram机器人启动失败: ${error.message}`);
            });
        }
    }

    getBot() {
        return TelegramBotManager.bot;
    }
}

module.exports = TelegramBotManager;
