// bank/npfShares.js

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const { Markup } = require('telegraf');

// Импорт функций из db.js (ваша база данных)
const {
  getNpfStats, // Используем новую функцию
  getUserById, // Остальные функции, если нужны
  // ... другие импорты из db.js, которые нужны для handleNpfInfo, generateNpfChart
} = require('../db');

// Импорт функций торговли из нового файла
const { handleBuyShares, handleSellShares } = require('./npfTrading');

// Пути к файлам
const DATA_DIR = path.join(__dirname, '../data'); // Папка для хранения данных
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const COURSE_HISTORY_FILE = path.join(DATA_DIR, 'npf_course_history.json');
const COURSE_STATE_FILE = path.join(DATA_DIR, 'npf_state.json');
const DAILY_CLOSE_PRICE_PREFIX = 'npf_course_daily_';

// Глобальные переменные для хранения состояния
let currentCourse = 100; // Начальное значение курса (можно изменить)
let lastCourse = 100; // Предыдущее значение курса

// Константы
const COURSE_UPDATE_INTERVAL = 60 * 1000; // 1 минута
const FILE_SIZE_LIMIT = 1024 * 1024 * 1024; // 1 ГБ в байтах
const BASE_PRICE = 100; // Базовая цена акции
const COEFFICIENT = 0.01; // Коэффициент для расчета курса
const PENALTY_COEFFICIENT = 0.1; // Штрафной коэффициент за количество акций

// Функция для загрузки состояния курса при запуске
function loadCourseState() {
  try {
    if (fs.existsSync(COURSE_STATE_FILE)) {
      const stateData = JSON.parse(fs.readFileSync(COURSE_STATE_FILE, 'utf8'));
      currentCourse = stateData.currentCourse || 100;
      lastCourse = stateData.lastCourse || 100;
    } else {
      console.log('Файл состояния курса не найден. Используется значение по умолчанию.');
    }
  } catch (error) {
    console.error('Ошибка при загрузке состояния курса:', error);
    currentCourse = 100;
    lastCourse = 100;
  }
}

// Функция для сохранения состояния курса
function saveCourseState() {
  try {
    const stateData = {
      currentCourse: currentCourse,
      lastCourse: lastCourse,
      timestamp: Date.now(),
    };
    fs.writeFileSync(COURSE_STATE_FILE, JSON.stringify(stateData, null, 2));
  } catch (error) {
    console.error('Ошибка при сохранении состояния курса:', error);
  }
}

// Функция для добавления записи в историю курса
function addCourseHistoryEntry(price, change) {
  try {
    let history = [];
    if (fs.existsSync(COURSE_HISTORY_FILE)) {
      const rawData = fs.readFileSync(COURSE_HISTORY_FILE, 'utf8');
      history = JSON.parse(rawData);
    }

    const newEntry = {
      timestamp: Date.now(),
      price: price,
      change: change,
    };

    history.push(newEntry);

    // Удаляем старые записи, если размер файла превышает лимит
    while (JSON.stringify(history).length > FILE_SIZE_LIMIT && history.length > 1) {
      history.shift(); // Удаляем первую запись
    }

    fs.writeFileSync(COURSE_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Ошибка при добавлении записи в историю курса:', error);
  }
}

// Функция для получения цены закрытия за определенную дату
function getDailyClosePrice(dateStr) {
  try {
    const dailyFile = path.join(DATA_DIR, `${DAILY_CLOSE_PRICE_PREFIX}${dateStr}.json`);
    if (fs.existsSync(dailyFile)) {
      const data = JSON.parse(fs.readFileSync(dailyFile, 'utf8'));
      return data.close_price;
    }
    return null;
  } catch (error) {
    console.error('Ошибка при получении цены закрытия за день:', error);
    return null;
  }
}

// Функция для сохранения цены закрытия за текущий день
function saveDailyClosePrice(price) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dailyFile = path.join(DATA_DIR, `${DAILY_CLOSE_PRICE_PREFIX}${today}.json`);

    // Получаем статистику для сохранения (теперь используем функцию из db.js)
    const stats = getNpfStats();

    const data = {
      date: today,
      close_price: price,
      total_card_pf: stats.total_card_pf,
      total_cardholders: stats.total_cardholders,
      total_shares: stats.total_shares,
    };

    fs.writeFileSync(dailyFile, JSON.stringify(data, null, 2));
    console.log(`Цена закрытия за ${today} сохранена.`);
  } catch (error) {
    console.error('Ошибка при сохранении цены закрытия за день:', error);
  }
}

// Основная функция для расчета курса NPF
function calculateNpfCourse() {
  // Получаем статистику из db.js
  const stats = getNpfStats();

  // Простая формула расчета курса (можно усложнить)
  // Курс зависит от общего баланса на картах, количества держателей карт и общего количества акций
  let course = BASE_PRICE + (stats.total_card_pf / (stats.total_cardholders || 1)) * COEFFICIENT - (stats.total_shares / 1000) * PENALTY_COEFFICIENT; // Добавил || 1, чтобы избежать деления на 0

  // Ограничиваем минимальный курс
  course = Math.max(1, course);

  return Math.round(course); // Округляем до целого числа
}

// Функция для обновления курса каждую минуту
function startCourseUpdater() {
  setInterval(() => {
    try {
      const newCourse = calculateNpfCourse();
      const change = newCourse - lastCourse;

      // Обновляем глобальные переменные
      lastCourse = currentCourse;
      currentCourse = newCourse;

      // Сохраняем историю
      addCourseHistoryEntry(newCourse, change);

      // Проверяем, является ли сейчас конец дня (00:00)
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        saveDailyClosePrice(newCourse);
      }

      // Сохраняем состояние
      saveCourseState();
    } catch (error) {
      console.error('Ошибка при обновлении курса NPF:', error);
    }
  }, COURSE_UPDATE_INTERVAL);
}

// Обработчик команды "/акции" или "/npf" - теперь показывает полную информацию
async function handleNpfInfo(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('❌ Не удалось найти ваш профиль.');
    }

    // Получаем количество акций у пользователя через db.js
    const userShares = user.npf_shares || 0; // или getUserNpfShares(userId) если хотите использовать отдельную функцию
    const userSharesValue = userShares * currentCourse; // Текущая стоимость акций

    // Получаем статистику через db.js
    const stats = getNpfStats();

    const message = `
📊 Информация об акциях NPF:
• Текущий курс: <b>${currentCourse.toLocaleString('ru-RU')} PF</b>
• Ваше количество акций: <b>${userShares}</b>
• Стоимость ваших акций: <b>${userSharesValue.toLocaleString('ru-RU')} PF</b>

📈 Общая статистика:
• Общий баланс на картах: ${stats.total_card_pf.toLocaleString('ru-RU')} PF
• Количество держателей карт: ${stats.total_cardholders}
• Общее количество акций в обращении: ${stats.total_shares}
`;

    await ctx.replyWithHTML(message);
  } catch (error) {
    console.error('Ошибка при обработке команды "/акции":', error);
    await ctx.reply('Произошла ошибка при получении информации об акциях.');
  }
}

// Обработчик команды "/npf_short" или нажатие на кнопку "Курс" - показывает только курс и график
async function handleNpfInfoShort(ctx) {
    try {
      // Формируем сообщение только с текущим курсом
      const message = `📊 Текущий курс акций NPF: <b>${currentCourse.toLocaleString('ru-RU')} PF</b>`;
  
      // Отправляем сообщение
      await ctx.replyWithHTML(message);
  
      // Затем отправляем график за неделю
      await handleShowChartWeek(ctx);
  
    } catch (error) {
      console.error('Ошибка при обработке команды "/npf_short":', error);
      await ctx.reply('Произошла ошибка при получении информации об акциях.');
    }
  }

// Обработчик команды "/купить_акции <количество>" - теперь вызывает функцию из npfTrading.js
async function handleNpfBuyCommand(ctx) {
    await handleBuyShares(ctx, currentCourse); // Передаем текущий курс
}

// Обработчик команды "/продать_акции <количество>" - теперь вызывает функцию из npfTrading.js
async function handleNpfSellCommand(ctx) {
    await handleSellShares(ctx, currentCourse); // Передаем текущий курс
}

// Функция для генерации графика курса NPF за определённый период
async function generateNpfChart(historyData, periodMs = 7 * 24 * 60 * 60 * 1000) { // По умолчанию за 7 дней
  try {
    if (!historyData || historyData.length === 0) {
      // Если данных нет, рисуем сообщение
      const width = 1200;
      const height = 600;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('Нет данных для отображения графика.', width / 2 - 200, height / 2);
      return canvas.toBuffer('image/png');
    }

    // Фильтруем историю по периоду
    const now = Date.now();
    const cutoffTime = now - periodMs;
    const filteredHistory = historyData.filter(entry => entry.timestamp >= cutoffTime);

    if (filteredHistory.length === 0) {
      // Если данных за период нет, рисуем сообщение
      const width = 1200;
      const height = 600;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('Нет данных за выбранный период.', width / 2 - 180, height / 2);
      return canvas.toBuffer('image/png');
    }

    // Создаем canvas
    const width = 1200;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Задаем фон
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // Масштабирование
    const padding = 50;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Находим минимум и максимум цены за период
    const prices = filteredHistory.map(entry => entry.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // Рисуем оси
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Рисуем график
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const step = chartWidth / (filteredHistory.length - 1);

    for (let i = 0; i < filteredHistory.length; i++) {
      const x = padding + i * step;
      const y = height - padding - ((filteredHistory[i].price - minPrice) / priceRange) * chartHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Добавляем метки
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.fillText(`Макс: ${maxPrice}`, padding + 5, padding + 15);
    ctx.fillText(`Мин: ${minPrice}`, padding + 5, height - padding - 5);

    // Возвращаем буфер изображения
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Ошибка при генерации графика:', error);
    throw error;
  }
}

// Обработчик команды "/график" или "/npf_график" - теперь за неделю
async function handleShowChartWeek(ctx) {
  try {
    // Читаем историю курса
    let historyData = [];
    if (fs.existsSync(COURSE_HISTORY_FILE)) {
      const rawData = fs.readFileSync(COURSE_HISTORY_FILE, 'utf8');
      historyData = JSON.parse(rawData);
    }

    // Генерируем график за неделю (7 * 24 * 60 * 60 * 1000 мс)
    const chartBuffer = await generateNpfChart(historyData, 7 * 24 * 60 * 60 * 1000);

    // Отправляем изображение
    await ctx.replyWithPhoto({ source: chartBuffer }, {
      caption: '📈 График курса акций NPF за последнюю неделю',
      parse_mode: 'HTML',
    });

  } catch (error) {
    console.error('Ошибка при показе графика за неделю:', error);
    await ctx.reply('Произошла ошибка при генерации графика. Попробуйте позже.');
  }
}

// Обработчик команды "/график" или "/npf_график" - теперь за всё время
async function handleShowChart(ctx) {
  try {
    // Читаем историю курса
    let historyData = [];
    if (fs.existsSync(COURSE_HISTORY_FILE)) {
      const rawData = fs.readFileSync(COURSE_HISTORY_FILE, 'utf8');
      historyData = JSON.parse(rawData);
    }

    // Генерируем график за всё время (без ограничения)
    const chartBuffer = await generateNpfChart(historyData);

    // Отправляем изображение
    await ctx.replyWithPhoto({ source: chartBuffer }, {
      caption: '📈 График курса акций NPF (всё время)',
      parse_mode: 'HTML',
    });

  } catch (error) {
    console.error('Ошибка при показе графика:', error);
    await ctx.reply('Произошла ошибка при генерации графика. Попробуйте позже.');
  }
}

// Функция для получения текущего курса (для использования в других модулях, например, в npfTrading.js, если нужно)
function getCurrentCourse() {
  return currentCourse;
}

// Экспортируем функции
module.exports = {
  loadCourseState,
  startCourseUpdater,
  handleNpfInfo,
  handleNpfInfoShort, // Экспортируем новую функцию
  handleNpfBuyCommand,
  handleNpfSellCommand,
  handleShowChart,
  handleShowChartWeek, // Экспортируем функцию для недельного графика
  getCurrentCourse,
};