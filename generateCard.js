//generateCard.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { getUserById, getSelectedSkinFileName } = require('./db');

// Путь к шаблонам карт
const cardTemplatesDir = path.join(__dirname, 'images');
const userCardsDir = path.join(__dirname, 'user_cards');

// Создаем папку для хранения карт пользователей
if (!fs.existsSync(userCardsDir)) {
  fs.mkdirSync(userCardsDir); // Создаем папку, если её нет
}

// Функция для создания изображения карты с текстом
async function generateCardImage(userId, cardNumber) {
  try {
    // Получаем данные пользователя
    let user = await getUserById(userId);
    if (!user) {
      // Если пользователь не найден, создаем нового
      createUser(userId, 'Press Эфыч');
      user = await getUserById(userId);
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
    ctx.fillText(username, 415, 300); // Никнейм игрока (слева 390px, сверху 270px)

    // Настройки текста для номера карты
    ctx.font = 'bold 60px "Courier New", monospace'; // Жирный моноширинный шрифт
    ctx.fillStyle = '#000000'; // Цвет текста номера карты
    ctx.fillText(cardNumber, 415, 1080 - 272); // Номер карты (слева 390px, снизу 266px)

    // Сохраняем результат в файл
    const outputPath = path.join(userCardsDir, `${username}_card.jpg`);

    // Удаляем старую карту, если она существует
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath); // Удаляем старый файл
      console.log(`Старая карта удалена: ${outputPath}`);
    }

    // Создаем новый файл с картой
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream({
      quality: 0.95, // Качество JPEG
    });
    stream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });

    console.log(`Карта успешно создана: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Ошибка при создании карты:', error);
    throw error; // Пробрасываем ошибку, чтобы её можно было обработать в основном файле
  }
}

// Экспортируем функции
module.exports = { generateCardImage };