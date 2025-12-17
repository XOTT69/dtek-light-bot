const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

// --- Налаштування бота ---
const token = '8413003519:AAHLrlYJZPRFeSyslhQalYNS5Uz5qh8jZn8';
const chatId = -1003348454247;

const LOCATION = 'смт Чабани, Покровська 30-Б, черга 2.2';
const DTEK_URL = 'https://www.dtek-krem.com.ua/ua/shutdowns';

// --- HTTP запит ---

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', (err) => reject(err));
  });
}

// --- Парсер таблиці з прикладу ---

function parseTable(html) {
  const tableStart = html.indexOf('<table>');
  if (tableStart === -1) return [];

  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableEnd === -1) return [];

  const tableHtml = html.slice(tableStart, tableEnd + '</table>'.length);

  const rowRegex =
    /<tr>\s*<td[^>]*colspan="2"[^>]*>([^<]+)<\/td>\s*<td[^>]*class="([^"]+)"[^>]*>.*?<\/td>\s*<\/tr>/g;

  const rows = [];
  let match;
  while ((match = rowRegex.exec(tableHtml)) !== null) {
    const timeRange = match[1].trim(); // "00-01"
    const cellClass = match[2].trim(); // "cell-scheduled", ...

    const [fromH, toH] = timeRange.split('-');
    const from = `${fromH.padStart(2, '0')}:00`;
    const to = `${toH.padStart(2, '0')}:00`;

    let status;
    switch (cellClass) {
      case 'cell-scheduled':
        status = 'scheduled';
        break;
      case 'cell-first-half':
        status = 'first-half';
        break;
      case 'cell-second-half':
        status = 'second-half';
        break;
      case 'cell-non-scheduled':
      default:
        status = 'non-scheduled';
    }

    rows.push({ from, to, status });
  }

  return rows;
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function describeStatus(rows) {
  if (!rows.length) {
    return {
      nowText: 'дані по графіку не знайдені',
      nextText: 'немає інформації про наступні відключення',
    };
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let current = null;
  let next = null;

  for (const r of rows) {
    const fromM = timeToMinutes(r.from);
    const toM = timeToMinutes(r.to);

    if (nowMinutes >= fromM && nowMinutes < toM) {
      current = r;
    }

    if (fromM > nowMinutes) {
      if (!next || fromM < timeToMinutes(next.from)) {
        next = r;
      }
    }
  }

  let nowText;

  if (!current || current.status === 'non-scheduled') {
    nowText = 'зараз за графіком світло МАЄ бути (поза вікнами відключень).';
  } else if (current.status === 'scheduled') {
    nowText = `зараз повна година під можливим/плановим відключенням: ${current.from}–${current.to}.`;
  } else if (current.status === 'first-half') {
    nowText = `зараз перші 30 хв без світла за графіком: ${current.from}–${current.to}.`;
  } else if (current.status === 'second-half') {
    nowText = `зараз другі 30 хв без світла за графіком: ${current.from}–${current.to}.`;
  }

  let nextText;
  if (!next) {
    nextText = 'подальших вікон відключень сьогодні в таблиці немає.';
  } else {
    let type;
    if (next.status === 'non-scheduled') {
      type = 'година без відключень';
    } else if (next.status === 'scheduled') {
      type = 'повна година можливого/планового відключення';
    } else if (next.status === 'first-half') {
      type = 'перші 30 хв без світла';
    } else if (next.status === 'second-half') {
      type = 'другі 30 хв без світла';
    }
    nextText = `найближче вікно за графіком: ${next.from}–${next.to} (${type}).`;
  }

  return { nowText, nextText };
}

async function getStatusText() {
  try {
    const html = await httpGet(DTEK_URL);
    const rows = parseTable(html);
    const { nowText, nextText } = describeStatus(rows);

    const rangesText =
      rows.length > 0
        ? rows.map((r) => `${r.from}–${r.to} (${r.status})`).join(', ')
        : 'немає';

    return (
      `Статус світла для ${LOCATION}:\n` +
      `💡 ${nowText}\n` +
      `📅 ${nextText}\n\n` +
      `🔢 Вікна з таблиці: ${rangesText}\n\n` +
      `Джерело: ${DTEK_URL}`
    );
  } catch (e) {
    return (
      'Статус світла:\n' +
      '⚠️ Помилка при отриманні/розборі сторінки DTEK.\n' +
      `Деталі: ${e.message}`
    );
  }
}

// --- Бот ---

const bot = new TelegramBot(token, { polling: true });

bot.sendMessage(
  chatId,
  '⚡️ Світло Плаза Квартал: бот запущений, читаємо графік з DTEK.'
);

function normalizeCommand(text) {
  if (!text) return '';
  return text.trim().split('@')[0];
}

bot.on('message', async (msg) => {
  if (!msg.text) return;
  const cmd = normalizeCommand(msg.text);

  if (cmd === '/ping') {
    bot.sendMessage(chatId, 'pong');
    return;
  }

  if (cmd === '/start') {
    bot.sendMessage(
      chatId,
      'Бот Світло Плаза Квартал працює. Використай /status для поточного статусу світла.'
    );
    return;
  }

  if (cmd === '/status') {
    const text = await getStatusText();
    bot.sendMessage(chatId, text);
    return;
  }
});
