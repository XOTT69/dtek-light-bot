const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { chromium } = require('playwright');

const token = process.env.TG_TOKEN;
const chatId = process.env.CHAT_ID || '-1003348454247'; // id твоєї групи

if (!token) {
  console.error('TG_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

let lastStatus = null;

const CONFIG = {
  city: 'Чабани',
  street: 'Покровська',
  house: '30-Б',
  group: '2.2'
};

// ---- скрапінг DTEK ----
async function getDtekSchedule() {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://www.dtek-krem.com.ua/ua/shutdowns', {
      waitUntil: 'networkidle'
    });

    // місто
    await page.waitForSelector('#city', { timeout: 20000 });
    await page.fill('#city', CONFIG.city);
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // вулиця
    await page.waitForSelector('#street', { timeout: 20000 });
    await page.fill('#street', CONFIG.street);
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // будинок
    await page.waitForSelector('#housenum', { timeout: 20000 });
    await page.fill('#housenum', CONFIG.house);
    await page.click('button[type="submit"]');

    // чекаємо таблицю з графіком
    await page.waitForSelector('table tbody tr', { timeout: 20000 });

    const schedule = await page.$$eval('table tbody tr', rows =>
      rows.map(row => {
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length < 2) return null;

        const timeText = (tds[0].textContent || '').trim(); // типу "18:00-19:00"
        const cls = tds[1].className || '';

        let status = 'ON';
        if (cls.includes('cell-scheduled') || cls.includes('cell-off')) {
          status = 'OFF';
        } else if (cls.includes('cell-possible')) {
          status = 'MAYBE';
        }

        return { time: timeText, status };
      }).filter(Boolean)
    );

    await browser.close();
    return schedule;
  } catch (err) {
    console.error('DTEK parse error:', err);
    return null;
  }
}

// ---- логіка статусу ----
function getCurrentStatus(schedule) {
  if (!schedule || schedule.length === 0) return 'unknown';

  const now = new Date();
  const minutes = now.getMinutes();
  const hourStr = now.getHours().toString().padStart(2, '0');
  const current = `${hourStr}:${minutes < 30 ? '00' : '30'}`; // грубо 30-хвилинні слоти

  const slot = schedule.find(s => s.time.startsWith(current));
  if (!slot) return 'unknown';

  if (slot.status === 'OFF') return 'немає світла';
  if (slot.status === 'MAYBE') return 'можливе відключення';
  return 'є світло';
}

function formatSchedule(schedule) {
  if (!schedule || schedule.length === 0) return 'немає даних по графіку';
  const lines = schedule.map(s => `${s.time} — ${s.status}`);
  return lines.join('\n');
}

// ---- команда /status ----
bot.onText(/\/status(@[\w_]+)?/, async msg => {
  const chat = msg.chat.id;
  bot.sendMessage(chat, '⏳ Оновлюю дані ДТЕК...');

  const schedule = await getDtekSchedule();
  const current = getCurrentStatus(schedule);

  let text = `🔌 Статус по Чабани, вул. ${CONFIG.street} ${CONFIG.house} (група ${CONFIG.group}):\n`;
  text += `Зараз: *${current.toUpperCase()}*\n\n`;

  if (schedule) {
    const nextOff = schedule.find(s => s.status === 'OFF');
    if (nextOff) text += `⏰ Найближче відключення: ${nextOff.time}\n\n`;
    text += 'Графік на сьогодні:\n';
    text += '``````';
  } else {
    text += 'Не вдалося отримати графік з сайту DTEK.';
  }

  bot.sendMessage(chat, text, { parse_mode: 'Markdown' });
});

// ---- авто-сповіщення кожні 10 хв ----
cron.schedule('*/10 * * * *', async () => {
  const schedule = await getDtekSchedule();
  const current = getCurrentStatus(schedule);

  if (current === 'unknown') return;

  if (current !== lastStatus) {
    lastStatus = current;
    const now = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    let msg;

    if (current === 'немає світла') {
      msg = `⚫️ Світло *зникло* о ${now}`;
    } else if (current === 'є світло') {
      msg = `🟢 Світло *зʼявилось* о ${now}`;
    } else {
      msg = `🟡 Можливе відключення світла (статус DTEK) о ${now}`;
    }

    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }
});

console.log('DTEK light bot started');
