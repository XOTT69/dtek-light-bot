const TelegramBot = require('node-telegram-bot-api');

// Токен беремо з env TG_TOKEN (Railway → Variables)
const token = process.env.TG_TOKEN;
const chatId = -1003348454247; // твій chat_id групи

if (!token) {
  console.error('TG_TOKEN is not set');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Повідомлення при запуску
bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений (через TG_TOKEN)');

// Проста команда для перевірки
bot.on('message', (msg) => {
  if (!msg.text) return;

  if (msg.text === '/ping') {
    bot.sendMessage(chatId, 'pong');
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      'Бот Світло Плаза Квартал працює. Використай /ping для тесту.'
    );
  }
});
