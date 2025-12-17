const TelegramBot = require('node-telegram-bot-api');

// Поки тримаємо токен у коді
const token = '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const chatId = -1003348454247; // твій chat_id групи

const bot = new TelegramBot(token, { polling: true });

// Повідомлення при запуску
bot.sendMessage(chatId, '⚡️ Світло Плаза Квартал: бот запущений');

// Обробка команд
bot.on('message', (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim();

  if (text === '/ping') {
    bot.sendMessage(chatId, 'pong');
    return;
  }

  if (text === '/start') {
    bot.sendMessage(
      chatId,
      'Бот Світло Плаза Квартал працює. Використай /status, щоб подивитися статус світла (поки що тестовий).'
    );
    return;
  }

  if (text === '/status') {
    // Поки що фейковий статус, потім підставимо реальні дані від DTEK/YASNO
    const reply =
      'Статус світла (тестовий):\n' +
      '💡 Зараз: світло Є\n' +
      '📅 Наступне можливе відключення: дані ще не підключені';
    bot.sendMessage(chatId, reply);
    return;
  }
});
