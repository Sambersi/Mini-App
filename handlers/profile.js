//profile.js
// Импортируем необходимые функции
const { Markup } = require('telegraf');
const { 
  getUserById, 
  getUserStatuses, 
  getPrefixById, 
  getReferralsByReferrerId,
  listUserPrefixes,
  getCardDetails, // Для получения данных карты
  getSelectedSkinFileName, // Для получения файла активного скина
  getSelectedSkin,
  getSkinById,
  getSpecialPrefixById,
  isUserBanned, // Проверка, забанен ли пользователь
  getBlacklistEntry // Получение информации о бане
} = require('../db');
const { generateCardImage } = require('../generateCard'); // Импортируем функцию генерации изображения карты
const fs = require('fs');

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный'; // Используем имя из БД или "Неизвестный"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Функция для расчета возраста аккаунта
function calculateAccountAge(registrationDate) {
  const now = Date.now();
  const diffMs = now - registrationDate * 1000; // Разница в миллисекундах
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); // Дни
  const diffMonths = Math.floor(diffDays / 30); // Месяцы
  const diffYears = Math.floor(diffMonths / 12); // Годы

  if (diffYears > 0) {
    return `${diffYears} лет ${diffMonths % 12} месяцев ${diffDays % 30} дней`;
  } else if (diffMonths > 0) {
    return `${diffMonths} месяцев ${diffDays % 30} дней`;
  } else {
    return `${diffDays} дней`;
  }
}

// Функция для форматирования даты в формат "дд мм гггг"
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0'); // День с ведущим нулём
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяц с ведущим нулём (месяцы начинаются с 0)
  const year = date.getFullYear(); // Год полностью
  return `${day}.${month}.${year}`;
}

// Обработка команды /профиль
async function profileHandler(ctx) {
  try {
    const userId = ctx.from.id;
    const isPrivateChat = ctx.chat.type === 'private';

    // Получаем данные пользователя из базы данных
    const user = await getUserById(userId.toString());
    if (!user) {
      return ctx.reply('Вы ещё не зарегистрированы. Используйте команду /start для регистрации.');
    }

    // Проверяем, забанен ли пользователь
    const isBanned = await isUserBanned(userId);
    let banInfo = '';
    if (isBanned) {
      const bannedDetails = await getBlacklistEntry(userId);
      const banReason = bannedDetails?.reason || 'Причина не указана';
      const banExpiresAt = bannedDetails?.banned_until
        ? new Date(bannedDetails.banned_until * 1000).toLocaleString()
        : 'Навсегда';
      banInfo = `\n⚠️ <b>Забанен:</b> Причина: ${banReason}, До: ${banExpiresAt}\n`;
    }

    // Получаем список статусов пользователя из БД
    const statuses = await getUserStatuses(userId); // Возвращает массив названий статусов

    // Получаем активный префикс пользователя
    let activePrefix = '';
    if (user.active_prefix_id) {
      const prefix = getPrefixById(user.active_prefix_id) || getSpecialPrefixById(user.active_prefix_id);
      if (prefix) {
        activePrefix = `${prefix.prefix}\n`; // Добавляем префикс в формате "(VIP)"
      }
    }

    // Убедимся, что все необходимые поля существуют (если их нет, установим значения по умолчанию)
    const dfBalance = user.df_balance ?? 0; // Баланс DF
    const npfShares = user.npf_shares ?? 0; // Количество акций NPF
    const containerType1 = user.container_type_1 ?? 0; // Количество контейнеров CLASSIC
    const containerType2 = user.container_type_2 ?? 0; // Количество контейнеров PREMIUM
    const containerType3 = user.container_type_3 ?? 0; // Количество контейнеров GOLD
    const cardBalance = user.card_balance ?? 0; // Баланс на карте
    const numericId = user.numeric_id ?? 'Не найден'; // Numeric ID пользователя
    const balance = user.balance ?? 0; // Основной баланс PF
    const candyCount = user.candy ?? 0; // Количество конфет
    const ticketsCount = user.tickets ?? 0; // Количество билетиков — ✅ ДОБАВЛЕНО

    // Рассчитываем возраст аккаунта
    const accountAge = calculateAccountAge(user.registration_date);

    // Форматируем дату регистрации
    const registrationDateFormatted = formatDate(new Date(user.registration_date * 1000));

    // Получаем список рефералов пользователя
    const referrals = await getReferralsByReferrerId(user.id);
    const referralsCount = referrals.length;

    // Статистика раундов
    const roundWins = user.round_wins ?? 0; // Выиграно раундов
    const roundLosses = user.round_losses ?? 0; // Проиграно раундов

    // Формируем текст профиля
    let profileText = `
👤 <b>Ник:</b> ${user.username}
🆔 <code>${numericId}</code>
${activePrefix ? `${activePrefix}` : ''} 

${statuses.length > 0 ? `🌟 <b>Статус:</b> ${statuses.join(' + ')}\n` : `🪪 Player\n`}

💰 <b>Баланс:</b> ${balance.toLocaleString('ru-RU')} <b>PF</b>
💳 <b>На карте:</b> ${cardBalance.toLocaleString('ru-RU')} <b>PF</b>
🍩 <b>Баланс DF:</b> ${dfBalance.toLocaleString('ru-RU')} <b>DF</b>

🎫 <b>Tickets:</b> ${ticketsCount} <b>шт</b>
🍬 <b>Конфет:</b> ${candyCount} <b>шт</b>
💼 <b>Акции NPF:</b> ${npfShares} <b>шт</b>

📦<b>Контейнеры:</b>
   🧱 <b>CLASSIC:</b> ${containerType1} <b>шт</b>
   💎 <b>PREMIUM:</b> ${containerType2} <b>шт</b>
   ⭐️ <b>GOLD:</b> ${containerType3} <b>шт</b>

👥 <b>Кол-во рефералов:</b> ${referralsCount}
____________________________
📊 <b>Статистика игры в DOUBLE PLUS:</b>
   ✅ <b>Выиграно раундов:</b> ${roundWins} <b>раз</b>
   ❌ <b>Проиграно раундов:</b> ${roundLosses} <b>раз</b>

⏳ <b>Дата регистрации:</b> ${registrationDateFormatted}
🗓️ <b>Возраст аккаунта:</b> ${accountAge}
${banInfo}
    `.trim();

    // Удаляем лишние переносы строк, если статусов или префикса нет
    profileText = profileText.replace(/\n\s*\n/g, '\n\n').trim();

    // Создаем клавиатуру с кнопками
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🖼 Мои скины', callback_data: 'my_skins' },
          { text: '👥 Мои рефералы', callback_data: 'my_referrals' }
        ],
        [
          { text: '💎 Донат', callback_data: 'donate' },
          { text: '🏷 Мои префиксы', callback_data: 'my_prefixes' }
        ],
        [
          { text: '📊 Статистика', callback_data: 'show_statistics' } // Новая кнопка
        ],
        [
          { text: '⚙️ Управление профилем', callback_data: 'manage_profile' }
        ]
      ]
    };

    // Проверяем, есть ли у пользователя карта
    const cardDetails = await getCardDetails(userId);
    if (cardDetails && cardDetails.card_number) {
      // Получаем активный скин пользователя
      const skinId = await getSelectedSkin(userId); // Функция из db.js
      let skinFileName = 'default_card.png'; // Дефолтное изображение

      if (skinId) {
        const skinData = await getSkinById(skinId); // Получаем данные скина
        if (skinData && skinData.file_name) {
          skinFileName = skinData.file_name; // Используем скин, если он есть
        }
      }

      // Генерируем изображение карты с учётом скина или дефолтного файла
      const cardImagePath = await generateCardImage(userId, cardDetails.card_number, skinFileName);

      // Проверяем, существует ли файл изображения
      if (fs.existsSync(cardImagePath)) {
        // Отправляем изображение и текстовые данные одним сообщением
        return ctx.replyWithPhoto(
          { source: cardImagePath },
          { 
            caption: profileText, 
            parse_mode: 'HTML',
            reply_markup: keyboard
          }
        );
      }
    }

    // Если карта отсутствует, отправляем только текстовое сообщение
    if (isPrivateChat) {
      return ctx.reply(profileText, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      const userLink = createUserLink(userId, user.username);
      return ctx.reply(`${userLink}, ваш профиль:\n\n${profileText}`, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Ошибка при обработке команды /профиль:', error);
    return ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

async function handleManageProfile(ctx) {
  try {
    const userId = ctx.from.id;
    const user = await getUserById(userId.toString());

    if (!user) {
      return ctx.reply('❌ Профиль не найден.');
    }

    const message = `
🔧 <b>Управление профилем</b>

Выберите действие:
`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔔 Уведомления вкл', 'enable_notifications'),
        Markup.button.callback('🔕 Уведомления выкл', 'disable_notifications')
      ],
      [
        Markup.button.callback('🕵️ Анонимность', 'toggle_hyperlink')
      ],
      [
        Markup.button.callback('⬅️ Назад', 'back_to_profile')
      ]
    ]);

    // Отправляем новое сообщение с меню управления профилем
    await ctx.replyWithHTML(message, keyboard);
  } catch (error) {
    console.error('Ошибка при открытии меню управления профилем:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { profileHandler, handleManageProfile };