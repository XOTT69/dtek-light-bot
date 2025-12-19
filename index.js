const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');

const token = '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const chatId = -1003348454247;

const bot = new TelegramBot(token, { polling: true });

let lastStatus = null;

const SVITLO_URL = 'https://svitlo.live/kiivska-oblast';

async function fetchScheduleFromSvitlo() {
  const res = await axios.get(SVITLO_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  const html = res.data;
  const $ = cheerio.load(html);

  const row = $('tr')
    .filter((i, el) => $(el).find('td').first().text().trim() === 'Черга 2.2')
    .first();

  if (!row || row.length === 0) {
    throw new Error('Не знайшов рядок "Черга 2.2" на svitlo.live');
  }

  const tds = row.find('td').toArray().slice(1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const schedule = hours.map((h, idx) => {
    const td = tds[idx];
    if (!td) return { hour: h, status: 'unknown' };

    const cls = ($(td).attr('class') || '').trim();

    let status = 'unknown';
    if (cls.includes('on')) status = 'on';
    else if (cls.includes('off')) status = 'off';
    else if (cls.includes('f4') || cls.includes('f5')) status = 'maybe';

    return { hour: h, status };
  });

  return schedule;
}

function getCurrentStatus(schedule) {
  if (!schedule || schedule.length === 0) return 'unknown';

  const now = new Date();
  const hour = now.getHours();

  const slot = schedule.find(s => s.hour === hour);
  if (!slot) return 'unknown';

  if (slot.status === 'on') return 'є світло';
  if (slot.status === 'off') return 'немає світла';
  if (slot.status === 'maybe') return 'можливе відключення';
  return 'unknown';
}

function formatSchedule(schedule) {
  if (!schedule || schedule.length === 0) return 'немає даних по графіку';

  return schedule
    .map(s => {
      const h = s.hour.toString().padStart(2, '0') + ':00';
      let label = 'невідомо';
      if (s.status === 'on') label = 'світло є';
      else if (s.status === 'off') label = 'світла немає';
      else if (s.status === 'maybe') label = 'можливе відключення';
      return `${h} — ${label}`;
    })
    .join('\n');
}

bot.onText(/\/status(@[\w_]+)?/, async msg => {
  const chat = msg.chat.id;
  try {
    await bot.sendMessage(chat, '⏳ Оновлюю графік з svitlo.live...');

    const schedule = await fetchScheduleFromSvitlo();
    const current = getCurrentStatus(schedule);

    let text =
      '🔌 Статус по Київська область, черга 2.2 (svitlo.live):\n' +
      `Зараз: *${current.toUpperCase()}*\n\n` +
      'Графік на сьогодні:\n' +
      '```text\n' +
      formatSchedule(schedule) +
      '\n```

    await bot.sendMessage(chat, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('STATUS error:', e);
    await bot.sendMessage(
      chat,
      '⚠️ Не вдалося отримати графік з svitlo.live.'
    );
  }
});

cron.schedule('*/10 * * * *', async () => {
  try {
    const schedule = await fetchScheduleFromSvitlo();
    const current = getCurrentStatus(schedule);
    if (current === 'unknown') return;

    if (current !== lastStatus) {
      lastStatus = current;

      const now = new Date().toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit'
      });

      let msg;
      if (current === 'немає світла') {
        msg = `⚫️ Світло *за графіком немає* о ${now} (черга 2.2, svitlo.live)`;
      } else if (current === 'є світло') {
        msg = `🟢 Світло *за графіком є* о ${now} (черга 2.2, svitlo.live)`;
      } else {
        msg = `🟡 *Можливе відключення* за графіком о ${now} (черга 2.2, svitlo.live)`;
      }

      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    console.error('CRON error:', e);
  }
});

console.log('Svitlo.live 2.2 bot started');
