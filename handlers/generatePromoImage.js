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
// 1. КООРДИНАТЫ ДЛЯ ОБЫЧНОГО ШАБЛОНА (БЕЗ ВРЕМЕНИ)
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
    x: 1385, y: 350,
    font: 'bold 32px "Arial", sans-serif',
  },
};

// ============================================================
// 2. КООРДИНАТЫ ДЛЯ ЖИРНОГО ШАБЛОНА (БЕЗ ВРЕМЕНИ)
// ============================================================
const TEXT_COORDS_FAT = {
  name: {
    x: null, y: 580,
    font: 'bold 80px "Arial", sans-serif',
    fontSmall: 'bold 60px "Arial", sans-serif',
    smallIfLongerThan: 15,
  },
  prize: {
    x: 1042, y: 350,
    font: 'bold 32px "Arial", sans-serif',
  },
  right: {
    x: 1385, y: 350,
    font: 'bold 32px "Arial", sans-serif',
  },
};

// ============================================================
// 3. КООРДИНАТЫ ДЛЯ ОБЫЧНОГО ВРЕМЕННОГО ШАБЛОНА
// ============================================================
const TEXT_COORDS_DEFAULT_TIME = {
  name: {
    x: null, y: 580,
    font: 'bold 80px "Arial", sans-serif',
    fontSmall: 'bold 60px "Arial", sans-serif',
    smallIfLongerThan: 15,
  },
  prize: {
    x: 1042, y: 358,
    font: 'bold 32px "Arial", sans-serif',
  },
  timeSettings: {
    font: 'bold 45px "Courier New", monospace',
    color: '#000000',
  },
  timeDigits: {
    h1: { x: 1274, y: 360 },
    h2: { x: 1333, y: 360 },
    m1: { x: 1395, y: 360 },
    m2: { x: 1450, y: 360 },
  }
};

// ============================================================
// 4. КООРДИНАТЫ ДЛЯ ЖИРНОГО ВРЕМЕННОГО ШАБЛОНА
// ============================================================
const TEXT_COORDS_FAT_TIME = {
  name: {
    x: null, y: 580,
    font: 'bold 80px "Arial", sans-serif',
    fontSmall: 'bold 60px "Arial", sans-serif',
    smallIfLongerThan: 15,
  },
  prize: {
    x: 1072, y: 358,
    font: 'bold 32px "Arial", sans-serif',
  },
  timeSettings: {
    font: 'bold 45px "Courier New", monospace',
    color: '#000000',
  },
  timeDigits: {
    h1: { x: 1314, y: 360 },
    h2: { x: 1363, y: 360 },
    m1: { x: 1425, y: 360 },
    m2: { x: 1480, y: 360 },
  }
};

// Функция форматирования числа
function formatNumberWithDots(number) {
  return number.toLocaleString('ru-RU');
}

// ============================================================
// НОВОЕ: Определяет, является ли шаблон "жирным"
// ============================================================
function isFatTemplate(templatePath) {
  return templatePath === promoFatPath || templatePath === promoFatTimePath;
}

// ============================================================
// НОВОЕ: Выбор конфига координат на основе типа шаблона
// ============================================================
function resolveCoords(templatePath, isTimeBased) {
  const fat = isFatTemplate(templatePath);
  if (isTimeBased) {
    return fat ? TEXT_COORDS_FAT_TIME : TEXT_COORDS_DEFAULT_TIME;
  }
  return fat ? TEXT_COORDS_FAT : TEXT_COORDS_DEFAULT;
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
function drawGuides(ctx, templateWidth, COORDS, isTimeBased) {
  const points = [
    { key: 'name', x: COORDS.name.x === null ? Math.floor(templateWidth / 2) : COORDS.name.x, y: COORDS.name.y },
    { key: 'prize', x: COORDS.prize.x, y: COORDS.prize.y },
  ];

  if (isTimeBased && COORDS.timeDigits) {
    Object.entries(COORDS.timeDigits).forEach(([key, pos]) => {
      points.push({ key: `time_${key}`, x: pos.x, y: pos.y });
    });
  } else if (!isTimeBased && COORDS.right) {
    points.push({ key: 'right', x: COORDS.right.x, y: COORDS.right.y });
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
  ctx.lineWidth = 2;
  ctx.font = 'bold 20px "Arial", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const p of points) {
    ctx.beginPath();
    ctx.moveTo(p.x - 30, p.y); ctx.lineTo(p.x + 30, p.y);
    ctx.moveTo(p.x, p.y - 30); ctx.lineTo(p.x, p.y + 30);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.stroke();

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

  ctx.drawImage(template, 0, 0, template.width, template.height);

  // НОВОЕ: Выбираем конфиг координат на основе реального пути шаблона
  const COORDS = resolveCoords(templatePath, isTimeBased);

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
    const totalMinutes = value;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const hStr = hours.toString().padStart(2, '0');
    const mStr = minutes.toString().padStart(2, '0');
    
    ctx.font = COORDS.timeSettings.font;
    ctx.fillStyle = COORDS.timeSettings.color;

    if (COORDS.timeDigits) {
      ctx.fillText(hStr[0], COORDS.timeDigits.h1.x, COORDS.timeDigits.h1.y);
      ctx.fillText(hStr[1], COORDS.timeDigits.h2.x, COORDS.timeDigits.h2.y);
      ctx.fillText(mStr[0], COORDS.timeDigits.m1.x, COORDS.timeDigits.m1.y);
      ctx.fillText(mStr[1], COORDS.timeDigits.m2.x, COORDS.timeDigits.m2.y);
    }
  } else {
    const rightText = formatNumberWithDots(value);
    ctx.font = COORDS.right.font;
    ctx.fillText(rightText, COORDS.right.x, COORDS.right.y);
  }

  // --- 4. ПРИЦЕЛЫ (TEST MODE) ---
  if (guides) {
    drawGuides(ctx, template.width, COORDS, isTimeBased);
  }

  await saveCanvas(canvas, outputPath);
  return outputPath;
}

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

async function generatePromoTestImage(templateKey = 'default', sample = {}) {
  const isTimeBased = String(templateKey).endsWith('_time');
  const data = {
    name: sample.name || 'ТЕСТОВЫЙ ПРОМОКОД',
    value: sample.value != null ? sample.value : (isTimeBased ? 75 : 12345),
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
  TEXT_COORDS_DEFAULT,
  TEXT_COORDS_FAT,
  TEXT_COORDS_DEFAULT_TIME,
  TEXT_COORDS_FAT_TIME,
};