const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Путь к файлу шрифта Garet Heavy
const garetFontPath = path.join(__dirname, '../fonts/ofont.ru_Garet.ttf'); // Предполагается, что шрифт находится в директории fonts

// Регистрация шрифта Garet Heavy
registerFont(garetFontPath, { family: 'Garet Heavy' });

// Путь к файлу шрифта Bungee Shade
const bungeeFontPath = path.join(__dirname, '../fonts/BungeeShade-Regular.ttf'); // Убедитесь, что файл существует

// Регистрация шрифта Bungee Shade
registerFont(bungeeFontPath, { family: 'Bungee Shade' });

// Создаем папку для хранения изображений результатов
const resultsDir = path.join(__dirname, 'results_images');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir); // Создаем папку, если её нет
}

// Путь к директории с кубиками
const diceImagesDir = path.join(__dirname, '../images'); // Измените путь, если директория другая

// Функция для загрузки PNG-файла кубика
async function loadDiceImage(diceValue) {
  const diceImagePath = path.join(diceImagesDir, `${diceValue}.png`);
  if (!fs.existsSync(diceImagePath)) {
    throw new Error(`Файл ${diceImagePath} не найден.`);
  }
  return await loadImage(diceImagePath);
}

// Функция для генерации изображения с результатами
async function generateDiceResultsImage(chatId, roundId, participants, results, totalBank) {
  try {
    // Определяем победителя
    let maxPoints = -Infinity;
    let winnerIndex = -1; // Индекс победителя (0-based)
    let rank = 0;

    for (const userId in participants) {
      const totalPoints = results[userId]?.totalPoints || 0;
      if (totalPoints > maxPoints) {
        maxPoints = totalPoints;
        winnerIndex = rank; // Сохраняем индекс победителя
      }
      rank++;
    }

    // Выбираем шаблон изображения в зависимости от индекса победителя
    const templatePath = path.join(__dirname, '../images', `results_template${winnerIndex + 1}.jpg`);
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
    ctx.font = 'bold 42px "Garet Heavy"'; // Шрифт Garet Heavy
    ctx.fillStyle = '#ffffff'; // Цвет текста (белый)
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
      if (!position) break; // Если больше 5 участников, пропускаем

      // Текст для текущего участника
      ctx.fillText(username, position.x, position.y);

      // Получаем результаты броска
      const dice1 = results[userId]?.dice1 || 0;
      const dice2 = results[userId]?.dice2 || 0;

      // Загружаем изображения кубиков
      const diceImage1 = await loadDiceImage(dice1);
      const diceImage2 = await loadDiceImage(dice2);

      // Наложение первого кубика
      const dicePosition1 = dicePositions[rank - 1];
      ctx.drawImage(diceImage1, dicePosition1.x, dicePosition1.y, 85, 85); // Размер кубика 90x90

      // Наложение второго кубика
      ctx.drawImage(diceImage2, dicePosition1.x + 113, dicePosition1.y, 85, 85); // Размер второго кубика 90x90

      rank++;
    }

    // Настройки текста для суммы банка (Bungee Shade)
    ctx.font = 'bold 64px "Bungee Shade"'; // Шрифт Bungee Shade для банка
    ctx.fillStyle = '#ffffff'; // Цвет текста (белый)

    // Вывод суммы банка
    const bankPosition = { x: 490, y: 696 }; // Позиция банка
    ctx.fillText(`${totalBank.toLocaleString('ru-RU')} PF`, bankPosition.x, bankPosition.y);

    // Создаем буфер для изображения
    const buffer = canvas.toBuffer('image/jpeg'); // Конвертируем canvas в буфер

    return buffer; // Возвращаем буфер вместо пути к файлу
  } catch (error) {
    console.error('Ошибка при создании изображения результатов:', error);
    throw error; // Пробрасываем ошибку
  }
}

// Экспортируем функцию
module.exports = { generateDiceResultsImage };