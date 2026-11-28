// handlers/bossHandler.js
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { getTimeUntilNextEnergyRestore } = require('../boss/energyHandler');

// --- ИМПОРТ ВСЕХ НЕОБХОДИМЫХ ФУНКЦИЙ ИЗ БД ---
const {
    addNewBoss,
    getCurrentBoss,
    updateBossState,
    getCurrentEnergy,
    getUserAttackPower,
    reduceUserEnergy,
    addBossDamageToUser,
    getActiveWeapon,
    getUserById,
    reduceAttackPowerBy90Percent,
    resetBossDamage,
    transitionToPhase2,
    getUsersWithDamage,
    isHyperlinkDisabled,
    distributePrizesToTopPlayers,
    getLastAttackTime,
    updateLastAttackTime,
    deleteAttackState,
    getAttackState,
    saveAttackState,
    reduceWeaponDurability,
    removeBrokenWeapon,
    switchToDefaultWeapon,
    updateAttackMessageId,
    getCurrentWeaponDurability,
    getMaxEnergyByStatus,
    cleanupOldAttackStates
} = require('../db');
// --- КОНЕЦ ИМПОРТА ---

const { createCanvas, loadImage } = require('canvas');

// Путь к папке с изображениями боссов
const bossImagesPath = path.join(__dirname, '..', 'boss', 'bossImages');

// --- НОВЫЕ КОНСТАНТЫ ---
// Список новых видов оружия, дающих полный урон
const NEW_WEAPONS = ['Ручка', 'Бумажка', 'Указка'];
// Множитель урона для старого оружия
const OLD_WEAPON_DAMAGE_MULTIPLIER = 0.1;
// Множитель урона за серию правильных ответов
const STREAK_BONUS_MULTIPLIER = 2.0;
// Начальное время на ответ (в секундах)
const INITIAL_TIME_LIMIT = 10;
// Уменьшение времени за каждую серию (до минимума)
// Для серий 0, 1, 2, 3, 4+ (0 - начальное состояние)
const TIME_REDUCTION_PER_STREAK = [0, 1, 2, 3, 4]; 
const MIN_TIME_LIMIT = 6; // Минимальное время на ответ
// Количество правильных ответов подряд для бонуса
const STREAK_THRESHOLD = 5;
// Интервал обновления счётчика (в миллисекундах) - ИЗМЕНЕНО на 2 секунды
const TIMER_UPDATE_INTERVAL = 2000;
// Время отображения результата атаки (в миллисекундах) - 3 секунды
const ATTACK_RESULT_DISPLAY_TIME = 3000;
// --- КОНЕЦ НОВЫХ КОНСТАНТ ---

// --- ХРАНИЛИЩЕ ТАЙМЕРОВ ---
// Для отслеживания активных таймеров обновления сообщений
const activeTimers = new Map();
// Для отслеживания таймеров задержки отображения результата
const resultDisplayTimers = new Map();
// --- КОНЕЦ ХРАНИЛИЩА ТАЙМЕРОВ ---

// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
    const escapedUsername = username
        ? username.replace(/([<>&"'])/g, (match) => {
            const escapeMap = {
                '<': '<',
                '>': '>',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escapeMap[match];
        })
        : 'Неизвестный';

    if (disableHyperlink) {
        return escapedUsername;
    }

    return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`;
}

// handlers/bossHandler.js

// ... (предыдущие импорты и константы остаются без изменений)

async function generateBossImage(bossName, currentPhaseHp, maxPhaseHp, activeWeapon, isBossAlive, phase) {
    try {
        // Выбираем фоновое изображение босса в зависимости от состояния и фазы
        const bossImagePath = path.join(
            __dirname,
            '..',
            'boss',
            'bossImages',
            isBossAlive
                ? phase === 1
                    ? 'boss1.jpg'
                    : 'boss2.jpg'
                : 'boss3.jpg' // Используем boss3.jpg когда босс мёртв
        );

        // Создаем canvas для работы с изображением
        const canvas = createCanvas(1920, 1080); // Размеры изображения босса
        const ctx = canvas.getContext('2d');

        // Загружаем фоновое изображение босса
        const bossImage = await loadImage(bossImagePath);
        ctx.drawImage(bossImage, 0, 0, canvas.width, canvas.height);

        // --- НОВАЯ ЛОГИКА ---
        // Отображаем элементы интерфейса (полоса здоровья, оружие) только если босс жив
        if (isBossAlive) {
            // ВСЕГДА используем line1.png для полосы здоровья, независимо от фазы
            const lineImagePath = path.join(__dirname, '..', 'boss', 'bossImages', 'line1.png');

            // Загружаем изображение полосы здоровья
            const lineImage = await loadImage(lineImagePath);

            // Координаты и размеры для полосы здоровья
            const linePosition = {
                x: 468,
                y: 114 // Пересчитываем координату Y от верхней границы
            };
            const lineSize = { width: 1140, height: 429 }; // Исходные размеры для полосы здоровья

            // Вычисляем процент оставшегося HP относительно текущей фазы
            const hpPercentage = Math.max(
                0,
                Math.min(100, (currentPhaseHp / maxPhaseHp) * 100)
            ); // Ограничиваем значение от 0 до 100

            // Вычисляем ширину обрезанной части изображения
            const croppedWidth = (hpPercentage / 100) * lineSize.width;

            // Рисуем обрезанную часть изображения
            ctx.drawImage(
                lineImage,
                0, // Начало обрезки по X (слева)
                0, // Начало обрезки по Y (сверху)
                croppedWidth, // Ширина обрезанной части
                lineSize.height, // Высота остается неизменной
                linePosition.x, // Координата X на canvas
                linePosition.y, // Координата Y на canvas
                croppedWidth, // Ширина нарисованной части
                lineSize.height // Высота нарисованной части
            );

            // Добавляем активное оружие на изображение
            if (activeWeapon) {
                const weaponImagePath = path.join(__dirname, '..', 'boss', 'bossImages', activeWeapon.image_file);
                const weaponImage = await loadImage(weaponImagePath);

                // Координаты и размеры для активного оружия
                const weaponPosition = {
                    x: activeWeapon.x_position,
                    y: activeWeapon.y_position // Верхняя координата Y
                };
                const weaponSize = {
                    width: activeWeapon.width,
                    height: activeWeapon.height
                };

                // Рисуем изображение активного оружия
                ctx.drawImage(
                    weaponImage,
                    0, // Начало обрезки по X (слева)
                    0, // Начало обрезки по Y (сверху)
                    weaponSize.width, // Ширина оружия
                    weaponSize.height, // Высота оружия
                    weaponPosition.x, // Координата X на canvas
                    weaponPosition.y, // Координата Y на canvas
                    weaponSize.width, // Ширина нарисованного оружия
                    weaponSize.height // Высота нарисованного оружия
                );
            }
        }
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

        // --- НОВАЯ ЛОГИКА ДОБАВЛЕНИЯ ТЕКСТА HP ---
        // Загружаем шрифт impact.ttf
        const fontPath = path.join(process.cwd(), 'fonts', 'impact.ttf');
        if (!fs.existsSync(fontPath)) {
            throw new Error('Шрифт impact.ttf не найден.');
        }
        ctx.font = 'bold 32px "impact"';
        ctx.fillStyle = '#E74A5E'; // розовый цвет текста
        ctx.strokeStyle = '#41015B'; // цвет обводки
        ctx.lineWidth = 2; // ширина линии обводки

        // Форматируем числа HP с разделителями
        const formattedCurrentHp = currentPhaseHp.toLocaleString('ru-RU'); // Например: 1.234.567
        const formattedMaxHp = maxPhaseHp.toLocaleString('ru-RU'); // Максимальное HP для текущей фазы

        // Добавляем текстовую информацию (например, HP босса) с обводкой
        const textToDraw = `HP: ${formattedCurrentHp} / ${formattedMaxHp}`;
        const textX = 1470;
        const textY = 186;
        ctx.strokeText(textToDraw, textX, textY); // Рисуем обводку
        ctx.fillText(textToDraw, textX, textY); // Рисуем сам текст поверх обводки
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ДОБАВЛЕНИЯ ТЕКСТА HP ---

        // Сохраняем изображение во временную папку
        const tempDir = path.join(__dirname, '..', 'boss', 'temp'); // Адаптировано под структуру
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const outputPath = path.join(tempDir, `boss_image_${Date.now()}.png`);
        const out = fs.createWriteStream(outputPath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);

        return new Promise((resolve, reject) => {
            out.on('finish', () => resolve(outputPath));
            out.on('error', reject);
        });
    } catch (error) {
        console.error('Ошибка при генерации изображения босса:', error);
        throw error;
    }
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ МАТЕМАТИЧЕСКОГО ПРИМЕРА ---
/**
 * Генерирует математический пример (только сложение и вычитание).
 * @returns {Object} Объект с num1, operation, num2 и correctResult.
 */
function generateMathExample() {
    let num1, num2, operation, correctResult;
    
    // Генерируем случайные числа для примера (только + и -)
    // Для вычитания гарантируем, что результат не отрицательный
    do {
        num1 = Math.floor(Math.random() * 15) + 1; // Число от 1 до 15 для большего разнообразия
        num2 = Math.floor(Math.random() * 15) + 1; // Число от 1 до 15
        operation = ['+', '-'][Math.floor(Math.random() * 2)]; // Только сложение и вычитание

        // Вычисляем правильный ответ
        switch (operation) {
            case '+': 
                correctResult = num1 + num2; 
                break;
            case '-': 
                // Гарантируем, что результат не отрицательный
                if (num1 >= num2) {
                    correctResult = num1 - num2;
                } else {
                    correctResult = num2 - num1;
                    // Меняем местами числа для корректного отображения примера
                    [num1, num2] = [num2, num1];
                }
                break;
            default: 
                correctResult = num1 + num2;
        }
    } while (operation === '-' && correctResult < 0); // Повторяем, если результат отрицательный при вычитании

    return { num1, operation, num2, correctResult, example: `${num1} ${operation} ${num2}` };
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ КЛАВИАТУРЫ С МАТЕМАТИКОЙ ---
/**
 * Генерирует клавиатуру с математическим примером.
 * @param {number} phase - Фаза босса (1 или 2).
 * @returns {Object} Объект с inline_keyboard, answers, correctResult и example.
 */
function generateMathKeyboard(phase) {
    // Генерируем пример
    const { num1, operation, num2, correctResult, example } = generateMathExample();
    
    // Создаем массив из вариантов ответов (включая правильный)
    const answers = [correctResult]; // Правильный ответ
    
    // Определяем количество неправильных ответов в зависимости от фазы
    const totalAnswers = phase === 1 ? 4 : 8;
    
    while (answers.length < totalAnswers) {
        // Генерируем неправильные ответы в разумном диапазоне
        // Используем Math.abs(correctResult) + 15 как верхнюю границу
        const wrongAnswer = Math.floor(Math.random() * (Math.abs(correctResult) + 15)) + 1;
        if (!answers.includes(wrongAnswer)) {
            answers.push(wrongAnswer);
        }
    }
    
    // Рандомизируем порядок
    for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    // Определяем количество строк кнопок в зависимости от фазы
    const rows = phase === 1 ? 1 : 2;
    const cols = phase === 1 ? 4 : 4; // 4 колонки в каждой строке
    
    // Создаем сетку кнопок
    const keyboard = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
            const index = row * cols + col;
            return {
                text: `${answers[index]}`,
                callback_data: `attack_boss_${index}`
            };
        })
    );

    // Добавляем кнопку "Назад в меню"
    keyboard.push([{ text: '↩️ Назад в меню', callback_data: 'back_to_boss_handler' }]);

    return { inline_keyboard: keyboard, answers: answers, correctResult: correctResult, example: example };
}
// --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

async function bossHandler(ctx) {
    try {
        const currentBoss = (await getCurrentBoss());
        if (!currentBoss) {
            return ctx.reply('❌ В данный момент активных боссов нет.');
        }

        const isBossAlive = currentBoss.phase === 1 ? currentBoss.phase1_hp > 0 : currentBoss.phase2_hp > 0;
        const userId = ctx.from.id.toString();
        const user = (await getUserById(userId));
        if (!user) return ctx.reply('Ошибка: пользователь не найден.');

        const activeWeapon = (await getActiveWeapon(userId));
        
        // --- ЛОГИКА РАСЧЕТА УРОНА С УЧЕТОМ ТИПА ОРУЖИЯ ---
        let displayAttackPower = user.attack_power || 0;
        let damageInfoSuffix = ''; // Суффикс для отображения информации о пониженном уроне
        
        if (activeWeapon) {
            if (activeWeapon.name === 'Кулак') {
                // Для кулаков используем силу удара пользователя
                displayAttackPower = user.attack_power || 0;
            } else {
                // Для любого оружия (нового или старого) используем базовый урон
                displayAttackPower = activeWeapon.base_damage;
                
                // Проверяем, является ли оружие "старым"
                const isOldWeapon = !['Кулак', ...NEW_WEAPONS].includes(activeWeapon.name);
                if (isOldWeapon) {
                    // Применяем множитель урона для старого оружия
                    displayAttackPower = Math.floor(displayAttackPower * OLD_WEAPON_DAMAGE_MULTIPLIER);
                    // Добавляем суффикс к отображению
                    damageInfoSuffix = ' (Пониженный урон)';
                }
            }
        } else {
            // Если оружие не найдено, используем базовую силу удара
            displayAttackPower = user.attack_power || 0;
        }
        // --- КОНЕЦ ЛОГИКИ РАСЧЕТА УРОНА ---

        const currentPhaseHp = currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp;
        const maxPhaseHp = currentBoss.phase === 1 ? currentBoss.phase1_max_hp : currentBoss.phase2_max_hp;
        const formattedCurrentHp = currentPhaseHp.toLocaleString('ru-RU');
        const formattedMaxHp = maxPhaseHp.toLocaleString('ru-RU');
        const userLink = createUserLink(userId, user.username, (await isHyperlinkDisabled(userId)));

        let message;
        if (isBossAlive) {
            message = `
🗡️ ${userLink}, информация о текущем боссе:

👾 <b>${currentBoss.name}</b>
💠 Фаза: <b>${currentBoss.phase}</b>
♥️ Оставшееся HP: <b>${formattedCurrentHp} / ${formattedMaxHp}</b>

💥 Ваша атака:
  🔫 Оружие: <b>${activeWeapon ? activeWeapon.name : 'Кулаки'}</b>
  ⚔️ Сила урона: <b>${displayAttackPower}</b>${damageInfoSuffix}
`.trim();
        } else {
            message = `
💀 ${userLink}, БОСС ПОВЕРЖЕН!

👾 <b>${currentBoss.name}</b>
💠 Фаза: <b>${currentBoss.phase}</b>
♥️ Оставшееся HP: <b>0</b>

💥 Ваша атака:
  🔫 Оружие: <b>${activeWeapon ? activeWeapon.name : 'Кулаки'}</b>
  ⚔️ Сила урона: <b>${displayAttackPower}</b>${damageInfoSuffix}
`.trim();
        }

        const generatedImagePath = await generateBossImage(
            currentBoss.name, currentPhaseHp, maxPhaseHp, activeWeapon, isBossAlive, currentBoss.phase
        );

        const keyboard = {
            inline_keyboard: [
                isBossAlive
                    ? [
                        { text: '⚔️ Атака', callback_data: 'attack_boss' },
                        { text: '🏆 Топ по урону', callback_data: 'boss_damage_top' }
                    ]
                    : [{ text: '🏆 Топ по урону', callback_data: 'boss_damage_top' }],
                [
                    { text: '⚡ Энергия', callback_data: 'energy_info' },
                    { text: '💪 Прокачка навыков', callback_data: 'skill_upgrade' }
                ],
                [
                    { text: '🎯 Информация о боссе', callback_data: 'boss_info' }
                ],
                [
                    { text: '⬅️ Назад', callback_data: 'back_to_main_menu' }
                ]
            ]
        };

        await ctx.replyWithPhoto(
            { source: generatedImagePath },
            { caption: message, parse_mode: 'HTML', reply_markup: keyboard }
        );

        fs.unlink(generatedImagePath, (err) => {
            if (err) console.error('Ошибка при удалении временного файла:', err);
        });
    } catch (error) {
        console.error('Ошибка при получении информации о боссе:', error);
        await ctx.reply('Произошла ошибка при получении информации о боссе.');
    }
}

async function startNewBoss(ctx) {
    try {
        const args = ctx.message.text.split(/\s+/).slice(1);
        if (args.length < 5) {
            return await ctx.reply(
                '❌ Неверный формат команды.\nИспользуйте: новый_босс [название] [файл_изображения] [HP] [тип приза] [количество]'
            );
        }

        // const [name, imageFile, hpStr, prizeType, prizeAmountStr] = args; // Имя будет фиксированным
        const [, imageFile, hpStr, prizeType, prizeAmountStr] = args; // Пропускаем имя из аргументов

        const hp = parseInt(hpStr, 10);
        const prizeAmount = parseFloat(prizeAmountStr);

        if (isNaN(hp) || hp <= 0) {
            return await ctx.reply('❌ Некорректное значение HP. Укажите положительное число.');
        }
        const validPrizeTypes = ['balance'];
        if (!validPrizeTypes.includes(prizeType)) {
            return await ctx.reply(`❌ Недопустимый тип приза. Используйте один из: ${validPrizeTypes.join(', ')}.`);
        }
        if (isNaN(prizeAmount) || prizeAmount <= 0) {
            return await ctx.reply('❌ Некорректное значение приза. Укажите положительное число.');
        }

        const imagePath = path.join(bossImagesPath, imageFile);
        if (!fs.existsSync(imagePath)) {
            console.log(`📝 <b>Ошибка:</b> Файл изображения не найден: ${imageFile}`);
            return await ctx.reply('❌ Указанный файл изображения не найден.');
        }


        // ФИКСИРОВАННОЕ ИМЯ БОССА
        const bossName = 'Математика';

        console.log(`📝 <b>Данные для сохранения в базу данных:</b>
    ├ Название: ${bossName}
    ├ Файл изображения: ${imageFile}
    ├ HP: ${hp}
    ├ Тип приза: ${prizeType}
    ├ Количество приза: ${prizeAmount}`);

        if(!Number.isSafeInteger(ctx.update?.update_id))throw new Error('Telegram update ID required');
        const result=await require('../db').startBossEncounter({adminId:String(ctx.from.id),imageFile,hp,prizeType,prizeAmount,operationKey:'telegram:'+ctx.from.id+':'+ctx.update.update_id});
        if (result && result.changes > 0) {
            const phase1MaxHp = Math.floor(hp / 2);
            const phase2MaxHp = Math.ceil(hp / 2);

            await ctx.replyWithHTML(
                `✅ Новый босс успешно создан!\n` +
                `<b>${bossName}</b>\n` +
                `Файл изображения: <code>${imageFile}</code>\n` +
                `HP: <b>${hp}</b>\n` +
                `Максимальное HP (Фаза 1): <b>${phase1MaxHp}</b>\n` +
                `Максимальное HP (Фаза 2): <b>${phase2MaxHp}</b>\n` +
                `📊 Статистика сброшена:\n` +
                `- Нанесенный урон всеми игроками обнулен.\n` +
                `- Прокачка силы урона кулаков уменьшена на 90%.\n` +
                `🎁 Приз за победу: <b>${prizeAmount} ${prizeType}</b>`
            );
        } else {
            console.log(`📝 <b>Ошибка:</b> Не удалось добавить босса в базу данных.`);
            await ctx.reply('❌ Не удалось создать босса.');
        }
    } catch (error) {
        console.error('Ошибка при создании босса:', error);
        await ctx.reply('Произошла ошибка при создании босса.');
    }
}

// --- УЛУЧШЕННАЯ ЛОГИКА АТАКИ С МАТЕМАТИКОЙ ---
const attackBoss=require('../src/telegram/bossCombat').createBossAttackHandler({prepare:require('../db').prepareBossAttack,answer:require('../db').answerBossAttack,attach:require('../db').attachBossQuestion,expire:require('../db').expireBossQuestion,read:require('../db').getBossQuestion});
// --- КОНЕЦ УЛУЧШЕННОЙ ЛОГИКИ АТАКИ ---

async function sendBossGameInfo(ctx) {
    try {
        const infoMessage = `
ℹ️ <b>Информация о игре "Босс"!</b>

👾 <b>Что такое босс?</b>
Босс — это уникальное событие, которое может начаться в любой момент. Это вызов для всех игроков, где только объединенные усилия смогут привести к победе. Однако помните: награды получат лишь те, кто проявит себя лучше других!

🏆 <b>Топ-25 игроков</b>, нанесших наибольший урон, получат эксклюзивные призы!
• Ваша цель — занять место в рейтинге лучших. Информация о топ-25 урона всегда доступна через меню босса, чтобы вы могли следить за своими достижениями и планировать свои действия.

⚡️ <b>Особенности босса:</b>

1️⃣ <b>Многофазовая система:</b>
Босс имеет минимум 2 фазы, каждая из которых усложняет его атаки и делает сражение более напряженным. Переход между фазами зависит от нанесенного урона. Чем дальше вы продвинетесь, тем сложнее будет атаковать!

2️⃣ <b>Увеличение силы атаки:</b>
Существует два способа усилить свою атаку:

- <b>Покупка оружия:</b>
Оружие играет ключевую роль в бою. Некоторые виды оружия будут особенно эффективны против определенных боссов, поэтому важно тщательно подбирать их перед сражением.
  • <b>Новое оружие</b> ("Ручка", "Бумажка", "Указка") наносит <b>полный урон</b>.
  • <b>Старое оружие</b> наносит <b>на 90% меньше урона</b>.

- <b>Прокачка силы удара:</b>
Вы можете увеличивать базовую силу своей атаки за счет PF. Однако будьте внимательны: на это требуется энергия, которую нужно грамотно распределять между атаками и улучшениями.

3️⃣ <b>Энергия как важнейший ресурс:</b>
Энергия — это ключевой элемент вашего прогресса. Она восстанавливается со временем и используется как для атак, так и для прокачки способностей. Планируйте свои действия заранее, чтобы не остаться без сил в самый ответственный момент! (Имея статус максимальная энергия увеличивается)

4️⃣ <b>Прочность:</b>
Прочность — немаловажный фактор в боссе, ведь при разрушении оружия вам придется снова его покупать. Прочность уходит от промахов при сражении с боссом, цельтесь тщательней, чтобы не тратить PF в лишний раз!

5️⃣ <b>Математика:</b>
Чтобы атаковать босса, вам нужно решать простые математические примеры! Выбирайте правильный ответ из предложенных вариантов.

6️⃣ <b>Серия правильных ответов:</b>
Если вы решите <b>5 примеров подряд</b> правильно, вы получите <b>двойной урон</b>!
  • За каждую правильную серию время на следующий ответ <b>уменьшается</b> (10с → 9с → 8с → 7с → 6с).
  • При ошибке, истечении времени или победе над боссом серия сбрасывается.

❔ <b>Как получить информацию о боссе?</b>
🔔 <b>Уведомления:</b>
• Вся важная информация о текущем состоянии босса, его фазах и времени до следующего перехода будет приходить вам через уведомления.

💬 <b>Канал:</b>
• Не забудьте подписаться на наш канал, чтобы быть в курсе всех боссов, новостей и секретов!

🌟 <b>Помните:</b>
• Успех зависит от вашей стратегии.
• Энергия — ваш главный ресурс, используйте её мудро.
• Топ-25 игроков получают призы, но каждый удар важен для победы!

⚔️ Готовы принять вызов? Ждите уведомление о новом боссе и приступайте к атаке!
`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '⬅️ Назад', callback_data: 'back_to_boss_handler' }]
            ]
        };

        await ctx.replyWithHTML(infoMessage, { reply_markup: keyboard });
    } catch (error) {
        console.error('[sendBossGameInfo] Ошибка:', error);
        await ctx.reply('❌ Произошла ошибка при отправке информации о игре.');
    }
}

// Обработчик кнопок с индексами (например, "attack_boss_0", "attack_boss_1")
async function handleAttackButton(ctx) {
    await handleCallbackWithErrorHandling(ctx, async () => {
        try {
            const userId = ctx.from.id.toString(); // ID текущего пользователя
            const selectedButtonIndex = parseInt(ctx.match[1], 10); // Индекс нажатой кнопки

            // Логируем вызов обработчика кнопки
            console.log(`[LOG] Пользователь ${userId} попытался нажать на кнопку атаки.`);
            console.log(`[DEBUG] Нажата кнопка с индексом: ${selectedButtonIndex} (тип: ${typeof selectedButtonIndex})`);
            console.log(`[DEBUG] ctx.match:`, ctx.match);
            console.log(`[DEBUG] ctx.callbackQuery.message.message_id:`, ctx.callbackQuery?.message?.message_id);

            // Получаем состояние атаки для пользователя
            let attackState = (await getAttackState(userId));
            console.log(`[DEBUG] Состояние атаки пользователя ${userId}:`, JSON.stringify(attackState));

            if (!attackState) {
                console.log(`[WARNING] У пользователя ${userId} нет активного состояния атаки.`);
                return ctx.answerCbQuery('❌ Это не ваше меню атаки. Состояние атаки не найдено.');
            }

            const expectedMessageId = attackState.message_id;
            const actualMessageId = ctx.callbackQuery?.message?.message_id;

            console.log(`[DEBUG] Ожидаемый Message ID: ${expectedMessageId} (тип: ${typeof expectedMessageId})`);
            console.log(`[DEBUG] Фактический Message ID: ${actualMessageId} (тип: ${typeof actualMessageId})`);

            if (!actualMessageId) {
                console.log(`[ERROR] Не удалось получить message_id из ctx.callbackQuery для пользователя ${userId}.`);
                return ctx.answerCbQuery('❌ Ошибка: Не удалось определить сообщение.');
            }

            if (actualMessageId !== expectedMessageId) {
                console.log(`[WARNING] Message ID не совпадает для пользователя ${userId}:`);
                console.log(`         Ожидаемый: ${expectedMessageId}, Фактический: ${actualMessageId}`);
                return ctx.answerCbQuery('❌ Это не ваше меню атаки. Message ID не совпадает.');
            }

            // Передаем контекст в функцию attackBoss для обработки результата
            await attackBoss(ctx);
            
        } catch (error) {
            console.error('Ошибка при обработке кнопки атаки:', error);
            await ctx.answerCbQuery('Произошла ошибка при обработке запроса.');
        }
    });
}

module.exports = {
    startNewBoss,
    bossHandler,
    attackBoss,
    sendBossGameInfo,
    generateMathKeyboard,
    handleAttackButton
};