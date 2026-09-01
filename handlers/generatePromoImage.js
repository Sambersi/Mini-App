// handlers/generatePromoImage.js
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Пути к шаблонам промокодов
// Обычные шаблоны
const promoFatPath = path.join(__dirname, '../images/promo_fat.png');
const promoDefaultPath = path.join(__dirname, '../images/promo_defoult.png');
// Шаблоны для временных промокодов (ТАЙМ-ПРОМО)
const promoFatTimePath = path.join(__dirname, '../images/promo_fat_time.png');
const promoDefaultTimePath = path.join(__dirname, '../images/promo_defoult_time.png');

// Создаем папку для хранения изображений промокодов
const promoImagesDir = path.join(__dirname, '../promo_images');
if (!fs.existsSync(promoImagesDir)) {
  fs.mkdirSync(promoImagesDir);
}

// Объект для отображения типов призов
const prizeTypeDisplay = {
  container_type_3: 'GOLD-контейнер',
  balance: 'PF',
  df_balance: 'DF',
  npf_shares: 'NPF-акция',
};

// Функция для форматирования числа с разделителями (для суммы приза)
function formatNumberWithDots(number) {
  return number.toLocaleString('ru-RU');
}

// Функция для форматирования времени (минуты -> ЧЧ:ММ)
function formatTimeDisplay(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  // Форматируем с ведущими нулями: 01:05, 12:30
  const hStr = hours.toString().padStart(2, '0');
  const mStr = minutes.toString().padStart(2, '0');
  
  return `${hStr}:${mStr}`;
}

/**
 * Генерация изображения промокода
 * @param {string} name - Название промокода
 * @param {number} value - Количество активаций ИЛИ длительность в минутах
 * @param {number} prizeAmount - Сумма приза
 * @param {string} prizeType - Тип приза
 * @param {string|null} forceTemplate - Принудительный шаблон ('fat', 'default', 'fat_time', 'default_time')
 * @param {boolean} isTimeBased - Флаг: является ли промокодом по времени
 */
async function generatePromoImage(name, value, prizeAmount, prizeType, forceTemplate = null, isTimeBased = false) {
  try {
    // --- 1. ВЫБОР ШАБЛОНА ---
    let templatePath;

    if (forceTemplate) {
      // Принудительный выбор
      switch (forceTemplate) {
        case 'fat': templatePath = promoFatPath; break;
        case 'default': templatePath = promoDefaultPath; break;
        case 'fat_time': templatePath = promoFatTimePath; break;
        case 'default_time': templatePath = promoDefaultTimePath; break;
        default: templatePath = isTimeBased ? promoDefaultTimePath : promoDefaultPath;
      }
    } else {
      // Автоматический выбор
      if (isTimeBased) {
        // Для временных промокодов
        if (prizeType === 'container_type_3' || (prizeType === 'balance' && prizeAmount >= 100000)) {
          templatePath = promoFatTimePath;
        } else {
          templatePath = promoDefaultTimePath;
        }
      } else {
        // Для обычных промокодов
        if (prizeType === 'container_type_3' || (prizeType === 'balance' && prizeAmount >= 100000)) {
          templatePath = promoFatPath;
        } else {
          templatePath = promoDefaultPath;
        }
      }
    }

    // Проверка существования файла
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Шаблон не найден: ${templatePath}. Убедитесь, что файлы promo_fat_time.png и promo_defoult_time.png загружены в папку images.`);
    }

    // Загрузка шаблона
    const template = await loadImage(templatePath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext('2d');

    // Отрисовка фона
    ctx.drawImage(template, 0, 0, template.width, template.height);

    // Общие настройки текста
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000'; // Черный цвет текста (как на макете)

    // --- 2. ОТРИСОВКА НАЗВАНИЯ (По центру над плашкой) ---
    // Координаты примерные, подгоните Y (второй параметр), если название будет слишком высоко/низко
    ctx.font = 'bold 80px "Arial", sans-serif'; 
    // Ограничим длину названия, чтобы не вылезало за края, если нужно
    let displayName = name;
    if (name.length > 15) {
        ctx.font = 'bold 60px "Arial", sans-serif';
    }
    ctx.fillText(displayName, template.width / 2, 450); 

    // --- 3. ОТРИСОВКА СУММЫ ПРИЗА (Слева вверху) ---
    // Координаты berdasarkan макета: слева от зеленого блока времени
    const formattedPrizeType = prizeTypeDisplay[prizeType] || prizeType;
    const formattedPrizeAmount = formatNumberWithDots(prizeAmount);
    const prizeText = `${formattedPrizeAmount} ${formattedPrizeType}`;

    ctx.font = 'bold 32px "Arial", sans-serif';
    // Координата X ~ 600-700 (слева), Y ~ 280-300 (верхняя панель)
    ctx.fillText(prizeText, 650, 290); 

    // --- 4. ОТРИСОВКА ВРЕМЕНИ ИЛИ АКТИВАЦИЙ (Справа вверху) ---
    let rightText = '';
    
    if (isTimeBased) {
      // Форматируем минуты в ЧЧ:ММ (4 цифры + двоеточие)
      rightText = formatTimeDisplay(value);
      
      // Шрифт для времени (моноширинный или просто крупный, чтобы цифры были четкими)
      ctx.font = 'bold 40px "Courier New", monospace'; 
    } else {
      // Обычное количество активаций
      rightText = formatNumberWithDots(value);
      ctx.font = 'bold 32px "Arial", sans-serif';
    }

    // Координата X ~ 1100-1200 (справа), Y ~ 290 (на одной линии с суммой)
    ctx.fillText(rightText, 1150, 290);

    // --- 5. СОХРАНЕНИЕ ---
    const outputPath = path.join(promoImagesDir, `${name}_promo.png`);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });

    console.log(`[IMG] Промокод создан: ${outputPath} (Шаблон: ${path.basename(templatePath)})`);
    return outputPath;
  } catch (error) {
    console.error('[IMG ERROR] Ошибка генерации:', error);
    throw error;
  }
}

module.exports = { generatePromoImage };