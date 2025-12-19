const axios = require('axios');
const cheerio = require('cheerio');

const ALERTS_URL = 'https://alerts.org.ua/kyivska-oblast/chabanivska-hromada/chabani/';

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
