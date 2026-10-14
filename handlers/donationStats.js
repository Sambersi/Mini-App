//donationStats.js
const { getUserById, getTopDonatorsFromDatabase, isHyperlinkDisabled, getSelectedSkinFileName, getCardDetails } = require('../db');
const { createCanvas, loadImage } = require('canvas');

const path = require('path');
const fs = require('fs');
// const topDonatsImagePath = path.join(__dirname, '..', 'images', 'top_donats.jpg');
function roundImageCorners(ctx, width, height, radius) {
  ctx.beginPath();
  // Верхний левый угол
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  // Верхний правый угол
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  // Нижний правый угол
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  // Нижний левый угол
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  // Верхний левый угол
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();
}
async function generateTopDonatorsImage(topDonators) {
  try {
    // Загружаем фоновое изображение
    const topDonatsImagePath = path.join(__dirname, '..', 'images', 'top_donats.jpg'); // Путь к шаблону для топа донатеров
    const background = await loadImage(topDonatsImagePath);

    // Создаем canvas с размерами фонового изображения
    const canvas = createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');

    // Рисуем фоновое изображение
    ctx.drawImage(background, 0, 0);

    // Настройки для каждого игрока (скины и текст)
    const playerSettings = [
      {
        position: { x: 665, y: 440 }, // Позиция скина для топ-1
        skinSize: { width: 589, height: 343 }, // Размер скина для топ-1
        usernamePosition: { x: 700, y: 482 }, // Позиция обычного ника для топ-1 (для обрезаемых скинов)
        bigUsernamePosition: { x: 700, y: 877 }, // Позиция большого ника для топ-1 (для обрезаемых скинов)
        cardNumberPosition: { x: 700, y: 742 }, // Позиция номера карты для топ-1 (для обрезаемых скинов)
        noCropUsernamePosition: { x: 794, y: 537 }, // Позиция обычного ника для топ-1 (для не обрезаемых скинов)
        noCropBigUsernamePosition: { x: 710, y: 877 }, // Позиция большого ника для топ-1 (для не обрезаемых скинов)
        noCropCardNumberPosition: { x: 794, y: 701 }, // Позиция номера карты для топ-1 (для не обрезаемых скинов)
        usernameFontSize: 22, // Размер шрифта обычного никнейма
        bigUsernameFontSize: 32, // Размер шрифта большого никнейма
        cardNumberFontSize: 22, // Размер шрифта номера карты
      },
      {
        position: { x: 61, y: 129 }, // Позиция скина для топ-2
        skinSize: { width: 459, height: 267 }, // Размер скина для топ-2
        usernamePosition: { x: 100, y: 163 }, // Позиция обычного ника для топ-2 (для обрезаемых скинов)
        bigUsernamePosition: { x: 80, y: 470 }, // Позиция большого ника для топ-2 (для обрезаемых скинов)
        cardNumberPosition: { x: 90, y: 370 }, // Позиция номера карты для топ-2 (для обрезаемых скинов)
        noCropUsernamePosition: { x: 160, y: 202 }, // Позиция обычного ника для топ-2 (для не обрезаемых скинов)
        noCropBigUsernamePosition: { x: 90, y: 470 }, // Позиция большого ника для топ-2 (для не обрезаемых скинов)
        noCropCardNumberPosition: { x: 160, y: 330 }, // Позиция номера карты для топ-2 (для не обрезаемых скинов)
        usernameFontSize: 14, // Размер шрифта обычного никнейма
        bigUsernameFontSize: 26, // Размер шрифта большого никнейма
        cardNumberFontSize: 14, // Размер шрифта номера карты
      },
      {
        position: { x: 1401, y: 129 }, // Позиция скина для топ-3
        skinSize: { width: 459, height: 267 }, // Размер скина для топ-3
        usernamePosition: { x: 1430, y: 163 }, // Позиция обычного ника для топ-3 (для обрезаемых скинов)
        bigUsernamePosition: { x: 1430, y: 470 }, // Позиция большого ника для топ-3 (для обрезаемых скинов)
        cardNumberPosition: { x: 1430, y: 370 }, // Позиция номера карты для топ-3 (для обрезаемых скинов)
        noCropUsernamePosition: { x: 1500, y: 202 }, // Позиция обычного ника для топ-3 (для не обрезаемых скинов)
        noCropBigUsernamePosition: { x: 1430, y: 470 }, // Позиция большого ника для топ-3 (для не обрезаемых скинов)
        noCropCardNumberPosition: { x: 1500, y: 330 }, // Позиция номера карты для топ-3 (для не обрезаемых скинов)
        usernameFontSize: 14, // Размер шрифта обычного никнейма
        bigUsernameFontSize: 28, // Размер шрифта большого никнейма
        cardNumberFontSize: 14, // Размер шрифта номера карты
      },
    ];

    // Список скинов, которые не требуют обрезки
    const noCropSkins = [
      'map_chan_red.jpg',
      'map_chan_spider.jpg',
      'map_chan_cat.jpg',
      'ОХРАННИК_КВАДРАТ.jpg',
      'ОХРАННИК_ТРЕУГОЛЬНИК.jpg',
      'ОХРАННИК_КРУГ.jpg',
      'frontmen.jpg',
      'juicy_tjan.png',
      
    ];

    // Проходим по каждому игроку и накладываем его скин
    for (let i = 0; i < Math.min(3, topDonators.length); i++) {
      const donator = topDonators[i];
      const settings = playerSettings[i]; // Получаем настройки для текущего игрока

      const skinFileName = await getSelectedSkinFileName(donator.id); // Получаем имя файла скина

      if (skinFileName) {
        const skinPath = path.join(__dirname, '..', 'images', skinFileName); // Исправленный путь

        // Проверяем, существует ли файл
        if (!fs.existsSync(skinPath)) {
          console.error(`Файл скина "${skinPath}" не найден.`);
          continue; // Пропускаем этот скин
        }

        const originalSkin = await loadImage(skinPath);

        // Создаем временный canvas для обработки скина
        const tempCanvas = createCanvas(settings.skinSize.width, settings.skinSize.height);
        const tempCtx = tempCanvas.getContext('2d');

        // Проверяем, нужно ли обрезать скин
        if (!noCropSkins.includes(skinFileName)) {
          // Обрезаем края скина (сверху и снизу по 190px, справа и слева по 360px)
          const crop = {
            top: 191,
            bottom: 191,
            left: 361,
            right: 361,
          };

          const croppedWidth = originalSkin.width - crop.left - crop.right;
          const croppedHeight = originalSkin.height - crop.top - crop.bottom;

          // Масштабируем обрезанное изображение до целевого размера
          tempCtx.drawImage(
            originalSkin,
            crop.left,
            crop.top,
            croppedWidth,
            croppedHeight,
            0,
            0,
            settings.skinSize.width,
            settings.skinSize.height
          );
        } else {
          // Если скин не требует обрезки, просто рисуем оригинальное изображение
          tempCtx.drawImage(originalSkin, 0, 0, settings.skinSize.width, settings.skinSize.height);
        }

        // Создаем второй временный canvas для скругления углов
        const roundedCanvas = createCanvas(settings.skinSize.width, settings.skinSize.height);
        const roundedCtx = roundedCanvas.getContext('2d');

        // Применяем скругление углов
        roundImageCorners(roundedCtx, settings.skinSize.width, settings.skinSize.height, 20);

        // Рисуем обработанное изображение на canvas со скругленными углами
        roundedCtx.drawImage(tempCanvas, 0, 0);

        // Рисуем обработанный скин на основном canvas
        ctx.drawImage(
          roundedCanvas,
          settings.position.x,
          settings.position.y,
          settings.skinSize.width,
          settings.skinSize.height
        );

        // Получаем данные пользователя
        const user = await getUserById(donator.id);
        const username = user?.username || `User${user.numeric_id}`;
        const cardDetails = await getCardDetails(donator.id); // Получаем данные карты
        const cardNumber = cardDetails?.card_number || 'Нет данных'; // Номер карты или заглушка

        // Определяем позиции текста в зависимости от типа скина
        const isNoCropSkin = noCropSkins.includes(skinFileName);
        const usernamePosition = isNoCropSkin ? settings.noCropUsernamePosition : settings.usernamePosition;
        const bigUsernamePosition = isNoCropSkin ? settings.noCropBigUsernamePosition : settings.bigUsernamePosition;
        const cardNumberPosition = isNoCropSkin ? settings.noCropCardNumberPosition : settings.cardNumberPosition;

        // Устанавливаем стиль текста для большого никнейма
        ctx.font = `${settings.bigUsernameFontSize}px Arial`;
        ctx.fillStyle = '#FFFFFF'; // Цвет текста (белый)
        ctx.textAlign = 'left'; // Выравнивание текста
        ctx.fillText(username, bigUsernamePosition.x, bigUsernamePosition.y);

        // Устанавливаем стиль текста для обычного никнейма
        ctx.font = `${settings.usernameFontSize}px Arial`;
        ctx.fillStyle = '#000000'; // Цвет текста (черный)
        ctx.fillText(username, usernamePosition.x, usernamePosition.y);

        // Устанавливаем стиль текста для номера карты
        ctx.font = `${settings.cardNumberFontSize}px Arial`;
        ctx.fillStyle = '#000000'; // Цвет текста (черный)
        ctx.fillText(cardNumber, cardNumberPosition.x, cardNumberPosition.y);
      }
    }

    // **Добавляем наложение дополнительных изображений**
    const additionalImages = ['top_1.png', 'top_2.png', 'top_3.png']; // Список дополнительных изображений
    const additionalImageSettings = [
      { position: { x: 470, y: 350 }, size: { width: 294, height: 349 } }, // Позиция и размер для top_1.png
      { position: { x: -30, y: 80 }, size: { width: 141, height: 181 } }, // Позиция и размер для top_2.png
      { position: { x: 1790, y: 75 }, size: { width: 159, height: 199 } }, // Позиция и размер для top_3.png
    ];

    for (let i = 0; i < Math.min(3, additionalImages.length); i++) {
      const imagePath = path.join(__dirname, '..', 'images', additionalImages[i]);

      if (fs.existsSync(imagePath)) {
        const image = await loadImage(imagePath);
        const { position, size } = additionalImageSettings[i];

        // Накладываем дополнительное изображение на основной canvas
        ctx.drawImage(image, position.x, position.y, size.width, size.height);
      } else {
        console.warn(`Изображение "${additionalImages[i]}" не найдено.`);
      }
    }

    // Сохраняем изображение во временную папку
    const outputPath = path.join(__dirname, '..', 'temp', `top_donators_${Date.now()}.png`);
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Ошибка при генерации изображения топа донатеров:', error);
    throw error;
  }
}

async function getDonationStatistics(ctx) {
  try {
      const userId = ctx.from.id.toString();
      const user = await getUserById(userId);

      if (!user || !user.donations_history) {
          return ctx.reply('❌ У вас пока нет истории донатов.');
      }

      console.log(`[DEBUG] getDonationStatistics: Получена история донатов для пользователя ${userId}`);
      console.log(`[DEBUG] getDonationStatistics: содержимое donations_history:`, user.donations_history);

      const donationsHistory = JSON.parse(user.donations_history);

      if (donationsHistory.length === 0) {
          return ctx.reply('❌ У вас пока нет истории донатов.');
      }

      // Форматируем историю донатов
      const formattedDonations = donationsHistory.map((donation, index) => {
          const date = new Date(donation.timestamp * 1000).toLocaleDateString('ru-RU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
          });
          const time = new Date(donation.timestamp * 1000).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
          });

          return `🗓️ Дата: ${date}\n⏰ Время: ${time}\n⭐️ Кол-во звезд: ${donation.amount}`;
      });

      // Добавляем разделители между донатами
      const donationCount = donationsHistory.length;
      const header = `📊 Статистика ваших донатов:\n\n🍩 Кол-во донатов: ${donationCount}\n\n`;
      const body = formattedDonations.join('\n\n───────────────────────\n\n'); // Разделитель

      // Разбиваем сообщение на части, если список большой
      const maxMessageLength = 4096;
      let messageChunks = [];
      let currentChunk = header;

      // Добавляем каждую строку в текущий блок
      formattedDonations.forEach((line) => {
          const separator = '\n\n───────────────────────\n\n';
          const chunkToAdd = line + separator;

          if ((currentChunk + chunkToAdd).length > maxMessageLength) {
              messageChunks.push(currentChunk.trim()); // Сохраняем текущий блок
              currentChunk = header; // Начинаем новый блок с заголовком
          }
          currentChunk += chunkToAdd;
      });

      // Добавляем последний блок, если он не пустой
      if (currentChunk.trim()) {
          messageChunks.push(currentChunk.trim());
      }

      // Отправляем сообщения по частям
      for (let i = 0; i < messageChunks.length; i++) {
          await ctx.replyWithHTML(messageChunks[i]);
      }
  } catch (error) {
      console.error('Ошибка при получении статистики донатов:', error);
      await ctx.reply('Произошла ошибка при получении статистики донатов.');
  }
}


// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
  if (disableHyperlink) {
    return username || 'Неизвестный'; // Только никнейм
  }
  return `[${username || 'Неизвестный'}](tg://user?id=${userId})`; // Гиперссылка
}

// Символы для цифр (эмодзи)
const digitEmojis = {
  '0': '0️⃣',
  '1': '1️⃣',
  '2': '2️⃣',
  '3': '3️⃣',
  '4': '4️⃣',
  '5': '5️⃣',
  '6': '6️⃣',
  '7': '7️⃣',
  '8': '8️⃣',
  '9': '9️⃣',
};

// Функция для преобразования числа в эмодзи-цифры
function numberToEmoji(number) {
  return String(number)
    .split('')
    .map((digit) => digitEmojis[digit] || '')
    .join('');
}

// Функция для форматирования количества звезд
function formatStars(stars) {
  return stars.toLocaleString('ru-RU').replace(/,/g, '.') + ' ⭐️';
}


// Обработчик команды "топ донатеров"
async function getTopDonators(ctx) {
  try {
    // Получаем топ-10 донатеров
    const topDonators = await getTopDonatorsFromDatabase();

    if (!topDonators || topDonators.length === 0) {
      return ctx.reply('Список донатеров пуст.');
    }

    let message = '';
    const callingUserId = ctx.from.id.toString(); // ID пользователя, вызвавшего команду
    let userPosition = null; // Переменная для хранения позиции пользователя
    let userStars = null; // Переменная для хранения количества звезд пользователя

    // Проверяем тип чата и формируем начальное обращение
    if (ctx.chat.type !== 'private') {
      const userId = ctx.from.id;
      const user = await getUserById(userId);
      const username = escapeMarkdown(user?.username || 'Неизвестный');

      // Проверяем состояние гиперссылки для текущего пользователя
      const disableHyperlink = isHyperlinkDisabled(userId);
      const userLink = createUserLink(userId, username, disableHyperlink);

      message += `⭐️ ${userLink}, топ донатеров:\n\n`;
    } else {
      message += '⭐️ Топ донатеров:\n\n';
    }

    // Добавляем список топ-донатеров
    topDonators.forEach((donator, index) => {
      const position = index === 9 ? '🔟' : `${index + 1}️⃣`; // 🔟 для 10-го места
      const userId = donator.id;
      const username = escapeMarkdown(donator.username || `User${userId}`);
      const stars = donator.total_donated_stars;

      // Проверяем состояние гиперссылки для каждого донатера
      const disableHyperlink = isHyperlinkDisabled(userId);
      const userLink = createUserLink(userId, username, disableHyperlink);

      // Если это пользователь, вызвавший команду, запоминаем его позицию и количество звезд
      if (userId === callingUserId) {
        userPosition = index + 1;
        userStars = formatStars(stars);
      }

      // Форматируем количество звезд с разделителем тысяч
      const formattedStars = formatStars(stars);

      // Добавляем строку в сообщение
      message += `${position} ${userLink} — ${formattedStars}\n`;
    });

    // Если пользователь не входит в топ-10, добавляем его место в конце
    if (userPosition === null) {
      const allDonators = await getTopDonatorsFromDatabase(); // Получаем всех донатеров
      const userIndex = allDonators.findIndex((d) => d.id === callingUserId);
      if (userIndex !== -1) {
        userPosition = userIndex + 1;
        userStars = formatStars(allDonators[userIndex].total_donated_stars);
      }

      if (userPosition > 10) {
        message += `\n———\n`;
        const positionEmoji = numberToEmoji(userPosition);

        // Проверяем состояние гиперссылки для текущего пользователя
        const disableHyperlink = isHyperlinkDisabled(callingUserId);
        const username = escapeMarkdown(ctx.from.username || ctx.from.first_name);
        const userLink = createUserLink(callingUserId, username, disableHyperlink);

        message += `${positionEmoji} ${userLink} — ${userStars}`;
      }
    }

    // Генерируем изображение с топом донатеров
    const topImagePath = await generateTopDonatorsImage(topDonators);

    // Создаем клавиатуру с кнопками выбора других топов
    const keyboard = {
      inline_keyboard: [
        [{ text: '🏆 Топ игроков', callback_data: 'top_players' }],
        [{ text: '👥 Топ рефералов', callback_data: 'top_referrals' }],
      ],
    };

    // Отправляем сообщение с изображением и текстом
    await ctx.replyWithPhoto(
      { source: topImagePath },
      {
        caption: message,
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard,
      }
    );

    // Удаляем временный файл
    fs.unlinkSync(topImagePath);
  } catch (error) {
    console.error('Ошибка при получении топа донатеров:', error);
    await ctx.reply('Произошла ошибка при получении топа донатеров.');
  }
}

// Функция для экранирования специальных символов в MarkdownV2
function escapeMarkdown(text) {
  return text.replace(/[-_.*[\]()~`>#+=|{}!]/g, '\\$&');
}


module.exports = {
    getDonationStatistics,
    getTopDonators,
};