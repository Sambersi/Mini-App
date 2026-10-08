"use strict";
const { workerData, parentPort } = require('worker_threads');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Получаем данные из основного потока
const {
    participants,
    results,
    totalBank,
    diceImagesDir,
    fontsDir,
} = workerData;

// Регистрация шрифтов (должна происходить в контексте воркера)
const garetFontPath = path.join(fontsDir, 'ofont.ru_Garet.ttf');
const bungeeFontPath = path.join(fontsDir, 'BungeeShade-Regular.ttf');

if (fs.existsSync(garetFontPath)) {
    registerFont(garetFontPath, { family: 'Garet Heavy' });
}
if (fs.existsSync(bungeeFontPath)) {
    registerFont(bungeeFontPath, { family: 'Bungee Shade' });
}

// Функция для загрузки PNG-файла кубика
async function loadDiceImage(diceValue) {
    const diceImagePath = path.join(diceImagesDir, `${diceValue}.png`);
    if (!fs.existsSync(diceImagePath)) {
        throw new Error(`Файл ${diceImagePath} не найден.`);
    }
    return await loadImage(diceImagePath);
}

// Основная функция генерации (выполняется в отдельном потоке)
async function generateImage() {
    try {
        // Определяем победителя
        let maxPoints = -Infinity;
        let winnerIndex = -1;
        let rank = 0;
        for (const userId in participants) {
            const totalPoints = results[userId]?.totalPoints || 0;
            if (totalPoints > maxPoints) {
                maxPoints = totalPoints;
                winnerIndex = rank;
            }
            rank++;
        }

        // Выбираем шаблон изображения в зависимости от индекса победителя
        const templatePath = path.join(diceImagesDir, `results_template${winnerIndex + 1}.jpg`);
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Шаблон ${templatePath} не найден.`);
        }

        // Загружаем шаблон изображения
        const template = await loadImage(templatePath);

        // Создаем canvas с размерами 1080x1080
        const canvas = createCanvas(1080, 1080);
        const ctx = canvas.getContext('2d');

        // Рисуем шаблон на canvas
        ctx.drawImage(template, 0, 0, 1080, 1080);

        // Настройки текста для никнеймов (Garet Heavy)
        ctx.font = 'bold 42px "Garet Heavy"';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';

        // Позиции для никнеймов
        const nicknamesPositions = [
            { x: 230, y: 240 }, // 1 место
            { x: 230, y: 320 }, // 2 место
            { x: 230, y: 404 }, // 3 место
            { x: 230, y: 489 }, // 4 место
            { x: 230, y: 575 }, // 5 место
        ];

        // Позиции для кубиков
        const dicePositions = [
            { x: 738, y: 174 }, // 1 место
            { x: 738, y: 260 }, // 2 место
            { x: 738, y: 346 }, // 3 место
            { x: 738, y: 432 }, // 4 место
            { x: 738, y: 518 }, // 5 место
        ];

        // Вывод никнеймов и кубиков
        rank = 1;
        for (const userId in participants) {
            const username = participants[userId].username || 'Неизвестный';
            const position = nicknamesPositions[rank - 1];
            if (!position) break;

            ctx.fillText(username, position.x, position.y);

            const dice1 = results[userId]?.dice1 || 0;
            const dice2 = results[userId]?.dice2 || 0;

            const diceImage1 = await loadDiceImage(dice1);
            const diceImage2 = await loadDiceImage(dice2);

            const dicePosition1 = dicePositions[rank - 1];
            ctx.drawImage(diceImage1, dicePosition1.x, dicePosition1.y, 85, 85);
            ctx.drawImage(diceImage2, dicePosition1.x + 113, dicePosition1.y, 85, 85);

            rank++;
        }

        // Настройки текста для суммы банка (Bungee Shade)
        ctx.font = 'bold 64px "Bungee Shade"';
        ctx.fillStyle = '#ffffff';

        const bankPosition = { x: 490, y: 696 };
        ctx.fillText(`${totalBank.toLocaleString('ru-RU')} PF`, bankPosition.x, bankPosition.y);

        // Создаем буфер для изображения
        const buffer = canvas.toBuffer('image/jpeg');

        // Отправляем буфер обратно в основной поток
        parentPort.postMessage({
            success: true,
            buffer: buffer,
        });

    } catch (error) {
        // В случае ошибки отправляем сообщение об ошибке
        parentPort.postMessage({
            success: false,
            error: error.message,
        });
    }
}

// Запускаем генерацию
generateImage();