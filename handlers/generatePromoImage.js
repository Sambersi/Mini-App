// handlers/generatePromoImage.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Пути к шаблонам промокодов
const promoFatPath = path.join(__dirname, '../images/promo_fat.png');       // Для крупных призов
const promoDefaultPath = path.join(__dirname, '../images/promo_defoult.png'); // Для обычных призов

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
// ДОБАВЛЕН 5-й АРГУМЕНТ: forceTemplate (может быть 'fat', 'default' или null)
async function generatePromoImage(name, activations, prizeAmount, prizeType, forceTemplate = null) {
  try {
    // --- ЛОГИКА ВЫБОРА ШАБЛОНА ---
    let templatePath;
    
    // 1. ПРИНУДИТЕЛЬНЫЙ ВЫБОР (если передан из сессии)
    if (forceTemplate === 'fat') {
      templatePath = promoFatPath;
      console.log(`[PROMO IMG] Принудительно выбран жирный шаблон для ${name}`);
    } else if (forceTemplate === 'default') {
      templatePath = promoDefaultPath;
      console.log(`[PROMO IMG] Принудительно выбран обычный шаблон для ${name}`);
    } 
    // 2. АВТОМАТИЧЕСКИЙ ВЫБОР (если принудительного нет)
    else {
      // Условие: Золотые контейнеры ИЛИ PF >= 100,000
      if (prizeType === 'container_type_3' || (prizeType === 'balance' && prizeAmount >= 100000)) {
        templatePath = promoFatPath;
        console.log(`[PROMO IMG] Авто-выбор: жирный шаблон для ${prizeType}: ${prizeAmount}`);
      } else {
        templatePath = promoDefaultPath;
        console.log(`[PROMO IMG] Авто-выбор: обычный шаблон для ${prizeType}: ${prizeAmount}`);
      }
    }

    // Проверка существования файла шаблона перед загрузкой
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Шаблон промокода не найден по пути: ${templatePath}`);
    }

    // Загружаем выбранный шаблон
    const template = await loadImage(templatePath);

    // Создаем canvas с размерами шаблона
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext('2d');

    // Рисуем шаблон на canvas
    ctx.drawImage(template, 0, 0, template.width, template.height);

    // Настройки текста для названия промокода (жирный черный цвет)
    ctx.font = 'bold 88px "Arial", sans-serif';
    ctx.fillStyle = '#000000'; // Цвет текста (черный)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Центрирование по вертикали для точности
    // Позиция Y (581) может потребовать коррекции в зависимости от конкретного шаблона
    ctx.fillText(name, template.width / 2, 581); 

    // Настройки текста для количества активаций (черный цвет)
    ctx.font = 'bold 24px "Arial", sans-serif'; 
    ctx.fillStyle = '#000000'; 
    ctx.textAlign = 'center';
    ctx.fillText(`${formatNumberWithDots(activations)}`, 1377, 352); 

    // Преобразуем тип приза в читаемое название
    const formattedPrizeType = prizeTypeDisplay[prizeType] || prizeType;

    // Форматируем сумму приза с разделителями
    const formattedPrizeAmount = formatNumberWithDots(prizeAmount);

    // Настройки текста для суммы приза и типа приза
    ctx.font = 'bold 24px "Arial", sans-serif';
    ctx.fillStyle = '#000000'; 
    ctx.textAlign = 'center';
    ctx.fillText(`${formattedPrizeAmount} ${formattedPrizeType}`, 1038, 352); 

    // Сохраняем результат в файл
    const outputPath = path.join(promoImagesDir, `${name}_promo.png`);

    // Удаляем старое изображение, если оно существует
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log(`Старое изображение промокода удалено: ${outputPath}`);
    }

    // Создаем новый файл с изображением промокода
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream(); // Генерируем PNG поток
    stream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });

    console.log(`Изображение промокода успешно создано: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Ошибка при создании изображения промокода:', error);
    throw error;
  }
}

// Экспортируем функцию
module.exports = { generatePromoImage };