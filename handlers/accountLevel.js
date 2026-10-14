// handlers/accountLevel.js

const { Markup } = require('telegraf');

const {
  getUserById,
  getAccountLevel,
  updateAccountLevel,
  getUserBalance,
  updateUserBalance,
  transaction,
  updateContainerCount,
} = require('../db');

const MAX_LEVEL = 20;
const LEVEL_COOLDOWN_MS = 60 * 1000; // 1 минута

// Кулдаун на повышение уровня
const levelCooldowns = new Map();

function formatNumber(value) {
  return Number(value || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getAccountLevelRewards() {
  return {
    1: { limit: 10000000, reward: 'Лимит карты до 10,000,000 PF' },
    2: { limit: 12000000, reward: 'Лимит карты до 12,000,000 PF' },
    3: { limit: 14000000, reward: 'Лимит карты до 14,000,000 PF' },
    4: { limit: 16000000, reward: 'Лимит карты до 16,000,000 PF' },
    5: {
      limit: 18000000,
      reward: 'Лимит карты до 18,000,000 PF + 10 GOLD контейнеров + доступ к Банку',
    },
    6: { limit: 20000000, reward: 'Лимит карты до 20,000,000 PF' },
    7: { limit: 22000000, reward: 'Лимит карты до 22,000,000 PF' },
    8: { limit: 24000000, reward: 'Лимит карты до 24,000,000 PF' },
    9: { limit: 26000000, reward: 'Лимит карты до 26,000,000 PF' },
    10: {
      limit: 28000000,
      reward:
        'Лимит карты до 28,000,000 PF + Уникальный скин + Лимит баланса до 175,000,000 PF + доступ к Крипте',
    },
    11: { limit: 30000000, reward: 'Лимит карты до 30,000,000 PF' },
    12: { limit: 32000000, reward: 'Лимит карты до 32,000,000 PF' },
    13: { limit: 34000000, reward: 'Лимит карты до 34,000,000 PF' },
    14: { limit: 36000000, reward: 'Лимит карты до 36,000,000 PF' },
    15: {
      limit: 38000000,
      reward:
        'Лимит карты до 38,000,000 PF + Повышение основного баланса до 185,000,000 PF + доступ к Рынку скинов',
    },
    16: { limit: 40000000, reward: 'Лимит карты до 40,000,000 PF' },
    17: { limit: 42000000, reward: 'Лимит карты до 42,000,000 PF' },
    18: { limit: 44000000, reward: 'Лимит карты до 44,000,000 PF' },
    19: {
      limit: 44000000,
      reward: 'Уникальный скин + 25 GOLD контейнеров + Префикс (реализация позже)',
    },
    20: {
      limit: 45000000,
      reward: 'Лимит карты до 45,000,000 PF + Основной баланс до 200,000,000 PF',
    },
  };
}

function getAccountLevelUpgradeCosts() {
  return {
    1: 0,
    2: 2000000,
    3: 4000000,
    4: 6000000,
    5: 7500000,
    6: 9500000,
    7: 11500000,
    8: 13500000,
    9: 15500000,
    10: 20000000,
    11: 22000000,
    12: 24000000,
    13: 26000000,
    14: 28000000,
    15: 35000000,
    16: 37000000,
    17: 39000000,
    18: 41000000,
    19: 47500000,
    20: 55000000,
  };
}

async function safeAnswerCbQuery(ctx, text) {
  if (!ctx.callbackQuery) return;

  try {
    await ctx.answerCbQuery(text);
  } catch (error) {
    console.warn('[LEVEL] Не удалось подтвердить callback:', error.message);
  }
}

function buildAccountLevelMessage(level, balance, extraText = '') {
  const rewards = getAccountLevelRewards();
  const costs = getAccountLevelUpgradeCosts();

  let text = `
📈 <b>Уровень аккаунта</b>

Текущий уровень: <b>${level}</b>
Баланс: <b>${formatNumber(balance)} PF</b>
`.trim();

  if (level >= MAX_LEVEL) {
    text += `\n\n✅ Максимальный уровень достигнут.`;
  } else {
    const nextLevel = level + 1;
    const cost = costs[nextLevel] ?? 0;
    const reward = rewards[nextLevel]?.reward || '—';

    text += `

Следующий уровень: <b>${nextLevel}</b>
Стоимость: <b>${formatNumber(cost)} PF</b>
Награда: ${reward}`;
  }

  if (extraText) {
    text += `\n\n${extraText}`;
  }

  return text;
}

function buildAccountLevelKeyboard(level, balance) {
  const costs = getAccountLevelUpgradeCosts();
  const rows = [];

  if (level < MAX_LEVEL) {
    const nextLevel = level + 1;
    const cost = costs[nextLevel] ?? 0;
    const canUpgrade = balance >= cost;

    const buttonText = canUpgrade
      ? `⬆️ Повысить до ${nextLevel} (${formatNumber(cost)} PF)`
      : `❌ Мало средств (${formatNumber(cost)} PF)`;

    const callbackData = canUpgrade
      ? `account_level_confirm_${nextLevel}`
      : 'account_level_noop';

    rows.push([Markup.button.callback(buttonText, callbackData)]);
  }

  rows.push([Markup.button.callback('📊 Сетка прокачки', 'account_level_grid')]);
  rows.push([Markup.button.callback('🔙 Меню финансов', 'finance_menu')]);

  return Markup.inlineKeyboard(rows);
}

function buildAccountLevelGridMessage() {
  const rewards = getAccountLevelRewards();
  const costs = getAccountLevelUpgradeCosts();

  let text = `📊 <b>Сетка прокачки аккаунта:</b>\n`;

  for (let level = 1; level <= MAX_LEVEL; level++) {
    const reward = rewards[level]?.reward || '—';
    const cost = costs[level] ?? 0;
    const costText = cost > 0 ? `${formatNumber(cost)} PF` : 'Бесплатно';

    text += `
<b>Уровень ${level}:</b>
💰 Стоимость: ${costText}
🎁 Награда: ${reward}
`;
  }

  return text.trim();
}

function buildAccountLevelGridKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Назад к уровню', 'account_level_menu')],
  ]);
}

async function renderLevelMessage(ctx, html, keyboard) {
  const replyMarkup = keyboard?.reply_markup ?? keyboard;
  const message = ctx.callbackQuery?.message;

  // Если это callback с существующим текстовым сообщением — редактируем его.
  if (message?.message_id && message?.chat?.id) {
    try {
      await ctx.telegram.editMessageText(
        message.chat.id,
        message.message_id,
        undefined,
        html,
        {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }
      );

      return;
    } catch (error) {
      console.warn('[LEVEL] Не удалось отредактировать сообщение, отправляю новое:', error.message);
    }
  }

  // Fallback: отправляем новое сообщение.
  await ctx.replyWithHTML(html, {
    reply_markup: replyMarkup,
  });
}

async function showAccountLevelMenu(ctx, extraText = '') {
  const userId = ctx.from.id.toString();

  let level = 1;
  let balance = 0;

  try {
    level = Number(await getAccountLevel(userId) ?? 1);
  } catch (error) {
    console.error('[LEVEL] Ошибка получения уровня аккаунта:', error);
  }

  try {
    balance = Number(await getUserBalance(userId, 'PF') ?? 0);
  } catch (error) {
    console.error('[LEVEL] Ошибка получения баланса:', error);
  }

  const html = buildAccountLevelMessage(level, balance, extraText);
  const keyboard = buildAccountLevelKeyboard(level, balance);

  await renderLevelMessage(ctx, html, keyboard);
}

async function handleUpgradeAccountLevel(ctx) {
  // Сначала всегда отвечаем на callback.
  await safeAnswerCbQuery(ctx);

  await showAccountLevelMenu(ctx);
}

async function handleShowAccountLevelGrid(ctx) {
  // Сначала всегда отвечаем на callback.
  await safeAnswerCbQuery(ctx);

  const html = buildAccountLevelGridMessage();
  const keyboard = buildAccountLevelGridKeyboard();

  await renderLevelMessage(ctx, html, keyboard);
}

function getFriendlyLevelError(message = '') {
  if (message.includes('Недостаточно средств')) {
    return 'Недостаточно средств на основном балансе.';
  }

  if (message.includes('уже имеет этот или более высокий уровень')) {
    return 'Аккаунт уже имеет этот или более высокий уровень.';
  }

  if (message.includes('Пользователь не найден')) {
    return 'Пользователь не найден.';
  }

  if (message.includes('Ошибка при обновлении уровня аккаунта')) {
    return 'Не удалось обновить уровень аккаунта. Попробуйте позже.';
  }

  if (message.includes('Ошибка при списании средств')) {
    return 'Не удалось списать средства. Попробуйте позже.';
  }

  return 'Произошла ошибка при повышении уровня. Попробуйте позже.';
}

async function performAccountLevelUpgrade(ctx, targetLevel) {
  // Сначала всегда отвечаем на callback.
  await safeAnswerCbQuery(ctx);

  const userId = ctx.from.id.toString();

  try {
    if (
      !Number.isInteger(targetLevel) ||
      targetLevel < 1 ||
      targetLevel > MAX_LEVEL
    ) {
      await showAccountLevelMenu(ctx, '❌ Некорректный уровень для повышения.');
      return;
    }

    const now = Date.now();
    const lastUpgradeTime = levelCooldowns.get(userId);

    if (lastUpgradeTime && now - lastUpgradeTime < LEVEL_COOLDOWN_MS) {
      const remainingMs = LEVEL_COOLDOWN_MS - (now - lastUpgradeTime);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      await showAccountLevelMenu(
        ctx,
        `⏳ Вы недавно повышали уровень аккаунта. Попробуйте снова через ${remainingSeconds} секунд.`
      );

      return;
    }

    const costs = getAccountLevelUpgradeCosts();
    const requiredBalance = costs[targetLevel];

    if (
      requiredBalance === undefined ||
      requiredBalance === null ||
      requiredBalance < 0
    ) {
      await showAccountLevelMenu(ctx, '❌ Ошибка: некорректная стоимость уровня.');
      return;
    }

    await transaction(async () => {
      const user = await getUserById(userId);

      if (!user) {
        throw new Error('Пользователь не найден.');
      }

      const currentLevel = Number(await getAccountLevel(userId) ?? 1);
      const balance = Number(await getUserBalance(userId, 'PF') ?? 0);

      if (currentLevel >= targetLevel) {
        throw new Error('Аккаунт уже имеет этот или более высокий уровень.');
      }

      if (balance < requiredBalance) {
        throw new Error('Недостаточно средств на основном балансе.');
      }

      await updateUserBalance(userId, -requiredBalance);

      const updated = await updateAccountLevel(userId, targetLevel);

      if (!updated) {
        throw new Error('Ошибка при обновлении уровня аккаунта в базе данных.');
      }
    });

    // Кулдаун ставим только после успешного повышения.
    levelCooldowns.set(userId, now);

    let rewardMessage = '';

    if (targetLevel === 5) {
      try {
        const containerResult = await updateContainerCount(userId, 3, 10);

        if (containerResult?.success) {
          rewardMessage += `\n🎁 Награда за уровень 5: <b>10 GOLD</b> контейнеров выдано!`;
          console.log(`[REWARD] Выдано 10 GOLD контейнеров пользователю ${userId} за уровень 5.`);
        } else {
          rewardMessage += `\n⚠️ Не удалось выдать награду за уровень 5: ${
            containerResult?.message || 'Ошибка выдачи контейнеров.'
          }`;
          console.error(
            `[REWARD ERROR] Ошибка выдачи 10 GOLD контейнеров пользователю ${userId} за уровень 5:`,
            containerResult?.message
          );
        }
      } catch (error) {
        rewardMessage += `\n⚠️ Ошибка выдачи награды за уровень 5.`;
        console.error(`[REWARD ERROR] Исключение при выдаче награды за уровень 5 пользователю ${userId}:`, error);
      }
    }

    if (targetLevel === 19) {
      try {
        const containerResult = await updateContainerCount(userId, 3, 25);

        if (containerResult?.success) {
          rewardMessage += `\n🎁 Награда за уровень 19: <b>25 GOLD</b> контейнеров выдано!`;
          console.log(`[REWARD] Выдано 25 GOLD контейнеров пользователю ${userId} за уровень 19.`);
        } else {
          rewardMessage += `\n⚠️ Не удалось выдать награду за уровень 19: ${
            containerResult?.message || 'Ошибка выдачи контейнеров.'
          }`;
          console.error(
            `[REWARD ERROR] Ошибка выдачи 25 GOLD контейнеров пользователю ${userId} за уровень 19:`,
            containerResult?.message
          );
        }
      } catch (error) {
        rewardMessage += `\n⚠️ Ошибка выдачи награды за уровень 19.`;
        console.error(`[REWARD ERROR] Исключение при выдаче награды за уровень 19 пользователю ${userId}:`, error);
      }
    }

    await showAccountLevelMenu(
      ctx,
      `✅ Уровень вашего аккаунта успешно повышен до <b>${targetLevel}</b>!${rewardMessage}`
    );
  } catch (error) {
    console.error(`[LEVEL] Ошибка при повышении уровня аккаунта для пользователя ${userId}:`, error);

    const friendlyError = getFriendlyLevelError(error.message);

    await showAccountLevelMenu(ctx, `❌ ${friendlyError}`);
  }
}

module.exports = {
  showAccountLevelMenu,
  handleUpgradeAccountLevel,
  handleShowAccountLevelGrid,
  performAccountLevelUpgrade,

  getAccountLevelRewards,
  getAccountLevelUpgradeCosts,
  formatNumber,
};