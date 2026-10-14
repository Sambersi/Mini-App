// Импортируем необходимые модули
const {
    getUserById,
    updateUserBalance,
    updateUserDFBalance,
    updateContainerCount,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
} = require('../db');

const { Markup } = require('telegraf'); // Импортируем Markup для создания кнопок

// Цены на контейнеры
const containerPrices = {
    1: { currency: 'PF', price: 10000 }, // CLASSIC Контейнер
    2: { currency: 'PF', price: 50000 }, // PREMIUM Контейнер
    3: { currency: 'DF', price: 200 }, // GOLD Контейнер (только за DF)
};

// Обработчик команды "контейнер купить"
async function buyContainerHandler(ctx) {
    try {
        const userId = ctx.from.id.toString();
        let transactionStarted = false;

        const user = await getUserById(userId);
        if (!user) {
            return ctx.reply('⚠️ <b>Ошибка:</b>\nВы ещё не зарегистрированы.', { parse_mode: 'HTML' });
        }

        const text = ctx.message.text.trim().toLowerCase();
        const parts = text.split(/\s+/);

        // Валидация формата команды
        if (parts.length !== 4 || parts[1] !== 'купить') {
            return ctx.reply(
                '❕ <b>Использование:</b> контейнер купить [номер] [количество]',
                { parse_mode: 'HTML' }
            );
        }

        const containerNumber = parseInt(parts[2], 10);
        const quantity = parseInt(parts[3], 10);

        // Валидация входных данных
        if (![1, 2, 3].includes(containerNumber)) {
            return ctx.reply(
                '⚠️ <b>Ошибка:</b>\nНеверный номер контейнера. Доступные варианты: 1 (CLASSIC), 2 (PREMIUM), 3 (GOLD).',
                { parse_mode: 'HTML' }
            );
        }
        if (isNaN(quantity) || quantity <= 0) {
            return ctx.reply(
                '⚠️ <b>Ошибка:</b>\nНеверное количество. Укажите положительное число.',
                { parse_mode: 'HTML' }
            );
        }

        const containerInfo = containerPrices[containerNumber];
        const totalCost = containerInfo.price * quantity;

        // Начинаем транзакцию
        beginTransaction();
        transactionStarted = true;

        try {
            let currentBalance;
            let updateBalanceFunction;

            if (containerInfo.currency === 'PF') {
                currentBalance = user.balance;
                updateBalanceFunction = updateUserBalance;
            } else if (containerInfo.currency === 'DF') {
                currentBalance = user.df_balance;
                updateBalanceFunction = updateUserDFBalance;
            }

            // Проверяем баланс пользователя
            if (currentBalance < totalCost) {
                rollbackTransaction();
                // Формируем сообщение с информацией о недостатке средств и текущем балансе
                const balanceMessage = `
⚠️ <b>Ошибка:</b>
Недостаточно ${containerInfo.currency}. Требуется ${totalCost.toLocaleString('ru-RU')} ${containerInfo.currency}.

💰 Ваш текущий баланс: ${currentBalance.toLocaleString('ru-RU')} ${containerInfo.currency}
`.trim();
                return ctx.reply(balanceMessage, { parse_mode: 'HTML' });
            }

            // Списываем средства
            await updateBalanceFunction(userId, -totalCost);

            // Проверяем лимиты и добавляем контейнеры
            const result = updateContainerCount(userId, containerNumber, quantity);
            if (!result.success) {
                rollbackTransaction();
                
                // Формируем сообщение о лимитах
                const limitsMessage = `
⚠️ <b>Ваши лимиты контейнеров:</b>
• CLASSIC: ${result.limits[1]} шт
• PREMIUM: ${result.limits[2]} шт
• GOLD: ${result.limits[3]} шт
`.trim();

                return ctx.reply(`${result.message}\n\n${limitsMessage}`, { parse_mode: 'HTML' });
            }

            // Фиксируем транзакцию
            commitTransaction();
            transactionStarted = false;

        } catch (error) {
            if (transactionStarted) {
                rollbackTransaction();
            }
            console.error('[buyContainerHandler] Ошибка транзакции:', error);
            throw error;
        }

        // Формируем сообщение об успешной покупке
        const containerName = ['CLASSIC', 'PREMIUM', 'GOLD'][containerNumber - 1];
        const successMessage = `
✔️ Вы успешно купили ${quantity} <b>${containerName}</b> контейнер${quantity > 1 ? 'а' : ''} 
за ${totalCost.toLocaleString('ru-RU')} <b>${containerInfo.currency}</b>.
`.trim();

        return ctx.reply(successMessage, { parse_mode: 'HTML' });

    } catch (error) {
        console.error('[buyContainerHandler] Ошибка:', error);
        return ctx.reply(
            '⚠️ <b>Ошибка:</b>\nПроизошла ошибка. Попробуйте позже.',
            { parse_mode: 'HTML' }
        );
    }
}

async function sendContainerInfoMessage(ctx) {
    const message = `
📦 В нашем боте нет кейсов, но есть контейнеры!
  
❕ Команда для использования: <code>контейнеры</code>`;
  
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('📦 Контейнеры', 'open_containers')
    ]);
  
    await ctx.replyWithHTML(message, keyboard);
  }

// Обработчик команды "контейнеры"
async function containersHandler(ctx) {
    try {
        const userId = ctx.from.id.toString();
        const user = await getUserById(userId);

        if (!user) {
            return ctx.reply('Вы ещё не зарегистированы. Используйте команду /start для регистрации.');
        }

        // Информация о контейнерах
        const containersInfo = [
            { emoji: '🧱', name: 'CLASSIC', currency: 'PF', price: 10000 },
            { emoji: '💎', name: 'PREMIUM', currency: 'PF', price: 50000 },
            { emoji: '⭐️', name: 'GOLD', currency: 'DF', price: 200 },
        ];

        // Формируем текст с информацией о доступных контейнерах
        let infoText = `
📦 <b>Доступные контейнеры:</b>
`;
        containersInfo.forEach((container, index) => {
            infoText += `
${container.emoji} <b>${index + 1}. ${container.name} Контейнер</b>
Цена: ${container.price.toLocaleString('ru-RU')} ${container.currency}
`;
        });

        // Добавляем информацию о контейнерах пользователя
        infoText += `
📦 <b>Ваши контейнеры:</b>
🧱 CLASSIC: ${user.container_type_1 || 0} шт.
💎 PREMIUM: ${user.container_type_2 || 0} шт.
⭐️ GOLD: ${user.container_type_3 || 0} шт.
`;

        // Добавляем важную информацию
        infoText += `
⚠️ <b>Информация:</b>
- Открытие контейнера выдаёт <b>случайную награду</b>.
- Из контейнеров есть шанс выпадения <b>от 1 до 3 предметов за раз</b>.
- Имея статус " DIAMOND " и выше, вы сможете открывать до 5ОО контейнеров за раз.
- У каждого статуса, свои лимиты на кол-во контейнеров.

`;

        // Создаем клавиатуру с двумя рядами кнопок
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('ℹ️ Как купить контейнер?', 'info_container'),
                Markup.button.callback('🔑 Как открыть контейнер?', 'open_container_info')
            ],
            [
                Markup.button.callback('🎁 Что может выпасть в контейнере? ', 'container_rewards_info') // Новая кнопка во втором ряду
            ]
        ]);

        // Отправляем сообщение пользователю с кнопками
        return ctx.reply(infoText, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при обработке команды "контейнеры":', error);
        return ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
}

// Обработчик callback-запросов для кнопок
function setupContainerHandlers(bot) {
    // Обработчик кнопки "Как купить контейнер?"
    bot.action('info_container', async (ctx) => {
        try {
            const infoMessage = `
ℹ️ <b>Как купить контейнер:</b>

Используйте команду:
<code>контейнер купить [номер] [количество]</code>

Пример: <code>контейнер купить 1 5</code> — купить 5 CLASSIC контейнеров.
`.trim();
            await ctx.answerCbQuery(); // Закрываем уведомление о нажатии кнопки
            await ctx.reply(infoMessage, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Ошибка при обработке кнопки "Как купить контейнер?":', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });

    // Обработчик кнопки "Как открыть контейнер?"
    bot.action('open_container_info', async (ctx) => {
        try {
            const userId = ctx.from.id.toString();
            const user = await getUserById(userId);

            const openMessage = `
🔑 <b>Как открыть контейнер:</b>

Используйте команду:
<code>контейнер открыть [номер]</code>

Пример: <code>контейнер открыть 3</code> — открыть GOLD контейнер.
`.trim();

            // Создаем кнопки только для тех контейнеров, которые есть у пользователя
            const keyboardButtons = [];
            if ((user.container_type_1 || 0) > 0) {
                keyboardButtons.push(Markup.button.callback('Открыть CLASSIC 🧱', 'open_container_1'));
            }
            if ((user.container_type_2 || 0) > 0) {
                keyboardButtons.push(Markup.button.callback('Открыть PREMIUM 💎', 'open_container_2'));
            }
            if ((user.container_type_3 || 0) > 0) {
                keyboardButtons.push(Markup.button.callback('Открыть GOLD ⭐️', 'open_container_3'));
            }

            const keyboard = Markup.inlineKeyboard(keyboardButtons);

            await ctx.answerCbQuery(); // Закрываем уведомление о нажатии кнопки
            await ctx.reply(openMessage, {
                parse_mode: 'HTML',
                ...keyboard
            });
        } catch (error) {
            console.error('Ошибка при обработке кнопки "Как открыть контейнер?":', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });

    // Обработчик кнопки "Что может выпасть в контейнере?"
    bot.action('container_rewards_info', async (ctx) => {
        try {
            const rewardsInfo = `
🎁 <b>Что может выпасть в контейнерах:</b>

📦 <b>CLASSIC Контейнер</b>
Всегда содержит 1 предмет

• PF: 85% шанс
• DF: 0.4% шанс
• Статус-привилегия: 0.001% шанс
• Префикс в профиль: 2% шанс
• Ничего: 13% шанс

🪙 <b>PREMIUM Контейнер</b>
Содержит 1 - 2 предмета (шанс на второй приз — 30%)

• PF: 80% шанс
• DF: 1% шанс
• Статус-привилегия: 0.01% шанс
• Скин на карточку: 1% шанс
• Акции NPF: 5% шанс
• Префикс в профиль: 3% шанс
• Ничего: 10% шанс

👑 <b>GOLD Контейнер</b>
Содержит 1 - 3 предмета (шанс на второй предмет — 20%, на третий — 10%)

• PF: 69% шанс
• DF: 5% шанс
• Статус-привилегия: 0.05% шанс
• Скин на карточку: 3% шанс
• Акции NPF: 6% шанс
• Префикс в профиль: 7% шанс
• Ничего: 10% шанс

⚠️ <b>Примечание:</b>
- В GOLD контейнере есть возможность получить сразу несколько предметов!
`.trim();

            await ctx.answerCbQuery(); // Закрываем уведомление о нажатии кнопки
            await ctx.reply(rewardsInfo, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Ошибка при обработке кнопки "Что может выпасть в контейнере?":', error);
            await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
    });
}

// Экспортируем функции
module.exports = {
    buyContainerHandler,
    containersHandler,
    setupContainerHandlers,
    sendContainerInfoMessage
};