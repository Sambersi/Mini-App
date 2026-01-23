const { getUserById, getUserStatuses, toggleHyperlink, isHyperlinkDisabled, getCardDetails, getNumericIdByUserId, getSelectedSkinFileName } = require('../db');
const { topReferralsHandler } = require('./referralSystem'); // Импортируем обработчики
const { getTopDonators } = require('./donationStats');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const topPfImagePath = path.join(__dirname, '..', 'images', 'top_pf.png');
const fs = require('fs');

async function generateTopImage(topPlayers) {
  try {
    // Загружаем фоновое изображение
    const topPfImagePath = path.join(__dirname, '..', 'images', 'top_pf.png'); // Исправленный путь
    const background = await loadImage(topPfImagePath);

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
        bigUsernameFontSize: 26, // Размер шрифта большого никнейма
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
    for (let i = 0; i < Math.min(3, topPlayers.length); i++) {
      const player = topPlayers[i];
      const settings = playerSettings[i]; // Получаем настройки для текущего игрока

      const skinFileName = await getSelectedSkinFileName(player.id); // Получаем имя файла скина

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
        const user = await getUserById(player.id);
        const username = user?.username || `User${user.numeric_id}`;
        const cardDetails = await getCardDetails(player.id); // Предполагается, что эта функция возвращает данные карты
        const cardNumber = cardDetails.card_number;

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
        ctx.fillText(`${cardNumber}`, cardNumberPosition.x, cardNumberPosition.y);
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
    const outputPath = path.join(__dirname, '..', 'temp', `top_image_${Date.now()}.png`);
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Ошибка при генерации изображения топа:', error);
    throw error;
  }
}

// Функция для скругления углов изображения (более вытянутые и острые углы)
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

// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
  const escapedUsername = username
    ? username.replace(/([<>&"'])/g, (match) => {
        const escapeMap = {
          '<': '<',
          '>': '>',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return escapeMap[match];
      })
    : 'Неизвестный';

  if (disableHyperlink) {
    return escapedUsername;
  }

  return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`;
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

// Функция для форматирования баланса с разделителем тысяч
function formatBalance(totalBalance) {
  return totalBalance.toLocaleString('ru-RU').replace(/,/g, '.') + ' PF';
}

async function getTopPlayers(db) {
  const stmt = db.prepare(`
    SELECT id, username, balance, card_balance 
    FROM users
    WHERE is_hidden_in_top = 0 -- Исключаем скрытых пользователей
    ORDER BY (balance + card_balance) DESC
  `);
  return stmt.all();
}

async function forbesHandler(ctx, db) {
  try {
    // Получаем всех игроков, отсортированных по суммарному балансу
    const allPlayers = await getTopPlayers(db);
    if (!allPlayers || allPlayers.length === 0) {
      return ctx.reply('Список игроков пуст.');
    }
    
    let message = '';
    const callingUserId = ctx.from.id.toString(); // ID пользователя, вызвавшего команду
    let userPosition = null; // Переменная для хранения позиции пользователя
    let userBalance = null; // Переменная для хранения баланса пользователя
    let topPlayersList = []; // Массив для хранения игроков, которые попадут в топ
    
    // Формируем начальное обращение
    if (ctx.chat.type !== 'private') {
      const callingUser = await getUserById(callingUserId);
      const username = callingUser?.username || 'Неизвестный';
      const disableHyperlink = isHyperlinkDisabled(callingUserId);
      const userLink = createUserLink(callingUserId, username, disableHyperlink);
      message += `🏆 ${userLink}, топ игроков по суммарному балансу PF:\n\n`;
    } else {
      message += '🏆 Топ игроков по суммарному балансу PF:\n\n';
    }

    // Фильтруем игроков, исключая технических администраторов
    for (const player of allPlayers) {
      const userId = player.id;
      
      // Исключаем технических администраторов
      const statuses = await getUserStatuses(userId);
      if (statuses.includes('Тех администратор')) {
        continue;
      }
      
      // Добавляем игрока в топ
      topPlayersList.push(player);
      
      // Ограничиваем топ до 10 игроков
      if (topPlayersList.length >= 10) {
        break;
      }
    }

    // Если после фильтрации топ пуст
    if (topPlayersList.length === 0) {
      return ctx.reply('Список игроков пуст.');
    }

    // Добавляем список топ-игроков
    for (let index = 0; index < topPlayersList.length; index++) {
      const player = topPlayersList[index];
      const position = index === 9 ? '🔟' : `${index + 1}️⃣`;
      const userId = player.id;
      const username = player.username || `User${userId}`;
      const totalBalance = player.balance + player.card_balance;
      const formattedBalance = formatBalance(totalBalance);
      
      const disableHyperlink = isHyperlinkDisabled(userId);
      const userLink = createUserLink(userId, username, disableHyperlink);
      
      message += `${position} ${userLink} — ${formattedBalance}\n`;
      
      if (userId === callingUserId) {
        userPosition = index + 1;
        userBalance = formattedBalance;
      }
    }

    // Если пользователь не входит в топ-10, добавляем его место в конец
    if (userPosition === null) {
      const userIndex = allPlayers.findIndex(p => p.id === callingUserId);
      if (userIndex !== -1) {
        userPosition = userIndex + 1;
        const totalBalance = allPlayers[userIndex].balance + allPlayers[userIndex].card_balance;
        userBalance = formatBalance(totalBalance);
      }
      
      if (userPosition > 10) {
        message += `\n————————————————\n`;
        const positionEmoji = numberToEmoji(userPosition);
        
        const callingUser = await getUserById(callingUserId);
        const username = callingUser?.username || 'Неизвестный';
        const disableHyperlink = isHyperlinkDisabled(callingUserId);
        const userLink = createUserLink(callingUserId, username, disableHyperlink);
        
        message += `${positionEmoji} ${userLink} — ${userBalance}`;
      }
    }

    // Генерируем изображение с активными скинами трёх первых игроков
    const topImagePath = await generateTopImage(topPlayersList);

    // Создаем клавиатуру с кнопками выбора других топов
    const keyboard = {
      inline_keyboard: [
        [{ text: '⭐️ Топ донатеров', callback_data: 'top_donators' }],
        [{ text: '👥 Топ рефералов', callback_data: 'top_referrals' }],
        [{ text: '🍬 Топ по конфетам', callback_data: 'candy_top' }],
      ],
    };

    // Отправляем сообщение с изображением и текстом
    await ctx.replyWithPhoto({ source: topImagePath }, {
      caption: message,
      parse_mode: 'HTML', // Используем HTML вместо Markdown
      reply_markup: keyboard,
    });

    // Удаляем временный файл
    fs.unlinkSync(topImagePath);
  } catch (error) {
    console.error('Ошибка при обработке команды "форбс":', error);
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

// Обработчик кнопки "Топ донатеров"
async function handleTopDonators(ctx) {
  try {
    await getTopDonators(ctx); // Вызываем обработчик топа донатеров
  } catch (error) {
    console.error('Ошибка при обработке запроса "топ донатеров":', error);
    await ctx.reply('Произошла ошибка при получении топа донатеров.');
  }
}

// Обработчик кнопки "Топ рефералов"
async function handleTopReferrals(ctx) {
  try {
    await topReferralsHandler(ctx); // Вызываем обработчик топа рефералов
  } catch (error) {
    console.error('Ошибка при обработке запроса "топ рефералов":', error);
    await ctx.reply('Произошла ошибка при получении топа рефералов.');
  }
}

async function toggleHyperlinkHandler(ctx, db) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем текущее состояние гиперссылки
    const currentStatus = isHyperlinkDisabled(userId);

    // Переключаем состояние гиперссылки
    const success = toggleHyperlink(userId);

    if (success) {
      // Получаем новое состояние гиперссылки
      const newStatus = isHyperlinkDisabled(userId);

      // Формируем сообщение в зависимости от нового состояния
      if (newStatus) {
        await ctx.reply('☑️ Гиперссылка успешно выключена.\n\n• Теперь в топах, будет отображаться только ваш ник! (Для отмены повторно использавать команду) ');
      } else {
        await ctx.reply('☑️ Гиперссылка успешно включена.\n\n• Теперь в топах, будет не только ваш ник, но и гиперссылка на вас!');
      }
    } else {
      await ctx.reply('Произошла ошибка при переключении гиперссылки.');
    }
  } catch (error) {
    console.error('Ошибка при выполнении команды "togglehyperlink":', error);
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

module.exports = {
  forbesHandler,
  handleTopDonators,
  handleTopReferrals,
  toggleHyperlinkHandler,
  roundImageCorners
};