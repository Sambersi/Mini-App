//generateCard.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getUserById, getSelectedSkinFileName } = require('./db');

// Путь к шаблонам карт
const cardTemplatesDir = path.join(__dirname, 'images');

// Функция для создания изображения карты с текстом.
// Файл создаётся во временной папке ОС и ДОЛЖЕН быть удалён вызывающим кодом после отправки.
async function generateCardImage(userId, cardNumber) {
  let tmpPath = null;
  try {
    // Получаем данные пользователя
    const user = await getUserById(userId);
    if (!user) {
      throw new Error(`Пользователь ${userId} не найден`);
    }
    const username = user.username || `User${user.numeric_id}`; // Используем username из базы данных

    // Получаем имя файла активного скина пользователя
    let skinFileName = 'card.jpg'; // Дэфолтный скин
    const selectedSkinFileName = await getSelectedSkinFileName(userId);
    if (selectedSkinFileName && selectedSkinFileName !== 'card.jpg') {
      skinFileName = selectedSkinFileName; // Используем файл скина, если он существует
    } else {
      console.warn(`Скин для пользователя с ID ${userId} не найден. Используется дэфолтный скин.`);
    }

    // Проверяем, что skinFileName существует
    const templatePath = path.join(cardTemplatesDir, skinFileName);
    if (!fs.existsSync(templatePath)) {
      console.warn(`Скин "${skinFileName}" не найден. Используется дэфолтный скин.`);
      skinFileName = 'card.jpg'; // Используем дэфолтный скин
    }

    // Загружаем шаблон карты
    const finalTemplatePath = path.join(cardTemplatesDir, skinFileName);
    const template = await loadImage(finalTemplatePath);

    // Создаем canvas с размерами 1920x1080
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');

    // Рисуем шаблон на canvas
    ctx.drawImage(template, 0, 0, 1920, 1080);

    // Настройки текста для имени пользователя
    ctx.font = 'bold 60px "Courier New", monospace'; // Жирный моноширинный шрифт
    ctx.fillStyle = '#000000'; // Цвет текста имени пользователя
    ctx.textAlign = 'left';
    ctx.fillText(username, 415, 300); // Никнейм игрока

    // Настройки текста для номера карты
    ctx.font = 'bold 60px "Courier New", monospace';
    ctx.fillStyle = '#000000'; // Цвет текста номера карты
    ctx.fillText(cardNumber, 415, 1080 - 272); // Номер карты

    // Уникальный временный файл в системной temp-папке (не в проекте)
    tmpPath = path.join(os.tmpdir(), `card_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`);
    const out = fs.createWriteStream(tmpPath);
    const stream = canvas.createJPEGStream({
      quality: 0.95, // Качество JPEG
    });
    stream.pipe(out);
    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });
    return tmpPath;
  } catch (error) {
    // Если что-то упало после создания файла — убираем его за собой
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
    console.error('Ошибка при создании карты:', error);
    throw error; // Пробрасываем ошибку, чтобы её можно было обработать в основном файле
  }
}

// Экспортируем функции
module.exports = { generateCardImage };