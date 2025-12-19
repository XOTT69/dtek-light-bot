const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const PORT = process.env.PORT || 3000;
const GROUP_CHAT_ID = -1003348454247;

if (!BOT_TOKEN || !WEBHOOK_DOMAIN) {
  console.error('ENV BOT_TOKEN or WEBHOOK_DOMAIN is missing');
  process.exit(1;
}

const ALERTS_URL = 'https://alerts.org.ua/kyivska-oblast/chabanivska-hromada/chabani/';
const bot = new Telegraf(BOT_TOKEN);

// ===== утиліти часу =====
function toMins(hhmm) {
  if (hhmm === '24:00') return 1440; // фикс для конца суток
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function getDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isTomorrow(dateKey) {
  const today = getDateKey();
  const tomorrow = getDateKey(new Date(Date.now() + 86400000));
  return dateKey === tomorrow;
}

// ===== улучшенный парсер: сегодня + завтра =====
async function fetchAlertsSchedule() {
  const res = await axios.get(ALERTS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  const $ = cheerio.load(res.data);
  const schedules = { today: [], tomorrow: [] };

  // все .period > div с data-start/data-end (любые группы)
  $('.period > div[data-start][data-end]').each((_, el) => {
    const $el = $(el);
    const start = $el.attr('data-start');
    const end = $el.attr('data-end');
    const dateKey = $el.closest('[data-date]').attr('data-date') || getDateKey();
    const statusText = $el.find('b').text().trim().toUpperCase();
    const status = statusText === 'ON' ? 'on' : statusText === 'OFF' ? 'off' : 'unknown';

    if (start && end) {
      const period = { start, end, status, dateKey };
      if (isTomorrow(dateKey)) {
        schedules.tomorrow.push(period);
      } else {
        schedules.today.push(period);
      }
    }
  });

  // дедупликация
  const dedupe = (periods) => {
    const seen = new Set();
    return periods.filter(p => {
      const key = `${p.start}-${p.end}-${p.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => toMins(a.start) - toMins(b.start));
  };

  schedules.today = dedupe(schedules.today);
  schedules.tomorrow = dedupe(schedules.tomorrow);
  return schedules;
}

// current/next с учетом времени
function getCurrentAndNext(periods, date = new Date()) {
  const nowMins = date.getHours() * 60 + date.getMinutes();
  let current = null, next = null;

  for (const p of periods) {
    const from = toMins(p.start);
    const to = toMins(p.end);
    if (nowMins >= from && nowMins < to) {
      current = p;
    } else if (from > nowMins) {
      if (!next || from < toMins(next.start)) next = p;
    }
  }
  return { current, next };
}

// ===== текст статусу =====
async function buildStatusText() {
  const schedules = await fetchAlertsSchedule();
  const today = schedules.today;
  const tomorrow = schedules.tomorrow;
  
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { current, next } = getCurrentAndNext(today, now);

  let msg = `🕐 ${nowStr} | Чабани\n\n`;

  // текущий статус
  if (today.length === 0) {
    msg += '📊 Графік на сьогодні відсутній\n\n';
  } else if (current) {
    const statusEmoji = current.status === 'off' ? '🔴' : '🟢';
    msg += `${statusEmoji} Зараз: ${current.start}-${current.end} (${current.status.toUpperCase()})\n`;
  } else if (next) {
    msg += `⏳ Очікуємо ${next.start}: ${next.status === 'off' ? '🔴 ВІДКЛ' : '🟢 СВІТЛО'}\n`;
  } else {
    msg += '📊 Графік закінчився\n';
  }

  // завтра
  if (tomorrow.length > 0) {
    msg += `\n📅 Завтрашній графік доступний (${tomorrow.length} інтервалів)\n`;
  }

  // полный список сегодня
  msg += '\n📋 Сьогодні:\n';
  if (today.length === 0) {
    msg += 'немає даних\n';
  } else {
    const offMins = today.reduce((sum, p) => p.status === 'off' ? sum + (toMins(p.end) - toMins(p.start)) : sum, 0);
    msg += `⏱️ Всього OFF: ${(offMins/60).toFixed(1)}г\n`;
    today.forEach(p => {
      const emoji = p.status === 'off' ? '🔴' : '🟢';
      msg += `${emoji} ${p.start}-${p.end}\n`;
    });
  }

  return msg;
}

// ===== handlers =====
function isOurGroup(ctx) {
  return (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') && ctx.chat.id === GROUP_CHAT_ID;
}

bot.start(async (ctx) => { if (!isOurGroup(ctx)) return; ctx.reply(await buildStatusText()); });
bot.command('status', async (ctx) => { if (!isOurGroup(ctx)) return; ctx.reply(await buildStatusText()); });

// ===== мониторинг =====
let lastTodayJson = null;
let lastTomorrowJson = null;
let lastIntervalKey = null;

setInterval(async () => {
  // смена интервала (каждую минуту)
  const schedules = await fetchAlertsSchedule();
  const today = schedules.today;
  if (today.length === 0) return;
  
  const { current } = getCurrentAndNext(today);
  if (!current) return;
  
  const key = `${getDateKey()}_${current.start}-${current.end}-${current.status}`;
  if (key === lastIntervalKey) return;
  lastIntervalKey = key;
  
  const emoji = current.status === 'off' ? '🔴' : '🟢';
  await bot.telegram.sendMessage(GROUP_CHAT_ID, `${emoji} З ${current.start} до ${current.end} ${current.status.toUpperCase()}`);
}, 60 * 1000);

setInterval(async () => {
  // изменения графика (каждые 5 мин)
  const schedules = await fetchAlertsSchedule();
  const todayJson = JSON.stringify(schedules.today);
  const tomorrowJson = JSON.stringify(schedules.tomorrow);
  const todayKey = getDateKey();

  // новый день
  if (lastTodayJson === null && schedules.today.length > 0) {
    lastTodayJson = todayJson;
    lastTomorrowJson = tomorrowJson;
    return;
  }

  // добавлен завтрашний график
  if (lastTomorrowJson === '[]' && schedules.tomorrow.length > 0) {
    await bot.telegram.sendMessage(GROUP_CHAT_ID, '📅 Опубліковано графік на завтра!');
    lastTomorrowJson = tomorrowJson;
    return;
  }

  // смена сегодняшнего
  if (todayJson !== lastTodayJson) {
    await bot.telegram.sendMessage(GROUP_CHAT_ID, '🔄 Графік на сьогодні оновлено');
    lastTodayJson = todayJson;
  }

  // смена завтрашнего
  if (tomorrowJson !== lastTomorrowJson && schedules.tomorrow.length > 0) {
    await bot.telegram.sendMessage(GROUP_CHAT_ID, '📅 Завтрашній графік змінено');
    lastTomorrowJson = tomorrowJson;
  }
}, 5 * 60 * 1000);

// ===== сервер =====
const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.send('Bot OK'));
app.post('/tg-webhook', (req, res) => bot.handleUpdate(req.body, res));

app.listen(PORT, async () => {
  console.log(`Server on ${PORT}`);
  await bot.telegram.setWebhook(`${WEBHOOK_DOMAIN}/tg-webhook`);
  console.log('Webhook set');
});

