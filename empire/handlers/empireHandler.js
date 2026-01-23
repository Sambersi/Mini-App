// empire/handlers/empireHandler.js
const { Markup } = require('telegraf');
const { getUserById } = require('../../db'); // Из основной базы
const { getEmpireBalance, getUserBusinesses } = require('../db'); // Из новой базы империй
const { calculateAccumulatedImp, getBusinessConfig, getTypeIdByName } = require('../logic/businessLogic'); // Логика


async function empireHandler(ctx) {
  const userId = ctx.from.id;
  const user = await getUserById(userId.toString()); // Из основной базы
  const empireUser = user; // Теперь все данные в одном объекте
  const businesses = getUserBusinesses(userId); // Из вспомогательной таблицы

  let totalAccumulatedImp = 0;
  let totalLevel = 0;

  const businessDetails = businesses.map(business => {
    // ВАЖНО: Проверяем, что config существует перед использованием его свойств
    const config = getBusinessConfig(business.type, business.level);
    if (!config) {
        // Если конфиг не найден, логируем и пропускаем этот бизнес или отображаем ошибку
        console.error(`[empireHandler] Конфигурация для типа бизнеса '${business.type}' (DB ID: ${business.id}) не найдена.`);
        return `⚠️ <b>Неизвестный бизнес (DB ID: ${business.id}, Тип: ${business.type})</b>\n├ Уровень: ${business.level}\n└ (Ошибка: тип не найден)`;
    }

    // --- НОВОЕ: Получаем ID типа бизнеса ---
    const typeId = getTypeIdByName(business.type);
    if (typeId === null) {
        // Если ID типа не найден, логируем и используем DB ID как резервный вариант
        console.error(`[empireHandler] ID типа для '${business.type}' (DB ID: ${business.id}) не найден в маппинге.`);
        // Вариант: всё равно отображаем бизнес, но с пометкой
        return `⚠️ <b>Бизнес (DB ID: ${business.id}, Тип: ${config.name}, ТипID: ?)</b>\n├ Уровень износа: <b>${business.wear_percentage}%</b>\n├ Накоплено: <b>${calculateAccumulatedImp(business, config).toFixed(2)} IMP</b>\n└ Генерация: <b>${config.impPerHour} IMP/ч</b>`;
    }
    // --- КОНЕЦ НОВОГО ---

    const accumulated = calculateAccumulatedImp(business, config);
    totalAccumulatedImp += accumulated;
    totalLevel += business.level;

    // --- ОБНОВЛЁННОЕ ОТОБРАЖЕНИЕ: используем typeId вместо business.id ---
    return `
${config.emoji} <b>${config.name} (ТипID: ${typeId}, Ур. ${business.level})</b>
├ Уровень износа: <b>${business.wear_percentage}%</b>
├ Накоплено: <b>${accumulated.toFixed(2)} IMP</b>
└ Генерация: <b>${config.impPerHour} IMP/ч</b>
    `.trim();
  });

  // Объединяем детали, избегая лишних пустых строк
  const businessDetailsText = businessDetails.length > 0 ? businessDetails.join('\n\n') : '';

  const profileText = `
🏰 <b>Ваша Империя</b>

👤 <b>Владелец:</b> ${user.username}
📊 <b>Суммарный уровень бизнесов:</b> ${totalLevel}
💰 <b>Баланс IMP:</b> ${getEmpireBalance(userId).toFixed(2)}
📦 <b>Всего накоплено IMP:</b> ${totalAccumulatedImp.toFixed(2)}

${businessDetailsText || 'У вас пока нет бизнесов. Начните строительство!'}
  `.trim();

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏗 Построить бизнес', 'build_menu')], // Новая кнопка
    [Markup.button.callback('📊 Статистика', 'empire_stats')],
    // [Markup.button.callback('⚔️ Атаковать', 'attack_menu')], // Если PvP сразу
    // [Markup.button.callback('👥 Клан', 'clan_menu')], // Если кланы сразу
  ]);

  await ctx.reply(profileText, { parse_mode: 'HTML', ...keyboard });
}

// --- НОВАЯ ФУНКЦИЯ: Обработчик статистики империи ---
async function empireStatisticsHandler(ctx) {
  const userId = ctx.from.id;
  const user = await getUserById(userId.toString());
  const businesses = getUserBusinesses(userId);

  let totalLevel = 0;
  let totalImpGenerated = 0; // empire_total_imp_generated
  let totalImpSpent = 0; // empire_total_imp_spent
  let totalImpBalance = 0; // empire_imp_balance

  // Используем getUserBusinesses для получения данных
  const businessDetails = businesses.map(business => {
    const config = getBusinessConfig(business.type, business.level);
    if (!config) {
        console.error(`[empireStatisticsHandler] Конфигурация для типа бизнеса '${business.type}' (DB ID: ${business.id}) не найдена.`);
        return null; // Пропускаем этот бизнес
    }

    const accumulated = calculateAccumulatedImp(business, config);
    totalLevel += business.level;
    // totalImpGenerated и totalImpSpent не рассчитываются тут, а берутся из основной таблицы
    // totalImpBalance берётся из основной таблицы

    return `
${config.emoji} <b>${config.name} (Ур. ${business.level})</b>
├ Уровень износа: <b>${business.wear_percentage}%</b>
├ Накоплено: <b>${accumulated.toFixed(2)} IMP</b>
└ Генерация: <b>${config.impPerHour.toFixed(2)} IMP/ч</b>
    `.trim();
  }).filter(detail => detail !== null); // Убираем возможные null

  const businessDetailsText = businessDetails.length > 0 ? businessDetails.join('\n\n') : 'Нет бизнесов.';

  // Получаем статистику из основной таблицы users
  totalImpGenerated = user.empire_total_imp_generated || 0;
  totalImpSpent = user.empire_total_imp_spent || 0;
  totalImpBalance = user.empire_imp_balance || 0;

  const statsText = `
📊 <b>Статистика Империи</b> для ${user.username}

<b>Общая информация:</b>
├ Суммарный уровень бизнесов: <b>${totalLevel}</b>
├ Всего накоплено IMP: <b>${totalImpGenerated.toFixed(2)}</b>
├ Всего потрачено IMP: <b>${totalImpSpent.toFixed(2)}</b>
└ Баланс IMP: <b>${totalImpBalance.toFixed(2)}</b>

<b>Детали бизнесов:</b>
${businessDetailsText}
  `.trim();

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'back_to_empire')] // Кнопка "Назад" в меню империи
  ]);

  await ctx.editMessageText(statsText, { parse_mode: 'HTML', ...keyboard }).catch(() => {}); // catch на случай, если сообщение не из callback
}

module.exports = { empireHandler, empireStatisticsHandler };