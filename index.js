const TelegramBot = require('node-telegram-bot-api');

// Тимчасово: токен прямо в коді
const token = '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const chatId = -1003348454247;

const bot = new TelegramBot(token, { polling: true });

// Повідомлення при запуску
bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений (без env TG_TOKEN)');

// Проста команда для перевірки
bot.on('message', (msg) => {
  if (!msg.text) return;

  if (msg.text === '/ping') {
    bot.sendMessage(chatId, 'pong');
  }
});
