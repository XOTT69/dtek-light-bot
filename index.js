const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TG_TOKEN || '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const GROUP_ID = -1003348454247; // chat_id твоєї групи

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/status/, (msg) => {
  if (msg.chat.id !== GROUP_ID) return;

  bot.sendMessage(
    GROUP_ID,
    '✅ Бот живий.\n' +
    '👀 Чекаю подій від єСвітло (підгрупа 2.2).'
  );
});

bot.on('message', (msg) => {
  console.log('MESSAGE:', msg.chat.id, msg.text);
});

console.log('Bot started');

