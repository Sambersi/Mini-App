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
        const currentBoss = getCurrentBoss();
        if (!currentBoss) {
            return ctx.reply('❌ В данный момент активных боссов нет.');
        }

        const isBossAlive = currentBoss.phase === 1 ? currentBoss.phase1_hp > 0 : currentBoss.phase2_hp > 0;
        const userId = ctx.from.id.toString();
        const user = getUserById(userId);
        if (!user) return ctx.reply('Ошибка: пользователь не найден.');

        const activeWeapon = getActiveWeapon(userId);
        
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
        const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

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
        const validPrizeTypes = ['balance', 'coins', 'gold'];
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

        resetBossDamage();
        reduceAttackPowerBy90Percent();

        // ФИКСИРОВАННОЕ ИМЯ БОССА
        const bossName = 'Математика';

        console.log(`📝 <b>Данные для сохранения в базу данных:</b>
    ├ Название: ${bossName}
    ├ Файл изображения: ${imageFile}
    ├ HP: ${hp}
    ├ Тип приза: ${prizeType}
    ├ Количество приза: ${prizeAmount}`);

        const result = addNewBoss(bossName, imageFile, hp, prizeType, prizeAmount);
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
async function attackBoss(ctx) {
    try {
        const userId = ctx.from.id.toString();
        console.log(`[LOG] Пользователь ${userId} вызвал функцию attackBoss`);

        const lastAttackTime = getLastAttackTime(userId);
        const now = Date.now();
        if (lastAttackTime && now - lastAttackTime < 800) {
            const remainingCooldown = Math.ceil((800 - (now - lastAttackTime)) / 1000);
            if (ctx.callbackQuery) {
                return ctx.answerCbQuery(`⏳ Подождите еще ${remainingCooldown} сек. перед следующей атакой.`);
            } else {
                return await ctx.reply(`⏳ Подождите еще ${remainingCooldown} сек. перед следующей атакой.`);
            }
        }
        updateLastAttackTime(userId, now);

        const user = getUserById(userId);
        if (!user) return await ctx.reply('Ошибка: пользователь не найден.');
        const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

        const currentEnergy = getCurrentEnergy(userId);
        if (currentEnergy <= 0) {
            const energyInfo = getTimeUntilNextEnergyRestore(userId);
            if (!energyInfo) return await ctx.reply(`❌ ${userLink}, не удалось получить информацию о вашей энергии.`);

            const { currentEnergy: updatedEnergy, nextRestoreTime } = energyInfo;
            const now = Math.floor(Date.now() / 1000);
            const maxEnergy = getMaxEnergyByStatus(userId);

            if (updatedEnergy >= maxEnergy) {
                return await ctx.replyWithHTML(`⚡️ ${userLink}, ваша энергия максимально заполнена: <b>${updatedEnergy}/${maxEnergy}</b>`);
            }

            const timeLeft = Math.max(nextRestoreTime - now, 0);
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;

            return await ctx.replyWithHTML(
                `❌ ${userLink}, у вас недостаточно энергии для атаки.\nПодождите, пока она восстановится.\n\n` +
                `⚡️ Текущая энергия: <b>${updatedEnergy}/${maxEnergy}</b>\n` +
                `⏳ Пополнение энергии: <b>${minutes} мин ${seconds} сек</b>`,
                { reply_markup: Markup.inlineKeyboard([Markup.button.callback('↩️ Назад в меню', 'back_to_boss_handler')]) }
            );
        }

        const currentBoss = getCurrentBoss();
        if (!currentBoss) return await ctx.reply(`❌ В данный момент активных боссов нет.`);
        if (currentBoss.phase1_hp === 0 && currentBoss.phase2_hp === 0) return await ctx.reply(`⚠️ Босс уже повержен!`);

        // --- ЛОГИКА АТАКИ С МАТЕМАТИКОЙ ---
        if (!ctx.match || ctx.match[0] === 'attack_boss') {
            // --- ГЕНЕРАЦИЯ НОВОГО ПРИМЕРА ---
            const keyboardData = generateMathKeyboard(currentBoss.phase); // Генерируем новый пример
            
            // Создаем подробный лог для отладки
            console.log(`[DEBUG] Генерация нового примера для пользователя ${userId}:`);
            console.log(`[DEBUG]   Пример: ${keyboardData.example}`);
            console.log(`[DEBUG]   Правильный ответ: ${keyboardData.correctResult}`);
            console.log(`[DEBUG]   Все ответы:`, keyboardData.answers);
            console.log(`[DEBUG]   Кнопки:`);
            keyboardData.answers.forEach((answer, index) => {
                console.log(`[DEBUG]     Кнопка ${index}: ${answer} ${answer === keyboardData.correctResult ? '(ПРАВИЛЬНЫЙ)' : ''}`);
            });

            // --- Рассчитываем таймер на основе серии ---
            // Извлекаем текущую серию из состояния атаки (если есть)
            let currentStreak = 0;
            let timeLimit = INITIAL_TIME_LIMIT;
            const existingAttackState = getAttackState(userId);
            if (existingAttackState && existingAttackState.correct_button_index) {
                try {
                    const parsedState = JSON.parse(existingAttackState.correct_button_index);
                    currentStreak = parsedState.currentStreak || 0;
                } catch (e) {
                    console.error(`[ERROR] Не удалось распарсить существующее состояние для пользователя ${userId}:`, e);
                }
            }

            // Рассчитываем таймер на основе серии (исправленная логика)
            if (currentStreak > 0) {
                // Используем индекс в массиве TIME_REDUCTION_PER_STREAK
                // 1 серия -> индекс 1, 2 серии -> индекс 2 и т.д.
                const reductionIndex = Math.min(currentStreak, TIME_REDUCTION_PER_STREAK.length - 1);
                const reduction = TIME_REDUCTION_PER_STREAK[reductionIndex];
                timeLimit = Math.max(INITIAL_TIME_LIMIT - reduction, MIN_TIME_LIMIT);
            }

            // Получаем активное оружие и его прочность
            const activeWeapon = getActiveWeapon(userId);
            let currentDurability = 0;
            let durabilityMessage = '';
            if (activeWeapon) {
                if (activeWeapon.name === 'Кулак') {
                    durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ∞/∞`;
                } else {
                    currentDurability = getCurrentWeaponDurability(userId, activeWeapon.id);
                    durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ${Math.max(currentDurability, 0)}/${activeWeapon.durability}`;
                }
            }

            // Формируем начальное сообщение
            const initialMessage = `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                `┌───────────────┐\n` +
                `│   👩‍🏫 Решите пример:                 \n` +
                `│                                      \n` +
                `│        <b> ${keyboardData.example} = ?   </b>               \n` +
                `│ \n` +
                `│   ⏰ Время до обнуления серии: [${timeLimit}] секунд       \n` +
                `│   🔥 Серия правильных ответов: [${currentStreak}]                      \n` +
                `└───────────────┘\n` +
                `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp}\n` +
                `⚡️ Ваша энергия: ${currentEnergy}\n\n` +
                `${durabilityMessage}`;

            const message = await ctx.replyWithHTML(initialMessage, { reply_markup: { inline_keyboard: keyboardData.inline_keyboard } });

            // --- СОХРАНЯЕМ СОСТОЯНИЕ АТАКИ ---
            // Сохраняем все ответы и правильный ответ для последующей проверки, а также серию
            const attackStateData = {
                answers: keyboardData.answers,
                correctResult: keyboardData.correctResult,
                messageId: message.message_id,
                
                example: keyboardData.example,
                currentStreak: currentStreak, // Сохраняем текущую серию
                timeLimit: timeLimit, // Сохраняем текущий таймер
                createdAt: Date.now() // Время создания для таймера
            };
            
            // Конвертируем в JSON и сохраняем как строку (поскольку БД принимает только примитивные типы)
            saveAttackState(userId, JSON.stringify(attackStateData), message.message_id);
            console.log(`[LOG] Пользователь ${userId} создал новое меню атаки. Message ID: ${message.message_id}`);
            console.log(`[DEBUG] Сохраненные данные:`, attackStateData);

            // --- ЗАПУСК ТАЙМЕРА ДЛЯ ОБНОВЛЕНИЯ СООБЩЕНИЯ ---
            const timerKey = `${userId}_${message.message_id}`;
            // Очищаем предыдущий таймер, если он был
            if (activeTimers.has(timerKey)) {
                clearInterval(activeTimers.get(timerKey));
                activeTimers.delete(timerKey);
            }

            // Запускаем новый таймер
            const timerId = setInterval(async () => {
                try {
                    // Проверяем, существует ли ещё состояние атаки
                    const updatedAttackState = getAttackState(userId);
                    if (!updatedAttackState || updatedAttackState.message_id !== message.message_id) {
                        console.log(`[DEBUG] Состояние атаки для пользователя ${userId} больше не существует или message_id не совпадает. Останавливаем таймер.`);
                        clearInterval(timerId);
                        activeTimers.delete(timerKey);
                        return;
                    }

                    let updatedAttackStateData;
                    try {
                        updatedAttackStateData = JSON.parse(updatedAttackState.correct_button_index);
                    } catch (e) {
                        console.error(`[ERROR] Не удалось распарсить состояние для пользователя ${userId} в таймере:`, e);
                        clearInterval(timerId);
                        activeTimers.delete(timerKey);
                        return;
                    }

                    const timeElapsed = (Date.now() - updatedAttackStateData.createdAt) / 1000;
                    const timeLeft = updatedAttackStateData.timeLimit - timeElapsed;

                    if (timeLeft <= 0) {
                        // Время истекло
                        console.log(`[DEBUG] Время истекло для пользователя ${userId}.`);
                        clearInterval(timerId);
                        activeTimers.delete(timerKey);
                        
                        // Отправляем сообщение о том, что время истекло
                        ctx.answerCbQuery(`⏰ Время истекло! Серия сброшена.`);
                        // Удаляем старое сообщение и отправляем новое
                        try {
                            await ctx.deleteMessage(message.message_id);
                        } catch (deleteError) {
                            console.error(`[ERROR] Не удалось удалить сообщение ${message.message_id} для пользователя ${userId}:`, deleteError);
                        }
                        
                        // Генерируем новое сообщение с примером
                        const newKeyboardData = generateMathKeyboard(currentBoss.phase);
                        let newCurrentStreak = 0; // Сбрасываем серию
                        let newTimeLimit = INITIAL_TIME_LIMIT;
                        
                        const newActiveWeapon = getActiveWeapon(userId);
                        let newCurrentDurability = 0;
                        let newDurabilityMessage = '';
                        if (newActiveWeapon) {
                            if (newActiveWeapon.name === 'Кулак') {
                                newDurabilityMessage = `🔧 Прочность вашего оружия ${newActiveWeapon.name}: ∞/∞`;
                            } else {
                                newCurrentDurability = getCurrentWeaponDurability(userId, newActiveWeapon.id);
                                newDurabilityMessage = `🔧 Прочность вашего оружия ${newActiveWeapon.name}: ${Math.max(newCurrentDurability, 0)}/${newActiveWeapon.durability}`;
                            }
                        }
                        
                        const newMessageText = `⏰ ${userLink}, время истекло! Серия сброшена.\n\n` +
                            `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                            `┌───────────────┐\n` +
                            `│   👩‍🏫 Решите пример:                 \n` +
                            `│                                      \n` +
                            `│         <b>${newKeyboardData.example} = ? </b>                \n` +
                            `│ \n` +
                            `│   ⏰ Время до обнуления серии: [${newTimeLimit}] секунд       \n` +
                            `│   🔥 Серия правильных ответов: [${newCurrentStreak}]                      \n` +
                            `└───────────────┘\n` +
                            `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp}\n` +
                            `⚡️ Ваша энергия: ${currentEnergy - 1}\n\n` +
                            `${newDurabilityMessage}`;
                        
                        const newMessage = await ctx.replyWithHTML(newMessageText, { reply_markup: { inline_keyboard: newKeyboardData.inline_keyboard } });
                        
                        // Сохраняем новое состояние
                        const newAttackStateData = {
                            answers: newKeyboardData.answers,
                            correctResult: newKeyboardData.correctResult,
                            messageId: newMessage.message_id,
                            example: newKeyboardData.example,
                            currentStreak: newCurrentStreak,
                            timeLimit: newTimeLimit,
                            createdAt: Date.now()
                        };
                        saveAttackState(userId, JSON.stringify(newAttackStateData), newMessage.message_id);
                        
                    } else {
                        // Обновляем сообщение с новым временем
                        const timeValue = Math.ceil(timeLeft);
                        
                        let durabilityMessage = '';
                        const activeWeapon = getActiveWeapon(userId);
                        if (activeWeapon) {
                            if (activeWeapon.name === 'Кулак') {
                                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ∞/∞`;
                            } else {
                                const currentDurability = getCurrentWeaponDurability(userId, activeWeapon.id);
                                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ${Math.max(currentDurability, 0)}/${activeWeapon.durability}`;
                            }
                        }
                        
                        const updatedMessageText = `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                            `┌───────────────┐\n` +
                            `│   👩‍🏫 Решите пример:                 \n` +
                            `│                                      \n` +
                            `│        <b> ${updatedAttackStateData.example} = ?   </b>               \n` +
                            `│ \n` +
                            `│   ⏰ Время до обнуления серии: [${timeValue}] секунд       \n` +
                            `│   🔥 Серия правильных ответов: [${updatedAttackStateData.currentStreak}]                      \n` +
                            `└───────────────┘\n` +
                            `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp}\n` +
                            `⚡️ Ваша энергия: ${currentEnergy}\n\n` +
                            `${durabilityMessage}`;

                        try {
                            await ctx.editMessageText(updatedMessageText, {
                                parse_mode: 'HTML',
                                reply_markup: { inline_keyboard: generateMathKeyboard(currentBoss.phase).inline_keyboard }
                            });
                        } catch (editError) {
                            if (editError.response && editError.response.error_code === 429) {
                                console.error(`[ERROR 429] Слишком много запросов для пользователя ${userId}, message_id ${message.message_id}. Повтор через ${editError.response.parameters.retry_after} секунд.`);
                                // Можно добавить логику повтора здесь, если нужно
                            } else {
                                console.error(`[ERROR] Не удалось обновить сообщение для пользователя ${userId}, message_id ${message.message_id}:`, editError);
                            }
                            // Останавливаем таймер при ошибке редактирования
                            clearInterval(timerId);
                            activeTimers.delete(timerKey);
                        }
                    }

                } catch (timerError) {
                    console.error(`[ERROR] Ошибка в таймере для пользователя ${userId}:`, timerError);
                    // Останавливаем таймер при ошибке
                    clearInterval(timerId);
                    activeTimers.delete(timerKey);
                }
            }, TIMER_UPDATE_INTERVAL);

            // Сохраняем ID таймера
            activeTimers.set(timerKey, timerId);

            return;
        }

        // --- ОБРАБОТКА ВЫБОРА ОТВЕТА ---
        const selectedButtonIndex = parseInt(ctx.match[1], 10);
        const attackState = getAttackState(userId);

        if (!attackState || ctx.callbackQuery.message.message_id !== attackState.message_id) {
            console.log(`[WARNING] Пользователь ${userId} попытался использовать чужое меню атаки:` +
                `\n├ Текущий Message ID: ${ctx.callbackQuery.message.message_id}` +
                `\n├ Ожидаемый Message ID: ${attackState?.message_id || 'не найден'}` +
                `\n└ Состояние атаки: ${JSON.stringify(attackState)}`);
            return ctx.answerCbQuery('❌ Это не ваше меню атаки.');
        }

        // --- ИЗВЛЕКАЕМ ДАННЫЕ ИЗ СОСТОЯНИЯ ---
        let attackStateData;
        try {
            attackStateData = JSON.parse(attackState.correct_button_index); // correct_button_index содержит JSON
        } catch (e) {
            console.error(`[ERROR] Не удалось распарсить данные состояния для пользователя ${userId}:`, attackState.correct_button_index);
            return ctx.answerCbQuery('❌ Ошибка: Некорректные данные состояния.');
        }

        const answers = attackStateData.answers;
        const correctResult = attackStateData.correctResult;
        const example = attackStateData.example;
        let currentStreak = attackStateData.currentStreak || 0;
        const timeLimit = attackStateData.timeLimit || INITIAL_TIME_LIMIT;
        const createdAt = attackStateData.createdAt || Date.now();
        const originalMessageId = attackStateData.messageId;

        console.log(`[DEBUG] Восстановленные данные состояния для пользователя ${userId}:`);
        console.log(`[DEBUG]   Все ответы:`, answers);
        console.log(`[DEBUG]   Правильный ответ: ${correctResult}`);
        console.log(`[DEBUG]   Пример: ${example}`);
        console.log(`[DEBUG]   Текущая серия: ${currentStreak}`);
        console.log(`[DEBUG]   Таймер: ${timeLimit} секунд`);
        console.log(`[DEBUG]   Создано: ${new Date(createdAt).toISOString()}`);

        // --- ПРОВЕРКА ТАЙМЕРА ---
        const timeElapsed = (Date.now() - createdAt) / 1000; // Время в секундах
        const isTimeExpired = timeElapsed > timeLimit;

        if (isTimeExpired) {
            console.log(`[DEBUG] Время истекло для пользователя ${userId}. Потрачено: ${timeElapsed.toFixed(2)} секунд из ${timeLimit} секунд.`);
            // Сбрасываем серию при истечении времени
            currentStreak = 0;
            // Отправляем сообщение о том, что время истекло
            ctx.answerCbQuery(`⏰ Время истекло! Серия сброшена.`);
        }

        // --- ПОЛУЧАЕМ ТЕКСТ НАЖАТОЙ КНОПКИ И СРАВНИВАЕМ ---
        if (selectedButtonIndex >= answers.length) {
            console.log(`[ERROR] Пользователь ${userId} нажал на несуществующую кнопку с индексом ${selectedButtonIndex}. Доступные кнопки: ${answers.length}`);
            return ctx.answerCbQuery('❌ Ошибка: Несуществующая кнопка.');
        }

        const selectedAnswerText = answers[selectedButtonIndex];
        const isCorrect = parseInt(selectedAnswerText) === correctResult;
        
        // Подробное логирование проверки
        console.log(`[DEBUG] Проверка ответа для пользователя ${userId}:`);
        console.log(`[DEBUG]   Нажата кнопка с индексом: ${selectedButtonIndex}`);
        console.log(`[DEBUG]   Текст на нажатой кнопке: "${selectedAnswerText}"`);
        console.log(`[DEBUG]   Правильный ответ: ${correctResult}`);
        console.log(`[DEBUG]   Результат проверки: ${parseInt(selectedAnswerText)} === ${correctResult} -> ${isCorrect}`);
        console.log(`[DEBUG]   Пример: ${example}`);

        reduceUserEnergy(userId);
        const activeWeapon = getActiveWeapon(userId);
        if (!activeWeapon) return await ctx.reply(`❌ ${userLink}, ошибка: Активное оружие не найдено.`);

        let damage = 0;
        let newHp = 0;
        let streakBonusMessage = ''; // Сообщение о бонусе за серию
        let damageReductionMessage = ''; // Сообщение о пониженном уроне

        if (isCorrect) {
            // --- РАСЧЁТ УРОНА ---
            let baseDamage = 0;
            if (activeWeapon.name === 'Кулак') {
                const attackPower = getUserAttackPower(userId);
                baseDamage = activeWeapon.base_damage * attackPower;
            } else {
                baseDamage = activeWeapon.base_damage;
            }

            // --- ПРИМЕНЕНИЕ МОДИФИКАТОРОВ УРОНА ---
            let finalDamage = baseDamage;

            // 1. Проверка на старое оружие
            const isOldWeapon = !['Кулак', ...NEW_WEAPONS].includes(activeWeapon.name);
            if (isOldWeapon) {
                finalDamage = Math.floor(finalDamage * OLD_WEAPON_DAMAGE_MULTIPLIER);
                damageReductionMessage = ' (Пониженный урон)';
                console.log(`[DEBUG] Старое оружие (${activeWeapon.name}), урон снижен до ${finalDamage}`);
            }

            // 2. Проверка на серию правильных ответов
            currentStreak++;
            if (currentStreak >= STREAK_THRESHOLD) {
                finalDamage = Math.floor(finalDamage * STREAK_BONUS_MULTIPLIER);
                streakBonusMessage = `🎁🎁🎁 🔥 КОМБО АТАКА! 🔥 🎁🎁🎁\n\n`;
                // Сбрасываем серию после получения бонуса
                currentStreak = 0;
                console.log(`[DEBUG] Получен бонус за серию для пользователя ${userId}. Урон: ${finalDamage}`);
            }

            // --- НАНЕСЕНИЕ УРОНА ---
            const currentHp = currentBoss.phase === 1 ? currentBoss.phase1_hp : currentBoss.phase2_hp;
            const actualDamage = Math.min(finalDamage, currentHp);
            newHp = Math.max(currentHp - actualDamage, 0);
            updateBossState(currentBoss.id, newHp, currentBoss.phase);
            addBossDamageToUser(userId, actualDamage);

            damage = actualDamage;
            
            // Если это была последняя атака, сбрасываем серию
            if (newHp === 0) {
                currentStreak = 0;
            }
            
        } else {
            // При ошибке сбрасываем серию
            currentStreak = 0;
        }

        // --- ГЕНЕРАЦИЯ НОВОГО ПРИМЕРА ДЛЯ СЛЕДУЮЩЕЙ АТАКИ ---
        const newKeyboardData = generateMathKeyboard(currentBoss.phase); // Генерируем новый пример
        const newKeyboard = { inline_keyboard: newKeyboardData.inline_keyboard };
        
        // Рассчитываем новый таймер на основе новой серии (исправленная логика)
        let newTimeLimit = INITIAL_TIME_LIMIT;
        if (currentStreak > 0) {
            const reductionIndex = Math.min(currentStreak, TIME_REDUCTION_PER_STREAK.length - 1);
            const reduction = TIME_REDUCTION_PER_STREAK[reductionIndex];
            newTimeLimit = Math.max(INITIAL_TIME_LIMIT - reduction, MIN_TIME_LIMIT);
        }

        // --- ОБНОВЛЕНИЕ СОСТОЯНИЯ АТАКИ ---
        const newAttackStateData = {
            answers: newKeyboardData.answers,
            correctResult: newKeyboardData.correctResult,
            messageId: null, // Будет установлено позже
            example: newKeyboardData.example,
            currentStreak: currentStreak, // Сохраняем обновлённую серию
            timeLimit: newTimeLimit, // Сохраняем новый таймер
            createdAt: Date.now() // Время создания для нового таймера
        };
        
        // --- ОБРАБОТКА РЕЗУЛЬТАТА ---
        if (isCorrect) {
            // --- УСПЕШНАЯ АТАКА ---
            let successMessage = '';
            if (streakBonusMessage) {
                // Если есть бонус за серию, не показываем сообщение о пониженном уроне
                successMessage = `${streakBonusMessage}⚔️ ${userLink}, вы успешно решили пример и нанесли ${damage} урона боссу с помощью ${activeWeapon.name}! \n💥Урон увеличен в ${STREAK_BONUS_MULTIPLIER} раза!💥\n\n`;
            } else {
                // Если нет бонуса за серию, показываем сообщение о пониженном уроне (если применимо)
                successMessage = `⚔️ ${userLink}, вы успешно решили пример и нанесли ${damage} урона боссу с помощью ${activeWeapon.name}${damageReductionMessage}!\n\n`;
            }

            // Формируем постоянную часть сообщения (о прочности)
            const currentDurability = getCurrentWeaponDurability(userId, activeWeapon.id);
            let durabilityMessage = '';
            if (activeWeapon.name === 'Кулак') {
                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ∞/∞`;
            } else {
                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ${Math.max(currentDurability, 0)}/${activeWeapon.durability}`;
            }

            // Формируем сообщение с новым примером
            const newExampleMessage = `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                `┏━━━━━━━━━━━━┓\n` +
                `┃   👩‍🏫 Решите пример:                 \n` +
                `┃                                      \n` +
                `┃         <b>${newKeyboardData.example} = ?   </b>              \n` +
                `┃ \n` +
                `┃   ⏰ Время до обнуления серии: [${newTimeLimit}] секунд       \n` +
                `┃   🔥 Серия правильных ответов: [${currentStreak}]                      \n` +
                `┗━━━━━━━━━━━━┛\n` +
                `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? (newHp || currentBoss.phase1_hp) : (newHp || currentBoss.phase2_hp)}\n` +
                `⚡️ Ваша энергия: ${currentEnergy - 1}\n\n` +
                `${durabilityMessage}`;

            const fullSuccessMessage = `${successMessage}${newExampleMessage}`;

            // Удаляем старое сообщение
            try {
                await ctx.deleteMessage(originalMessageId);
            } catch (deleteError) {
                console.error(`[ERROR] Не удалось удалить сообщение ${originalMessageId} для пользователя ${userId}:`, deleteError);
            }

            // Отправляем новое сообщение с результатом и новым примером
            const newMessage = await ctx.replyWithHTML(fullSuccessMessage, { reply_markup: newKeyboard });
            newAttackStateData.messageId = newMessage.message_id;
            saveAttackState(userId, JSON.stringify(newAttackStateData), newMessage.message_id);
            console.log(`[LOG] Пользователь ${userId} обновил состояние атаки. Новый Message ID: ${newMessage.message_id}`);
            console.log(`[DEBUG] Новые сохраненные данные:`, newAttackStateData);

            if (currentBoss.phase === 1 && newHp === 0) {
                transitionToPhase2(currentBoss.id);
                await ctx.reply(`👾 Босс переходит во вторую фазу!`);
                const usersWithDamage = getUsersWithDamage();
                for (const user of usersWithDamage) {
                    try {
                        await ctx.telegram.sendMessage(user.user_id, `👾 Босс перешёл во вторую фазу! Готовьтесь к сложной битве!`, { parse_mode: 'HTML' });
                    } catch (error) { console.error(`Ошибка при отправке рассылки пользователю ${user.user_id}:`, error); }
                }
            }

            if (currentBoss.phase === 2 && newHp === 0) {
                await ctx.reply(`🎉 Босс побежден!`);
                const prizeDistributionReport = await distributePrizesToTopPlayers(ctx, currentBoss, currentBoss.prize_amount);
                const MAIN_ADMIN = process.env.MAIN_ADMIN;
                if (MAIN_ADMIN) {
                    try {
                        await ctx.telegram.sendMessage(MAIN_ADMIN, prizeDistributionReport, { parse_mode: 'HTML' });
                    } catch (error) { console.error(`Ошибка при отправке отчета администратору:`, error); }
                }
                const usersWithDamage = getUsersWithDamage();
                for (const user of usersWithDamage) {
                    try {
                        await ctx.telegram.sendMessage(user.user_id, `🎉 Босс повержен! Спасибо за участие в битве!`, { parse_mode: 'HTML' });
                    } catch (error) { console.error(`Ошибка при отправке рассылки пользователю ${user.user_id}:`, error); }
                }
                deleteAttackState(userId); // Удаляем состояние после победы
            }
        } else {
            // --- ОШИБКА В АТАКЕ ИЛИ ИСТЕЧЕНИЕ ВРЕМЕНИ ---
            const currentDurability = getCurrentWeaponDurability(userId, activeWeapon.id);
            const durabilityLoss = 1;
            reduceWeaponDurability(userId, activeWeapon.id, durabilityLoss);
            const updatedDurability = currentDurability - durabilityLoss;

            let durabilityMessage = '';
            if (activeWeapon.name === 'Кулак') {
                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ∞/∞`;
            } else {
                durabilityMessage = `🔧 Прочность вашего оружия ${activeWeapon.name}: ${Math.max(updatedDurability, 0)}/${activeWeapon.durability}`;
            }

            let errorMessage = '';
            if (isTimeExpired) {
                errorMessage = `⏰ ${userLink}, время истекло! Серия сброшена.\n\n`;
            } else {
                errorMessage = `❌ ${userLink}, вы ошиблись в решении примера! \n\n🔏Правильный ответ был [${correctResult}]. Энергия потрачена, но урон не засчитан.\n\n`;
            }

            // Формируем сообщение с новым примером
            const newExampleMessage = `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                `┌───────────────┐\n` +
                `│   👩‍🏫 Решите пример:                 \n` +
                `│                                      \n` +
                `│         <b>${newKeyboardData.example} = ? </b>                 \n` +
                `│ \n` +
                `│   ⏰ Время до обнуления серии: [${newTimeLimit}] секунд       \n` +
                `│   🔥 Серия правильных ответов: [${currentStreak}]                      \n` +
                `└───────────────┘\n` +
                `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? (newHp || currentBoss.phase1_hp) : (newHp || currentBoss.phase2_hp)}\n` +
                `⚡️ Ваша энергия: ${currentEnergy - 1}\n\n` +
                `${durabilityMessage}`;

            const fullErrorMessage = `${errorMessage}${newExampleMessage}`;

            if (updatedDurability <= 0 && activeWeapon.name !== 'Кулак') {
                console.log(`[DEBUG] Оружие сломалось. Вызываем removeBrokenWeapon и switchToDefaultWeapon.`);
                removeBrokenWeapon(userId, activeWeapon.id);
                switchToDefaultWeapon(userId);

                const brokenWeaponMessage = `❌ ${userLink}, вы ошиблись в решении примера! \n\n` +
                    `🔏Правильный ответ был [${correctResult}]. Ваше оружие ${activeWeapon.name} сломалось, вы можете снова приобрести её в магазине.\n\n` +
                    `⛓️‍💥 Прочность вашего нового оружия Кулак: ∞/∞\n\n` +
                    `✍🏻 Решите новый пример, чтобы атаковать босса:\n` +
                    `┌───────────────┐\n` +
                    `│   👩‍🏫 Решите пример:                 \n` +
                    `│                                      \n` +
                    `│         <b>${newKeyboardData.example} = ?</b>                  \n` +
                    `│ \n` +
                    `│   ⏰ Время до обнуления серии: [${newTimeLimit}] секунд       \n` +
                    `│   🔥 Серия правильных ответов: [${currentStreak}]                      \n` +
                    `└───────────────┘\n` +
                    `♥️ Оставшееся HP босса: ${currentBoss.phase === 1 ? (newHp || currentBoss.phase1_hp) : (newHp || currentBoss.phase2_hp)}\n` +
                    `⚡️ Ваша энергия: ${currentEnergy - 1}\n\n` +
                    `🔧 Прочность вашего оружия Кулак: ∞/∞`;

                // Удаляем старое сообщение
                try {
                    await ctx.deleteMessage(originalMessageId);
                } catch (deleteError) {
                    console.error(`[ERROR] Не удалось удалить сообщение ${originalMessageId} для пользователя ${userId}:`, deleteError);
                }

                // Отправляем новое сообщение о сломанном оружии и новом примере
                const newMessage = await ctx.replyWithHTML(brokenWeaponMessage, { reply_markup: newKeyboard });
                newAttackStateData.messageId = newMessage.message_id;
                // Для сломанного оружия сохраняем состояние с Кулаком
                newAttackStateData.currentStreak = 0; // Сбрасываем серию
                saveAttackState(userId, JSON.stringify(newAttackStateData), newMessage.message_id);
                console.log(`[LOG] Пользователь ${userId} обновил состояние атаки (оружие сломано). Новый Message ID: ${newMessage.message_id}`);
                return;
            }

            // Удаляем старое сообщение
            try {
                await ctx.deleteMessage(originalMessageId);
            } catch (deleteError) {
                console.error(`[ERROR] Не удалось удалить сообщение ${originalMessageId} для пользователя ${userId}:`, deleteError);
            }

            // Отправляем новое сообщение с ошибкой и новым примером
            const newMessage = await ctx.replyWithHTML(fullErrorMessage, { reply_markup: newKeyboard });
            newAttackStateData.messageId = newMessage.message_id;
            saveAttackState(userId, JSON.stringify(newAttackStateData), newMessage.message_id);
            console.log(`[LOG] Пользователь ${userId} обновил состояние атаки (ошибка). Новый Message ID: ${newMessage.message_id}`);
        }
        
        // --- КОНЕЦ ЛОГИКИ АТАКИ ---
    } catch (error) {
        console.error('Ошибка при атаке босса:', error);
        // Проверяем, является ли ошибка 429
        if (error.response && error.response.error_code === 429) {
            console.error(`[ERROR 429] Слишком много запросов:`, error.response.description);
            await ctx.answerCbQuery(`⏳ Слишком много запросов. Попробуйте позже.`);
        } else {
            await ctx.reply('Произошла ошибка при атаке босса.');
        }
    }
}
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
            let attackState = getAttackState(userId);
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