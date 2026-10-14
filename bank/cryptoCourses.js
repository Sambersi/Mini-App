// bank/cryptoCourses.js
const axios = require('axios');

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';

// ID монет в CoinGecko.
// Для TON/Gram обычно используется the-open-network,
// но перед релизом лучше проверить актуальный ID через /coins/list.
const CRYPTO_IDS = 'bitcoin,ethereum,the-open-network';

async function getCryptoCourses() {
  const response = await axios.get(COINGECKO_URL, {
    params: {
      ids: CRYPTO_IDS,
      vs_currencies: 'usd,rub',
    },
    timeout: 10000,
  });

  return response.data;
}

function formatPrice(value, locale) {
  return Number(value || 0).toLocaleString(locale, {
    maximumFractionDigits: 8,
  });
}

async function handleCryptoCourses(ctx) {
  try {
    const data = await getCryptoCourses();

    const btc = data.bitcoin;
    const eth = data.ethereum;
    const ton = data['the-open-network'];

    if (!btc || !eth || !ton) {
      return ctx.reply('❌ Не удалось получить данные по одной или нескольким монетам.');
    }

    const message = `
🪙 Курсы криптовалют

₿ Биткоин:
• $${formatPrice(btc.usd, 'en-US')}
• ${formatPrice(btc.rub, 'ru-RU')} ₽

Ξ Эфириум:
• $${formatPrice(eth.usd, 'en-US')}
• ${formatPrice(eth.rub, 'ru-RU')} ₽

💎 Gram:
• $${formatPrice(ton.usd, 'en-US')}
• ${formatPrice(ton.rub, 'ru-RU')} ₽
    `.trim();

    await ctx.reply(message);
  } catch (error) {
    console.error('Ошибка получения курсов криптовалют:', error);
    await ctx.reply('❌ Не удалось загрузить курсы криптовалют. Попробуйте позже.');
  }
}

module.exports = {
  getCryptoCourses,
  handleCryptoCourses,
};