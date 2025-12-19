const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');

// ✅ твій токен і група
const token = '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const chatId = -1003348454247; // ID групи

const bot = new TelegramBot(token, { polling: true });

let lastStatus = null;

const SVITLO_URL = 'https://svitlo.live/kiivska-oblast';

// ---------------- svitlo.live парсер ----------------

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

  // шукаємо <tr><td>Черга 2.2</td>...
  const row = $('tr')
    .filter((i, el) => $(el).find('td').first().text().trim() === 'Черга 2.2')
    .first();

  if (!row || row.length === 0) {
    throw new Error('Не знайшов рядок "Черга 2.2" на svitlo.live');
  }

  const tds = row.find('td').toArray().slice(1); // після "Черга 2.2"
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const schedule = hours.map((h, idx) => {
    const td = tds[idx];
    if (!td) return { hour: h, status: 'unknown' };

    const cls = ($(td).attr('class') || '').trim();

    let status = 'unknown';
    if (cls.includes('on')) status = 'on';
    else if (cls.includes
