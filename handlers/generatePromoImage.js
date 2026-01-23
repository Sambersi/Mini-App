const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Путь к шаблону промокода
// const promoTemplatePath = path.join(__dirname, '../images/promo.png'); // Шаблон промокода
const promoTemplatePath = path.join(__dirname, '../images/promo3.jpg'); // Шаблон промокода

// Создаем папку для хранения изображений промокодов
const promoImagesDir = path.join(__dirname, '../promo_images');
if (!fs.existsSync(promoImagesDir)) {
  fs.mkdirSync(promoImagesDir); // Создаем папку, если её нет
}

// Объект для отображения типов призов
const prizeTypeDisplay = {
  container_type_3: 'GOLD-контейнер',
  balance: 'PF',
  df_balance: 'DF',
  npf_shares: 'NPF-акция',
};

// Функция для форматирования числа с разделителями
function formatNumberWithDots(number) {
  return number.toLocaleString('ru-RU'); // Используем локаль "ru-RU" для точек как разделителей
}

// Функция для создания изображения промокода
async function generatePromoImage(name, activations, prizeAmount, prizeType) {
  try {
    // Загружаем шаблон промокода
    const template = await loadImage(promoTemplatePath);

    // Создаем canvas с размерами шаблона (например, 1920x1080)
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');

    // Рисуем шаблон на canvas
    ctx.drawImage(template, 0, 0, 1920, 1080);

        // Настройки текста для названия промокода (жирный черный цвет)
    ctx.font = 'bold 88px "Arial", sans-serif'; // Добавляем 'bold' для жирного стиля
    ctx.fillStyle = '#000000'; // Цвет текста (черный)
    ctx.textAlign = 'center';
    ctx.fillText(name, 960, 610); // Позиция: центр по горизонтали, верхняя часть

    // Настройки текста для количества активаций (белый цвет)
    ctx.font = '36px "Arial", sans-serif'; // Шрифт и размер
    ctx.fillStyle = '#000000'; // Цвет текста (белый)
    ctx.textAlign = 'center';
    ctx.fillText(`${activations}`, 1410, 380); // Позиция: центр по горизонтали, средняя часть

    // Преобразуем тип приза в читаемое название
    const formattedPrizeType = prizeTypeDisplay[prizeType] || prizeType;

    // Форматируем сумму приза с разделителями
    const formattedPrizeAmount = formatNumberWithDots(prizeAmount);

    // Настройки текста для суммы приза и типа приза (белый цвет)
    ctx.font = '36px "Arial", sans-serif'; // Шрифт и размер
    ctx.fillStyle = '#000000'; // Цвет текста (белый)
    ctx.textAlign = 'center';
    ctx.fillText(`${formattedPrizeAmount} ${formattedPrizeType}`, 1050, 380); // Позиция: центр по горизонтали, нижняя часть

    // Сохраняем результат в файл
    // const outputPath = path.join(promoImagesDir, `${name}_promo.png`);
    const outputPath = path.join(promoImagesDir, `${name}_promo3.jpg`);
    // Удаляем старое изображение, если оно существует
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath); // Удаляем старый файл
      console.log(`Старое изображение промокода удалено: ${outputPath}`);
    }

    // Создаем новый файл с изображением промокода
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });

    console.log(`Изображение промокода успешно создано: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Ошибка при создании изображения промокода:', error);
    throw error; // Пробрасываем ошибку для обработки в вызывающем коде
  }
}

// Экспортируем функцию
module.exports = { generatePromoImage };