"use strict";
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

// Путь к директории с изображениями кубиков и шаблонами
const diceImagesDir = path.join(__dirname, '../images');
const fontsDir = path.join(__dirname, '../fonts');

// Проверяем наличие необходимых шрифтов и папок
const resultsDir = path.join(__dirname, 'results_images');
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

/**
 * Генерирует изображение с результатами раунда в отдельном потоке (Worker Thread).
 * Это предотвращает блокировку основного Event Loop бота.
 * 
 * @param {string} chatId
 * @param {string} roundId
 * @param {Object} participants - объект { userId: { username, amount } }
 * @param {Object} results - объект { userId: { dice1, dice2, totalPoints } }
 * @param {number} totalBank
 * @returns {Promise<Buffer>} - буфер изображения в формате JPEG
 */
async function generateDiceResultsImage(chatId, roundId, participants, results, totalBank) {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, 'generateDiceResultsImage.worker.js');
        
        // Проверяем, что файл воркера существует
        if (!fs.existsSync(workerPath)) {
            return reject(new Error(`Файл воркера не найден: ${workerPath}`));
        }

        // Передаём данные в воркер
        const workerData = {
            participants,
            results,
            totalBank,
            diceImagesDir,
            fontsDir,
            resultsDir,
        };

        const worker = new Worker(workerPath, { workerData });

        let timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error('Таймаут генерации изображения (более 15 секунд)'));
        }, 15000); // 15 секунд максимум на генерацию

        worker.on('message', (message) => {
            clearTimeout(timeoutId);
            if (message.success) {
                resolve(Buffer.from(message.buffer));
            } else {
                reject(new Error(message.error || 'Неизвестная ошибка в воркере'));
            }
        });

        worker.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });

        worker.on('exit', (code) => {
            clearTimeout(timeoutId);
            if (code !== 0 && code !== null) {
                reject(new Error(`Воркер завершился с кодом ${code}`));
            }
        });
    });
}

module.exports = { generateDiceResultsImage };