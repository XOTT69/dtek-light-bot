const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !WEBHOOK_DOMAIN) {
  console.error('ENV BOT_TOKEN or WEBHOOK_DOMAIN is missing');
  process.exit(1);
}

const ALERTS_URL = 'https://alerts.org.ua/kyivska-oblast/chabanivska-hromada/chabani/';

// ------------- парсер alerts.org.ua -------------
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
  $('.period > div').each((_, el) => {
    const start = $(el).attr('data-start');
    const end = $(el).attr('data-end');
    const statusText = $(el).find('b').text().trim();
    let status = 'unknown';
    if (statusText === 'ON') status = 'on';
    if (statusText === 'OFF') status = 'off';

    if (start && end) {
      periods.push({ start, end, status });
    }
  });

  return periods;
}

function getCurrentStatus(periods, date = new Date()) {
  const mins = date.getHours() * 60 + date.getMinutes();

  const toMins = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  let current = { status: 'unknown', until: null };
  for (const p of periods) {
    const from = toMins(p.start);
    const to = toMins(p.end === '24:00' ? '23:59' : p.end);

    if (mins >= from && mins <= to) {
      current.status = p.status;
      current.until = p.end;
      break;
    }
  }

  return current;
}

// ------------- бот -------------
const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  try {
    const periods = await fetchAlertsSchedule();
    const current = getCurrentStatus(periods);

    const text =
      current.status === 'off'
        ? `Зараз світла НЕМає. Наступна зміна о ${current.until}.`
        : current.status === 'on'
        ? `Зараз світло Є. Наступна зміна о ${current.until}.`
        : 'Не вдалося визначити статус світла.';

    await ctx.reply(text);
  } catch (e) {
    console.error(e);
    await ctx.reply('Сталася помилка при отриманні графіка.');
  }
});

bot.command('status', async (ctx) => {
  try {
    const periods = await fetchAlertsSchedule();
    const current = getCurrentStatus(periods);

    let msg = 'Графік на сьогодні:\n';
    for (const p of periods) {
      msg += `${p.start} - ${p.end}: ${p.status === 'off' ? 'OFF' : 'ON'}\n`;
    }

    msg += '\n';
    msg +=
      current.status === 'off'
        ? `Зараз світла НЕМає. Наступна зміна о ${current.until}.`
        : current.status === 'on'
        ? `Зараз світло Є. Наступна зміна о ${current.until}.`
        : 'Не вдалося визначити поточний статус.';

    await ctx.reply(msg);
  } catch (e) {
    console.error(e);
    await ctx.reply('Сталася помилка при отриманні графіка.');
  }
});

// ------------- Express + webhook -------------
const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Bot is running');
});

app.get('/status', async (_req, res) => {
  try {
    const periods = await fetchAlertsSchedule();
    res.json({ periods });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to fetch schedule' });
  }
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

