const TelegramBot = require('node-telegram-bot-api');

// Токен беремо з змінної середовища TG_TOKEN (заданої в Railway → Variables)
const token = process.env.TG_TOKEN;
const chatId = -1003348454247; // твій chat_id групи

if (!token) {
  console.error('TG_TOKEN is not set');
  process.exit(1);
}

// Запускаємо бота в режимі polling
const bot = new TelegramBot(token, { polling: true });

// Повідомлення при запуску сервісу
bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений');

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
