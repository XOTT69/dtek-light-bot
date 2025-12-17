const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TG_TOKEN;
const chatId = -1003348454247;

const bot = new TelegramBot(token, { polling: true });

bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений');

bot.on('message', (msg) => {
  if (msg.text === '/ping') {
    bot.sendMessage(chatId, 'pong');
  }
});
