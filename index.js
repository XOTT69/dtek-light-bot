const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const PORT = process.env.PORT || 3000;

// твоя TG-група
const GROUP_CHAT_ID = -1003348454247;

if (!BOT_TOKEN || !WEBHOOK_DOMAIN) {
  console.error('ENV BOT_TOKEN or WEBHOOK_DOMAIN is missing');
  process.exit(1);
}

// сторінка Чабанів
const ALERTS_URL =
  'https://alerts.org.ua/kyivska-oblast/chabanivska-hromada/chabani/';

const bot = new Telegraf(BOT_TOKEN);

// ===== утиліти часу =====
function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function getCurrentAndNext(periods, date = new Date()) {
  const nowMins = date.getHours() * 60 + date.getMinutes();
  let current = null;
  let next = null;

  for (const p of periods) {
    const from = toMins(p.start);
    const to = toMins(p.end === '24:00' ? '23:59' : p.end);

    if (nowMins >= from && nowMins <= to) {
      current = p;
    } else if (from > nowMins) {
      if (!next || from < toMins(next.start)) {
        next = p;
      }
    }
  }

  return { current, next };
}

// ===== парсер alerts.org.ua: тільки улюблена група =====
async function fetchAlertsSchedule() {
  const res = await axios.get(ALERTS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  const html = res.data;
  const $ = cheerio.load(html);

  const periods = [];

  // блок з сердечком (fav_.fav-hm) -> тільки його .period
  $('#shedule > div.col-6.col-md-3.js-group.fav_.fav-hm > div .period > div').each(
    (_, el) => {
      const start = $(el).attr('data-start');
      const end = $(el).attr('data-end');
      const statusText = $(el).find('b').text().trim();
      let status = 'unknown';
      if (statusText === 'ON') status = 'on';
      if (statusText === 'OFF') status = 'off';

      if (start && end) {
        periods.push({ start, end, status });
      }
    }
  );

  return periods;
}

// один день без дублів
function normalizeToday(periods) {
  const today = [];
  const seen = new Set();

  for (const p of periods) {
    const key = `${p.start}-${p.end}-${p.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    today.push(p);
    if (today.length >= 6) break;
  }

  today.sort((a, b) => toMins(a.start) - toMins(b.start));
  return today;
}

// текст повідомлення + підрахунок OFF
async function buildStatusText() {
  const periodsRaw = await fetchAlertsSchedule();
  const periods = normalizeToday(periodsRaw);
  const { current, next } = getCurrentAndNext(periods);
  const last = periods[periods.length - 1];

  // сумарний OFF за день
  let offMinutes = 0;
  for (const p of periods) {
    if (p.status !== 'off') continue;
    const from = toMins(p.start);
    const to = toMins(p.end === '24:00' ? '23:59' : p.end);
    offMinutes += to - from;
  }
  const offHours = (offMinutes / 60).toFixed(1);

  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  let msg = '';

  // поточний стан
  if (current) {
    if (current.status === 'off') {
      msg += `Зараз ${nowStr} світло відсутнє (${current.start} - ${current.end}).\n`;
    } else if (current.status === 'on') {
      msg += `Зараз ${nowStr} світло є (${current.start} - ${current.end}).\n`;
    } else {
      msg += `Зараз ${nowStr} статус світла невідомий.\n`;
    }
  } else {
    if (last && last.status === 'off') {
      msg += `Зараз ${nowStr} світло відсутнє (останній інтервал дня ${last.start} - ${last.end} без світла).\n`;
    } else {
      msg += `Зараз ${nowStr} світло є (поза запланованими інтервалами).\n`;
    }
  }

  // наступна зміна
  if (next) {
    msg += `Наступна зміна о ${next.start}: буде ${
      next.status === 'off' ? 'світло відсутнє' : 'світло є'
    }.\n\n`;
  } else {
    msg += 'Далі на сьогодні змін не заплановано.\n\n';
  }

  msg += `Сьогодні планово без світла було ${offHours} год.\n\n`;

  msg += 'Графік на сьогодні:\n';
  for (const p of periods) {
    const label = p.status === 'off' ? 'світло відсутнє' : 'світло є';
    msg += `${p.start} - ${p.end}: ${label}\n`;
  }

  return msg;
}

// ===== тільки твоя TG-група =====
function isOurGroup(ctx) {
  return (
    (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') &&
    ctx.chat.id === GROUP_CHAT_ID
  );
}

bot.start(async (ctx) => {
  if (!isOurGroup(ctx)) return;
  try {
    const msg = await buildStatusText();
    await ctx.reply(msg);
  } catch (e) {
    console.error(e);
  }
});

bot.command('status', async (ctx) => {
  if (!isOurGroup(ctx)) return;
  try {
    const msg = await buildStatusText();
    await ctx.reply(msg);
  } catch (e) {
    console.error(e);
  }
});

// ===== HTTP + webhook =====
const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Bot is running');
});

app.post('/tg-webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  const webhookUrl = `${WEBHOOK_DOMAIN}/tg-webhook`;
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook set to', webhookUrl);
  } catch (e) {
    console.error('Failed to set webhook', e);
  }
});
