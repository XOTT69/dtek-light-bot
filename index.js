const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TG_TOKEN;          // токен з Railway
const chatId = -1003348454247;              // твій chat_id групи

if (!token) {
  console.error('TG_TOKEN is not set');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Повідомлення при запуску
bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений');

// Проста команда для перевірки
bot.on('message', (msg) => {
  if (msg.text === '/ping') {
    bot.sendMessage(chatId, 'pong');
  }
});
