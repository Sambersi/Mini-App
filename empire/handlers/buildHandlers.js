// empire/handlers/buildHandlers.js
const { Markup } = require('telegraf');
// Импортируем нужные функции из основной базы данных, включая updateUserBalance и getUserBalance
const { getUserById, updateUserBalance, getUserBalance } = require('../../db'); // Основная база
const { createBusiness, getUserBusinesses, hasBusinessOfType, upgradeBusinessLevel, getBusinessById } = require('../db'); // База империи
const { BUSINESS_TYPES_MAP, getBusinessPriceByTypeId, getBusinessConfigByTypeId, getBusinessUpgradePriceByTypeId, getTypeIdByName, getBusinessMaxLevelByTypeId } = require('../logic/businessLogic'); // Логика

const ITEMS_PER_PAGE = 8; // Сколько бизнесов отображать на одной странице

// --- Основное меню постройки ---
async function showBuildMenu(ctx, page = 1) {
    const userId = ctx.from.id.toString();
    const user = getUserById(userId);

    // Получаем все типы бизнесов
    const allTypes = Object.entries(BUSINESS_TYPES_MAP);
    const totalItems = allTypes.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // Проверяем, что страница существует
    if (page < 1 || page > totalPages) {
        page = 1;
    }

    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageTypes = allTypes.slice(startIndex, endIndex);

    let message = `🏗 <b>Меню постройки бизнеса</b>\n\n`;
    message += `Ваш баланс: <b>${user.balance.toLocaleString('ru-RU')} PF</b>\n\n`;
    message += `Выберите бизнес для просмотра информации:\n`;

    const keyboard = [];

    for (const [id, info] of pageTypes) {
        // Проверяем, есть ли у пользователя уже этот тип бизнеса
        const userBusinesses = getUserBusinesses(userId);
        const userBusinessOfType = userBusinesses.find(b => b.type === info.name);

        // Формируем текст кнопки
        const buttonText = userBusinessOfType ? `✅ ${info.baseConfig.name} (Ур. ${userBusinessOfType.level})` : `🛒 ${info.baseConfig.name}`;
        const callbackData = `view_business_info_${id}`;

        // Добавляем кнопку в отдельную строку
        keyboard.push([Markup.button.callback(buttonText, callbackData)]);
    }

    // Добавляем навигацию по страницам
    if (totalPages > 1) {
        const navRow = [];
        if (page > 1) {
            navRow.push(Markup.button.callback('⬅️ Назад', `build_page_${page - 1}`));
        }
        if (page < totalPages) {
            navRow.push(Markup.button.callback('Вперёд ➡️', `build_page_${page + 1}`));
        }
        keyboard.push(navRow);
    }

    // Кнопка "Назад" в общее меню
    keyboard.push([Markup.button.callback('⬅️ Назад', 'back_to_empire')]);

    await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});
}

// --- Обработчик кнопки "построить бизнес" (из основного меню империи) ---
async function handleBuildMenu(ctx) {
    await showBuildMenu(ctx, 1); // Открываем первую страницу
}

// --- Обработчик навигации по страницам ---
async function handleBuildPage(ctx) {
    const match = ctx.match[1]; // page number
    const page = parseInt(match, 10);
    await showBuildMenu(ctx, page);
}

// --- Обработчик просмотра информации о бизнесе ---
async function handleViewBusinessInfo(ctx) {
    const match = ctx.match[1]; // type id
    const typeId = parseInt(match, 10);
    const typeInfo = BUSINESS_TYPES_MAP[typeId];

    if (!typeInfo) {
        await ctx.answerCbQuery('❌ Информация о бизнесе не найдена.');
        return;
    }

    const userId = ctx.from.id.toString();
    const user = getUserById(userId);
    const userBusinesses = getUserBusinesses(userId);
    const userBusinessOfType = userBusinesses.find(b => b.type === typeInfo.name);

    let config, upgradePrice, upgradeCurrency;
    let isOwned = false;
    let currentLevel = 1;

    if (userBusinessOfType) {
        // Если бизнес куплен, показываем информацию для текущего уровня
        isOwned = true;
        currentLevel = userBusinessOfType.level;
        config = getBusinessConfigByTypeId(typeId, currentLevel);
        // Цена улучшения = цена следующего уровня
        upgradePrice = getBusinessUpgradePriceByTypeId(typeId, currentLevel);
        upgradeCurrency = config?.currency || 'PF'; // Берем валюту из текущего конфига
    } else {
        // Если бизнес не куплен, показываем информацию для уровня 1
        config = getBusinessConfigByTypeId(typeId, 1);
        upgradePrice = config?.cost; // Цена покупки - это цена улучшения с 0 до 1
        upgradeCurrency = config?.currency || 'PF';
    }

    if (!config) {
        await ctx.answerCbQuery('❌ Ошибка при получении информации о бизнесе.');
        return;
    }

    let message = `${config.emoji} <b>${config.name}</b>\n\n`;
    // --- ДОБАВЛЕНО: Отображение описания из typeInfo.baseConfig ---
    message += `📝 Описание: ${typeInfo.baseConfig.description}\n`;
    message += `📈 Уровень: <b>${currentLevel}</b>\n`;

    if (!isOwned) {
        // Если не куплен, показываем цену покупки
        message += `💸 Цена покупки: <b>${config.cost.toLocaleString('ru-RU')} ${upgradeCurrency}</b>\n`;
    } else {
        // Если куплен, показываем цену улучшения и доходность текущего уровня
        message += `📊 Генерация (Ур. ${currentLevel}): <b>${config.impPerHour.toFixed(2)} IMP/ч</b>\n`; // Округляем до сотых
    }

    // Кнопки: "Назад", "Купить" или "Улучшить"
    const keyboard = [
        [Markup.button.callback('⬅️ Назад', 'build_menu')] // Возврат к меню постройки
    ];

    if (!isOwned && user.balance >= config.cost) {
        keyboard.unshift([Markup.button.callback(`Купить за ${config.cost.toLocaleString('ru-RU')} ${upgradeCurrency}`, `confirm_buy_business_${typeId}`)]);
    } else if (!isOwned && user.balance < config.cost) {
        keyboard.unshift([Markup.button.callback('❌ Недостаточно средств', 'no_action')]);
    } else if (isOwned) {
        // Если куплен, добавляем кнопку "Улучшить", если хватает средств
        if (user.balance >= upgradePrice) {
            keyboard.unshift([Markup.button.callback(`Улучшить до Ур. ${currentLevel + 1}`, `show_upgrade_details_${userBusinessOfType.id}_${typeId}`)]); // Передаем ID бизнеса и типа
        } else {
            keyboard.unshift([Markup.button.callback('❌ Недостаточно средств', 'no_action')]);
        }
    }

    await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});
}

// --- Обработчик отображения деталей улучшения ---
async function handleShowUpgradeDetails(ctx) {
    const match = ctx.match[1]; // business id
    const businessId = parseInt(match, 10);
    const typeId = parseInt(ctx.match[2], 10); // type id

    const typeInfo = BUSINESS_TYPES_MAP[typeId];
    const business = getBusinessById(businessId);

    if (!typeInfo || !business) {
        await ctx.answerCbQuery('❌ Бизнес не найден.');
        return;
    }

    // Проверяем, что бизнес принадлежит пользователю
    const userId = ctx.from.id.toString();
    if (business.owner_id !== userId) {
        await ctx.answerCbQuery('❌ Этот бизнес не принадлежит вам.', { show_alert: true });
        return;
    }

    const currentLevel = business.level;
    const maxLevel = getBusinessMaxLevelByTypeId(typeId); // Получаем максимальный уровень

    // Проверяем, достигнут ли максимальный уровень
    if (currentLevel >= maxLevel) {
        await ctx.answerCbQuery(`❌ Достигнут максимальный уровень (${maxLevel}) для этого бизнеса.`, { show_alert: true });
        // Возвращаемся к информации о бизнесе, так как улучшать нельзя
        await handleViewBusinessInfo(ctx);
        return;
    }

    const nextLevel = currentLevel + 1;
    const upgradePrice = getBusinessUpgradePriceByTypeId(typeId, currentLevel);
    const nextLevelConfig = getBusinessConfigByTypeId(typeId, nextLevel); // Конфигурация следующего уровня

    if (!nextLevelConfig) {
        await ctx.answerCbQuery('❌ Ошибка при получении конфигурации следующего уровня.');
        return;
    }

    // Формируем сообщение с деталями улучшения
    let message = `${nextLevelConfig.emoji} <b>${nextLevelConfig.name}</b>\n\n`;
    // --- ДОБАВЛЕНО: Отображение описания из typeInfo.baseConfig ---
    message += `📝 Описание: ${typeInfo.baseConfig.description}\n`;
    message += `📌 Улучшение до уровня: <b>${nextLevel}</b>\n`;
    message += `📊 Генерация (Ур. ${nextLevel}): <b>${nextLevelConfig.impPerHour.toFixed(2)} IMP/ч</b>\n`; // Округляем до сотых
    message += `💰 Цена улучшения: <b>${upgradePrice?.toLocaleString('ru-RU') || 'N/A'} ${nextLevelConfig.currency}</b>\n`;

    // Кнопки: "Улучшить" и "Назад"
    const keyboard = [
        [Markup.button.callback('✅ Улучшить', `confirm_upgrade_business_${businessId}_${typeId}`)],
        [Markup.button.callback('⬅️ Назад', `view_business_info_${typeId}`)] // Возврат к информации о бизнесе
    ];

    await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});
}


// --- Обработчик подтверждения покупки ---
async function handleConfirmBuyBusiness(ctx) {
    const match = ctx.match[1]; // type id
    const typeId = parseInt(match, 10);
    const typeInfo = BUSINESS_TYPES_MAP[typeId];

    if (!typeInfo) {
        await ctx.answerCbQuery('❌ Бизнес не найден.');
        return;
    }

    const userId = ctx.from.id.toString();
    const user = getUserById(userId);

    // Проверяем баланс
    const price = getBusinessPriceByTypeId(typeId, 1); // Цена уровня 1
    if (user.balance < price) {
        await ctx.answerCbQuery('❌ Недостаточно средств.', { show_alert: true });
        return;
    }

    // Проверяем, есть ли уже такой бизнес
    if (hasBusinessOfType(userId, typeInfo.name)) {
        await ctx.answerCbQuery('❌ У вас уже есть этот тип бизнеса.', { show_alert: true });
        return;
    }

    // Пытаемся списать деньги и создать бизнес
    try {
        // Используем функцию updateUserBalance из основной базы данных, которая может выбросить ошибку
        // Важно: она принимает balanceChange, а не новое значение баланса.
        // Поэтому передаём -price (отрицательное изменение)
        await updateUserBalance(userId, -price); // Списываем средства

        const creationSuccess = createBusiness(userId, typeId, 1);

        if (creationSuccess) {
            await ctx.answerCbQuery(`✅ Бизнес "${typeInfo.baseConfig.name}" успешно куплен!`, { show_alert: true });
            // Возвращаемся к меню постройки
            await showBuildMenu(ctx, 1);
        } else {
            // Откатываем баланс в случае ошибки создания бизнеса
            // Используем updateUserBalance для возврата средств
            await updateUserBalance(userId, price); // Возвращаем старый баланс
            throw new Error("Ошибка при создании бизнеса. Средства возвращены.");
        }
    } catch (error) {
        console.error('[handleConfirmBuyBusiness] Ошибка при покупке бизнеса:', error);
        await ctx.answerCbQuery('❌ Ошибка при покупке бизнеса. Попробуйте позже.', { show_alert: true });
    }
}

// --- Обработчик подтверждения улучшения ---
async function handleConfirmUpgradeBusiness(ctx) {
    const match = ctx.match[1]; // business id
    const businessId = parseInt(match, 10);
    const typeId = parseInt(ctx.match[2], 10); // type id

    const typeInfo = BUSINESS_TYPES_MAP[typeId];
    const business = getBusinessById(businessId);

    if (!typeInfo || !business) {
        await ctx.answerCbQuery('❌ Бизнес не найден.');
        return;
    }

    // Проверяем, что бизнес принадлежит пользователю
    const userId = ctx.from.id.toString();
    if (business.owner_id !== userId) {
        await ctx.answerCbQuery('❌ Этот бизнес не принадлежит вам.', { show_alert: true });
        return;
    }

    const currentLevel = business.level; // Это уровень *до* улучшения
    const maxLevel = getBusinessMaxLevelByTypeId(typeId); // Получаем максимальный уровень

    // Проверяем, достигнут ли максимальный уровень ПЕРЕД списанием средств
    if (currentLevel >= maxLevel) {
        await ctx.answerCbQuery(`❌ Достигнут максимальный уровень (${maxLevel}) для этого бизнеса.`, { show_alert: true });
        // Возвращаемся к информации о бизнесе, так как улучшать нельзя
        await handleViewBusinessInfo(ctx);
        return;
    }

    const upgradePrice = getBusinessUpgradePriceByTypeId(typeId, currentLevel);
    const user = getUserById(userId);

    // Проверяем баланс
    if (user.balance < upgradePrice) {
        await ctx.answerCbQuery('❌ Недостаточно средств для улучшения.', { show_alert: true });
        return;
    }

    // Пытаемся списать деньги и улучшить бизнес
    try {
        // Используем функцию updateUserBalance из основной базы данных
        await updateUserBalance(userId, -upgradePrice); // Списываем средства

        const upgradeSuccess = upgradeBusinessLevel(businessId, currentLevel + 1); // Улучшаем до следующего уровня

        if (upgradeSuccess) {
            // await ctx.answerCbQuery(`✅ Бизнес "${typeInfo.baseConfig.name}" улучшен до уровня ${currentLevel + 1}!`, { show_alert: true });
            // Вместо редактирования текущего сообщения, вызываем handleViewBusinessInfo,
            // чтобы оно сформировало *новое* сообщение с текущим уровнем и всеми кнопками.

            // Отправляем уведомление об успехе
            await ctx.answerCbQuery(`✅ Бизнес "${typeInfo.baseConfig.name}" улучшен до уровня ${currentLevel + 1}!`, { show_alert: true });

            // Теперь вызываем handleViewBusinessInfo, чтобы оно сформировало новое сообщение
            // Нам нужно "подготовить" ctx.match так, чтобы handleViewBusinessInfo получил правильный typeId
            // ctx.match[2] содержит typeId, который нам нужен.
            // handleViewBusinessInfo ожидает, что ctx.match[1] будет typeId (из паттерна /view_business_info_(\d+)/).
            // Мы можем "подделать" ctx.match или передать typeId напрямую.
            // Проще всего вызвать handleViewBusinessInfo напрямую, передав ему typeId.
            // Однако, handleViewBusinessInfo ожидает ctx.match[1].
            // Давайте изменим её вызов, чтобы она использовала typeId, который мы получили из callback_data.

            // --- НОВАЯ ЛОГИКА (аналогичная предыдущей, но с проверкой maxLevel) ---
            // После улучшения, мы знаем, что бизнес принадлежит пользователю и его уровень увеличился.
            // Мы можем получить обновлённые данные и сформировать сообщение так же, как в handleViewBusinessInfo.

            // 1. Получаем обновлённый бизнес (уровень уже увеличен)
            const updatedBusiness = getBusinessById(businessId);
            if (!updatedBusiness) {
                 console.error(`[handleConfirmUpgradeBusiness] Бизнес с ID ${businessId} не найден после улучшения.`);
                 await ctx.answerCbQuery('❌ Ошибка при обновлении сообщения.', { show_alert: true });
                 return;
            }
            const newLevel = updatedBusiness.level; // Теперь это уровень *после* улучшения

            // 2. Получаем обновлённую конфигурацию
            const config = getBusinessConfigByTypeId(typeId, newLevel);
            if (!config) {
                 console.error(`[handleConfirmUpgradeBusiness] Конфигурация для бизнеса типа ${typeId}, уровня ${newLevel} не найдена.`);
                 await ctx.answerCbQuery('❌ Ошибка при обновлении сообщения.', { show_alert: true });
                 return;
            }

            // 3. Получаем данные пользователя и проверяем баланс для следующего улучшения
            const userAfterUpgrade = getUserById(userId);
            let upgradePriceNext = null;
            let canUpgrade = false;
            let upgradeButtonLabel = '❌ Недостаточно средств';

            if (newLevel < maxLevel) { // Проверяем, можно ли улучшать дальше
                upgradePriceNext = getBusinessUpgradePriceByTypeId(typeId, newLevel); // Цена следующего улучшения
                if (userAfterUpgrade.balance >= upgradePriceNext) {
                    canUpgrade = true;
                    upgradeButtonLabel = `Улучшить до Ур. ${newLevel + 1}`;
                }
            } else {
                // Достигнут максимальный уровень
                upgradeButtonLabel = `✅ Макс. уровень (${maxLevel})`;
            }

            const upgradeCurrency = config?.currency || 'PF';

            // 4. Формируем сообщение (аналогично handleViewBusinessInfo, но с новым уровнем)
            let message = `${config.emoji} <b>${config.name}</b>\n\n`;
            // --- ДОБАВЛЕНО: Отображение описания из typeInfo.baseConfig ---
            message += `📝 Описание: ${typeInfo.baseConfig.description}\n`;
            message += `📈 Уровень: <b>${newLevel}</b>\n`;
            // Если куплен, показываем цену улучшения и доходность текущего уровня
            message += `📊 Генерация (Ур. ${newLevel}): <b>${config.impPerHour.toFixed(2)} IMP/ч</b>\n`; // Округляем до сотых
            if (newLevel < maxLevel) {
                message += `📈 Цена улучшения (до Ур. ${newLevel + 1}): <b>${upgradePriceNext?.toLocaleString('ru-RU') || 'N/A'} ${upgradeCurrency}</b>\n`;
            } else {
                message += `📈 Максимальный уровень: <b>${maxLevel}</b>\n`;
            }

            // 5. Формируем клавиатуру (аналогично handleViewBusinessInfo)
            const keyboard = [
                [Markup.button.callback('⬅️ Назад', 'build_menu')] // Возврат к меню постройки
            ];

            // Если можно улучшить и хватает средств
            if (canUpgrade) {
                keyboard.unshift([Markup.button.callback(upgradeButtonLabel, `show_upgrade_details_${updatedBusiness.id}_${typeId}`)]);
            } else if (newLevel < maxLevel) {
                 // Если нельзя улучшить из-за нехватки средств
                 keyboard.unshift([Markup.button.callback(upgradeButtonLabel, 'no_action')]); // 'no_action' - неактивная кнопка
            } else {
                 // Если достигнут максимальный уровень
                 keyboard.unshift([Markup.button.callback(upgradeButtonLabel, 'no_action')]); // 'no_action' - неактивная кнопка
            }

            // 6. Редактируем текущее сообщение новым содержимым и клавиатурой
            await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) }).catch(() => {});


            // ВАЖНО: Не вызываем handleViewBusinessInfo, так как мы уже отредактировали текущее сообщение.
            // await handleViewBusinessInfo(ctx); // ctx.match[1] всё ещё содержит typeId
        } else {
            // Откатываем баланс в случае ошибки улучшения бизнеса
            // Используем updateUserBalance для возврата средств
            await updateUserBalance(userId, upgradePrice); // Возвращаем старый баланс
            throw new Error("Ошибка при улучшении бизнеса. Средства возвращены.");
        }
    } catch (error) {
        console.error('[handleConfirmUpgradeBusiness] Ошибка при улучшении бизнеса:', error);
        await ctx.answerCbQuery('❌ Ошибка при улучшении бизнеса. Попробуйте позже.', { show_alert: true });
    }
}


module.exports = {
    handleBuildMenu,
    handleBuildPage,
    handleViewBusinessInfo,
    handleShowUpgradeDetails, // Экспортируем новый обработчик
    handleConfirmBuyBusiness,
    handleConfirmUpgradeBusiness,
    // showBuildMenu экспортируем, если нужно будет вызывать из других мест
    showBuildMenu,
};
