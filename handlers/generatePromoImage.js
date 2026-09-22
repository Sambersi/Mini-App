// handlers/generatePromoImage.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Пути к шаблонам промокодов
const promoFatPath = path.join(__dirname, '../images/promo_fat.png');
const promoDefaultPath = path.join(__dirname, '../images/promo_defoult.png');
const promoFatTimePath = path.join(__dirname, '../images/promo_fat_time.png');
const promoDefaultTimePath = path.join(__dirname, '../images/promo_defoult_time.png');

// Папка для сохранения
const promoImagesDir = path.join(__dirname, '../promo_images');
if (!fs.existsSync(promoImagesDir)) {
  fs.mkdirSync(promoImagesDir);
}

const prizeTypeDisplay = {
  container_type_3: 'GOLD-контейнер',
  balance: 'PF',
  df_balance: 'DF',
  npf_shares: 'NPF-акция',
};

// ============================================================
// 1. КООРДИНАТЫ ДЛЯ ОБЫЧНОГО ШАБЛОНА (Твои настройки)
// ============================================================
const TEXT_COORDS_DEFAULT = {
  name: {
    x: null, y: 580, // null = центр по горизонтали
    font: 'bold 80px "Arial", sans-serif',
    fontSmall: 'bold 60px "Arial", sans-serif',
    smallIfLongerThan: 15,
  },
  prize: {
    x: 1042, y: 350,
    font: 'bold 32px "Arial", sans-serif',
  },
  right: {
    // Для обычного шаблона right - это просто число активаций
    x: 1385, y: 350,
    font: 'bold 32px "Arial", sans-serif',
  },
};

// ============================================================
// 2. КООРДИНАТЫ ДЛЯ ВРЕМЕННОГО ШАБЛОНА (Новая логика)
// ============================================================
const TEXT_COORDS_TIME = {
  name: {
    x: null, y: 580, // Можно изменить Y, если на тайм-шаблоне плашка ниже/выше
    font: 'bold 80px "Arial", sans-serif',
    fontSmall: 'bold 60px "Arial", sans-serif',
    smallIfLongerThan: 15,
  },
  prize: {
    x: 1042, y: 358, // Координаты приза (обычно совпадают или чуть сдвинуты)
    font: 'bold 32px "Arial", sans-serif',
  },
  // Настройки для времени (HH:MM)
  timeSettings: {
    font: 'bold 45px "Courier New", monospace', // Шрифт для цифр времени
    color: '#000000',
  },
  // КООРДИНАТЫ КАЖДОЙ ЦИФРЫ И ДВОЕТОЧИЯ
  // Здесь ты можешь двигать каждую цифру независимо (x, y)
  timeDigits: {
    h1: { x: 1274, y: 360 }, // Первая цифра часа
    h2: { x: 1333, y: 360 }, // Вторая цифра часа
    m1: { x: 1395, y: 360 }, // Первая цифра минут
    m2: { x: 1450, y: 360 }, // Вторая цифра минут
  }
};

// Функция форматирования числа
function formatNumberWithDots(number) {
  return number.toLocaleString('ru-RU');
}

// Выбор пути к шаблону
function resolveTemplatePath(forceTemplate, isTimeBased, prizeType, prizeAmount) {
  if (forceTemplate) {
    switch (forceTemplate) {
      case 'fat': return promoFatPath;
      case 'default': return promoDefaultPath;
      case 'fat_time': return promoFatTimePath;
      case 'default_time': return promoDefaultTimePath;
      default: return isTimeBased ? promoDefaultTimePath : promoDefaultPath;
    }
  }
  if (isTimeBased) {
    if (prizeType === 'container_type_3' || (prizeType === 'balance' && prizeAmount >= 100000)) return promoFatTimePath;
    return promoDefaultTimePath;
  }
  if (prizeType === 'container_type_3' || (prizeType === 'balance' && prizeAmount >= 100000)) return promoFatPath;
  return promoDefaultPath;
}

async function saveCanvas(canvas, outputPath) {
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  return outputPath;
}

// Отрисовка прицелов (Guides) для теста
function drawGuides(ctx, templateWidth, isTimeBased) {
  // Выбираем активный конфиг координат
  const coords = isTimeBased ? TEXT_COORDS_TIME : TEXT_COORDS_DEFAULT;
  
  const points = [
    { key: 'name', x: coords.name.x === null ? Math.floor(templateWidth / 2) : coords.name.x, y: coords.name.y },
    { key: 'prize', x: coords.prize.x, y: coords.prize.y },
  ];

  // Если это временной шаблон, добавляем точки для каждой цифры времени
  if (isTimeBased && coords.timeDigits) {
    Object.entries(coords.timeDigits).forEach(([key, pos]) => {
      points.push({ key: `time_${key}`, x: pos.x, y: pos.y });
    });
  } else if (!isTimeBased) {
    // Для обычного - точка количества активаций
    points.push({ key: 'right', x: coords.right.x, y: coords.right.y });
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
  ctx.lineWidth = 2;
  ctx.font = 'bold 20px "Arial", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const p of points) {
    // Перекрестие
    ctx.beginPath();
    ctx.moveTo(p.x - 30, p.y); ctx.lineTo(p.x + 30, p.y);
    ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.x, p.y + 30);
    ctx.stroke();
    
    // Круг
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    // Подпись
    const label = `${p.key}: ${p.x},${p.y}`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(p.x + 10, p.y - 25, tw + 6, 22);
    ctx.fillStyle = 'red';
    ctx.fillText(label, p.x + 13, p.y - 22);
  }
  ctx.restore();
}

// Основная функция отрисовки
async function drawPromoImage({ name, value, prizeAmount, prizeType, forceTemplate = null, isTimeBased = false, guides = false, outputPath }) {
  const templatePath = resolveTemplatePath(forceTemplate, isTimeBased, prizeType, prizeAmount);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Шаблон не найден: ${templatePath}`);
  }

  const template = await loadImage(templatePath);
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  // Фон
  ctx.drawImage(template, 0, 0, template.width, template.height);

  // Выбираем конфиг координат в зависимости от типа
  const COORDS = isTimeBased ? TEXT_COORDS_TIME : TEXT_COORDS_DEFAULT;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';

  // --- 1. НАЗВАНИЕ ---
  ctx.font = name.length > COORDS.name.smallIfLongerThan ? COORDS.name.fontSmall : COORDS.name.font;
  const nameX = COORDS.name.x === null ? template.width / 2 : COORDS.name.x;
  ctx.fillText(name, nameX, COORDS.name.y);

  // --- 2. ПРИЗ ---
  const formattedPrizeType = prizeTypeDisplay[prizeType] || prizeType;
  const prizeText = `${formatNumberWithDots(prizeAmount)} ${formattedPrizeType}`;
  ctx.font = COORDS.prize.font;
  ctx.fillText(prizeText, COORDS.prize.x, COORDS.prize.y);

  // --- 3. ПРАВАЯ ЧАСТЬ (Время или Активации) ---
  if (isTimeBased) {
    // ЛОГИКА ДЛЯ ВРЕМЕНИ (ПОЦИФРОВО)
    const totalMinutes = value;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const hStr = hours.toString().padStart(2, '0');
    const mStr = minutes.toString().padStart(2, '0');
    
    // Применяем шрифт для времени
    ctx.font = COORDS.timeSettings.font;
    ctx.fillStyle = COORDS.timeSettings.color;

    // Рисуем каждую цифру в её координатах
    if (COORDS.timeDigits) {
      ctx.fillText(hStr[0], COORDS.timeDigits.h1.x, COORDS.timeDigits.h1.y);
      ctx.fillText(hStr[1], COORDS.timeDigits.h2.x, COORDS.timeDigits.h2.y);
      ctx.fillText(mStr[0], COORDS.timeDigits.m1.x, COORDS.timeDigits.m1.y);
      ctx.fillText(mStr[1], COORDS.timeDigits.m2.x, COORDS.timeDigits.m2.y);
    }
  } else {
    // ЛОГИКА ДЛЯ ОБЫЧНОГО (число активаций)
    const rightText = formatNumberWithDots(value);
    ctx.font = COORDS.right.font;
    ctx.fillText(rightText, COORDS.right.x, COORDS.right.y);
  }

  // --- 4. ПРИЦЕЛЫ (TEST MODE) ---
  if (guides) {
    drawGuides(ctx, template.width, isTimeBased);
  }

  await saveCanvas(canvas, outputPath);
  return outputPath;
}

/**
 * Генерация изображения промокода
 */
async function generatePromoImage(name, value, prizeAmount, prizeType, forceTemplate = null, isTimeBased = false) {
  try {
    const outputPath = path.join(promoImagesDir, `${name}_promo.png`);
    await drawPromoImage({ name, value, prizeAmount, prizeType, forceTemplate, isTimeBased, guides: false, outputPath });
    console.log(`[IMG] Промокод создан: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('[IMG ERROR]', error);
    throw error;
  }
}

/**
 * ТЕСТОВАЯ генерация (с прицелами)
 */
async function generatePromoTestImage(templateKey = 'default', sample = {}) {
  const isTimeBased = String(templateKey).endsWith('_time');
  const data = {
    name: sample.name || 'ТЕСТОВЫЙ ПРОМОКОД',
    value: sample.value != null ? sample.value : (isTimeBased ? 75 : 12345), // 75 мин или 12к активаций
    prizeAmount: sample.prizeAmount != null ? sample.prizeAmount : 100000,
    prizeType: sample.prizeType || 'balance',
  };
  const outputPath = path.join(promoImagesDir, `TEST_${templateKey}.png`);
  await drawPromoImage({ ...data, forceTemplate: templateKey, isTimeBased, guides: true, outputPath });
  return outputPath;
}

module.exports = { 
  generatePromoImage, 
  generatePromoTestImage, 
  TEXT_COORDS_DEFAULT, // Экспортируем оба, чтобы можно было дебажить
  TEXT_COORDS_TIME 
};