// admin/adminPanel.js
const { Markup } = require('telegraf');
const { getAllUsers, getUsersByStatuses, getUserStatuses, getActivePlayersCount } = require('../db');
const { isModerator } = require('./muteManagement');

function getTechSuperAdminIds() {
  return String(process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function isTechSuperAdmin(userId) {
  return getTechSuperAdminIds().includes(String(userId));
}

function getAdminPanelKeyboard(userId) {
  const rows = [
    [Markup.button.callback('Список админов', 'list_admins')],
    [Markup.button.callback('Админские команды', 'admin_commands')],
  ];
  if (isTechSuperAdmin(userId)) {
    rows.push([Markup.button.callback('🛠 Тех админ панель', 'tech_admin_panel')]);
  }
  rows.push([Markup.button.callback('Закрыть', 'close_panel')]);
  return Markup.inlineKeyboard(rows);
}

function isMainAdmin(userId) {
  return process.env.MAIN_ADMIN === userId.toString();
}

async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId);
  return statuses.includes('Тех администратор');
}

async function isRegularAdmin(userId) {
  const statuses = await getUserStatuses(userId);
  return statuses.includes('Администратор');
}

async function isAdmin(userId) {
  return (
    isMainAdmin(userId) ||
    await isTechAdmin(userId) ||
    await isRegularAdmin(userId) ||
    await isModerator(userId)
  );
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function showAdminPanel(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!(await isAdmin(userId))) {
      return ctx.reply('❌ У вас нет прав для использования админ-панели.');
    }
    const users = await getAllUsers();
    const adminNumericIds = [1, 2, 3];
    const regularUsers = users.filter(user => !adminNumericIds.includes(user.numeric_id));
    const totalPlayers = regularUsers.length;
    const totalPF = regularUsers.reduce((sum, user) => sum + user.balance, 0);
    const totalDF = regularUsers.reduce((sum, user) => sum + (user.df_balance || 0), 0);
    const totalCardBalance = regularUsers.reduce((sum, user) => sum + (user.card_balance || 0), 0);
    const online5m = getActivePlayersCount(5 * 60 * 1000);
    const active24h = getActivePlayersCount(24 * 60 * 60 * 1000);

    const adminPanelMessage = `
📊 <b>Админ-панель</b> 📊

Количество игроков: ${formatNumber(totalPlayers)}
🟢 Онлайн (5 мин): ${formatNumber(online5m)}
📈 Активны за сутки: ${formatNumber(active24h)}

💰 Общий баланс PF: ${formatNumber(totalPF)}
💳 Общий баланс карт: ${formatNumber(totalCardBalance)}
🍩 Общее количество DF: ${formatNumber(totalDF)}

Выберите действие:
`.trim();

    await ctx.replyWithHTML(adminPanelMessage, getAdminPanelKeyboard(userId));
  } catch (error) {
    console.error('Ошибка при выводе админ-панели:', error);
    await ctx.reply('Произошла ошибка при загрузке админ-панели.');
  }
}

async function handleListAdmins(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!(await isAdmin(userId))) {
      return ctx.answerCbQuery('У вас нет прав для выполнения этого действия.');
    }
    const admins = await getUsersByStatuses([
      'Тех администратор', 'Главный админ', 'Администратор',
      'Руководитель партнёрки', 'Модератор'
    ]);
    if (admins.length === 0) {
      return ctx.reply('Список администраторов пуст.', { parse_mode: 'HTML' });
    }
    const adminList = admins.map(admin => {
      const username = admin.username || `User${admin.numeric_id}`;
      const userLink = `<a href="tg://user?id=${admin.id}">${username}</a>`;
      const statusLabel = `(${admin.status_names})`;
      return `- ${userLink} ${statusLabel} (${admin.numeric_id})`;
    });
    const adminListMessage = `<b>Список администраторов:</b>\n${adminList.join('\n')}`;
    await ctx.replyWithHTML(adminListMessage);
  } catch (error) {
    console.error('Ошибка при получении списка администраторов:', error);
    await ctx.reply('Произошла ошибка при получении списка администраторов.');
  }
}

async function handleAdminCommands(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!(await isAdmin(userId))) {
      return ctx.answerCbQuery('У вас нет прав для выполнения этого действия.');
    }
    const isTechAdminUser = await isTechAdmin(userId);
    const isRegularAdminUser = await isRegularAdmin(userId);
    const isModeratorUser = await isModerator(userId);

    const moderatorCommands = `
📄 <b>Список команд для модератора:</b>
🛡️  <b>Управление мутами:</b>
• Мут [id] [время в часах(по умолчанию)/мин]  [причина](необязательно)  - Замьютить пользователя
• Размут [id] - Размьютить пользователя
• Мутлист - Просмотреть список замьюченных пользователей
`;

    const adminCommands = `
📄 <b>Список команд для администратора:</b>
📣 <b>Управление репортами:</b>
• Список репортов - Просмотреть список неотвеченных репортов
• Ответить [номер_репорта] [текст_ответа] - Ответить на репорт
📛 <b>Управление черным списком:</b>
• Бан [id] [время в часах] или "навсегда" [причина] - Заблокировать пользователя
• Разбан [id] - Разблокировать пользователя
• ЧС - Просмотреть список заблокированных пользователей
🎮 <b>Игровые привилегии:</b>
•  <code>/id</code> либо <code>ид</code> [телеграм ид]/ответом на сообщение
•  <code>/prof</code> либо <code>гет</code> либо <code>чек</code> [id]/ответом на сообщение
`;

    const techAdminCommands = `
⚙️ <b>Для технических админов:</b>
💰  <b>Управление профилем пользователей:</b>
•  <code>Выдать пф [ID игрока] [число]</code> - Добавить PF пользователю
•  <code>Забрать пф [ID игрока] [число]</code> - Удалить PF у пользователя
•  <code>Все префиксы</code> - список всех существующих префиксов
•  <code>Выдать префикс [ID игрока] [номер]</code> - Добавить префикс пользователю
•  <code>Забрать префикс [ID игрока] [номер]</code> - Удалить префикс у пользователя
📛  <b>Управление черным списком:</b>
•  <code>Бан [id] [время в часах] или "навсегда" [причина]</code> - Заблокировать пользователя
•  <code>Разбан [id]</code> - Разблокировать пользователя
•  <code>ЧС</code> - Просмотреть список заблокированных пользователей
🛡️  <b>Управление мутами:</b>
•  <code>Мут [id] [время в часах(по умолчанию)/мин]  [причина](необязательно)</code> - Замьютить пользователя
•  <code>Размут [id]</code> - Размьютить пользователя
•  <code>Мутлист</code> - Просмотреть список замьюченных пользователей
🎟  <b>Управление промокодами:</b>
•  <code>Создать [количество] [название] [тип] [число]</code> - Создать новый промокод
•  <code>Удалить промо [ID промокода]</code> - Удалить существующий промокод
•  <code>Список промо</code> - Просмотреть список всех промокодов
📧 <b>Управление рассылками:</b>
• <code>Рассылка текст [текст]</code> - Отправить текстовую рассылку всем пользователям
• Рассылка цитата - Отправить цитату всем пользователям
💭  <b>Управление режимами чатов:</b>
•  <code>Деактивировать дабл/дайс</code> - Деактивировать режим в чате
 <b>Управление репортами:</b>
•  <code>Список репортов</code> - Просмотреть список неотвеченных репортов
•  <code>Ответить [номер_репорта] [текст_ответа]</code> - Ответить на репорт
 <b>Управление статусами:</b>
•  <code>Список статусов</code> - Просмотреть список всех статусов
•  <code>Наградить [numeric_id] [id_статуса]</code> - Назначить статус пользователю
•  <code>Разжаловать [numeric_id] [id_статуса]</code> - Забрать статус пользователя
👾  <b>Босс:</b>
•  <code>новый_босс</code> - создать/сбросить босса
•  <code>проверить_босстоп</code> - информация о топерах босса
•  <code>топ_кулаков</code> - топ по прокачке
•  <code>список_оружия</code> [id игрока] - выводит инфу о оружии игрока
•  <code>снятьхп</code> [количество] - снимает здоровье у босса
•  <code>дать_энергию</code> [id игрока] [количество]- дает энергию
•  <code>забрать_энергию</code> [id игрока] [количество]- забирает энергию
👨‍⚖  <b>Аукцион:</b>
•  <code>Новый_аукцион</code> [сумма минимальной ставки] [минимальный шаг перебития] [название лота]- начинает новый аук
•  <code>Завершить_аукцион</code> - завершает аук
•  <code>аук_инфо</code> - информация о ставках аукциона
⚙️  <b>Технические команды:</b>
• /delete [id_игрока] - удалить аккаунт игрока
•  <code>/changeid [старый ид] [новый ид]</code> - заменить ид игрока на новый
•  <code>/свободныеид</code> - список свободных ид
•  <code>/id</code> либо <code>ид</code> [телеграм ид]/ответом на сообщение
•  <code>/prof</code> либо <code>гет</code> либо <code>чек</code> [id]/ответом на сообщение
•  <code>Размер</code> - Получить размер базы данных
•  <code>Бэкап</code> - Создать и отправить резервную копию базы данных
•  <code>Сменить_реф [id] [новая_сумма]</code>
•  <code>Сменить_реф_бонус_30000</code> - меняет реф бонус на 10.000 PF всем игрокам бота 
•  <code>Дать [id/telegram_id] [тип_предмета] [количество]</code> - выдать чтото
•  <code>Забор [id/telegram_id] [тип_предмета] [количество]</code> - забрать чтото
•  <code>Проверить_топ</code> - инфа о топерах
•  <code>Проверить_рефтоп</code> - инфа о реф топерах
•  <code>Проверить_конт</code> - инфа по держателям контейнеров
•  <code>Проверить_карты</code> - инфа о балансах карт
•  <code>Проверить_статусы</code> - инфа о статусниках
•  <code>Проверить_акции</code> - инфа о топ 10 акционеров
•  <code>Проверить_дф</code> - инфа о главных держателях DF
•  <code>Чек_скин [название файла]</code> - выводит изображение по файлу
•  <code>Выдать_скин [id игрока] [id скина]</code> - выдача скина игроку
•  <code>Забрать_скин [id игрока] [id скина]</code> - отнятие скина у игрока
•  <code>Блок_переводы [id игрока]</code> - блокировка переводов игроку
•  <code>Разблок_переводы [id игрока]</code> -разблокировка переводов игроку
•  <code>/reset [id игрока]</code> - обнуление аккаунта игрока с сохранением ид
•  <code>Реф_вычесть [id игрока] [количество]</code> - вычитаем рефералы у игрока
•  <code>Блок_топа [id игрока]</code> - Убирает отображение игрока в топе пф
•  <code>Разблок_топа [id игрока]</code> - Возвращает отображение в топе пф
•  <code>Объявление</code> [текст] - созвать всех в чате
•  <code>Создать_префикс</code> [название] - создаёт специальный префикс
•  <code>Выдать_спец_префикс</code> [id игрока] [id префикса] - выдаёт игроку спец префикс
•  <code>Забрать_спец_префикс</code> [id игрока] [id префикса] - забирает у игрока спец префикс
•  <code>Удалить_репорт</code> [id репорта] - удаляет репорт
•  <code>Сменить_ник</code> [id игрока] [новый ник]- меняет ник игроку
•  <code>смс</code> [id игрока] [текст]- отправляет приватное сообщение игроку
• <code>Проверить_скины</code> [id игрока]/без ид - выводит список скинов конкретного игрока/всех существующих скинов
• <code>новая_цена</code> [id скина] [новая_цена] - меняет цену скина
🍬 <b>Конфеты:</b>
• <code>выдать_конфеты</code> [id] [количество] - выдать конфеты
• <code>забрать_конфеты</code> [id] [количество] - забрать конфеты
`;

    let commandsMessage;
    if (isTechAdminUser) {
      commandsMessage = techAdminCommands;
    } else if (isRegularAdminUser) {
      commandsMessage = adminCommands;
    } else if (isModeratorUser) {
      commandsMessage = moderatorCommands;
    } else {
      return ctx.reply('❌ У вас нет доступа к списку админских команд.');
    }

    const maxMessageLength = 4096;
    for (let i = 0; i < commandsMessage.length; i += maxMessageLength) {
      const chunk = commandsMessage.slice(i, i + maxMessageLength);
      await ctx.replyWithHTML(chunk);
    }
  } catch (error) {
    console.error('Ошибка при выводе списка админских команд:', error);
    await ctx.reply('Произошла ошибка при получении списка админских команд.');
  }
}

async function handleClosePanel(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!(await isAdmin(userId))) {
      return ctx.answerCbQuery('У вас нет прав для выполнения этого действия.');
    }
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('Админ-панель закрыта.');
  } catch (error) {
    console.error('Ошибка при закрытии админ-панели:', error);
    await ctx.reply('Произошла ошибка при закрытии админ-панели.');
  }
}

async function handleTechAdminPanelButton(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!isTechSuperAdmin(userId)) {
      return ctx.answerCbQuery('❌ У вас нет доступа к тех админ панели.', { show_alert: true });
    }
    try {
      const { showTechAdminPanel } = require('./techAdminPanel');
      await showTechAdminPanel(ctx);
    } catch (importErr) {
      console.error('[TechAdminPanel] Не удалось импортировать техадмин-панель:', importErr.message);
      await ctx.editMessageText(
        '🛠 <b>Тех админ панель</b>\n\n' +
        '⚠️ Модуль техадмин-панели ещё не подключён.',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Назад', 'back_to_admin_panel')]
          ])
        }
      );
    }
    return ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка при открытии тех админ панели:', error);
    await ctx.answerCbQuery('Произошла ошибка при открытии тех админ панели.', { show_alert: true });
  }
}

async function handleBackToAdminPanel(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!(await isAdmin(userId))) {
      return ctx.answerCbQuery('У вас нет прав для выполнения этого действия.');
    }
    await ctx.deleteMessage().catch(() => {});
    await showAdminPanel(ctx);
    return ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка при возврате в админ-панель:', error);
    await ctx.reply('Произошла ошибка при возврате в админ-панель.');
  }
}

module.exports = {
  showAdminPanel,
  handleListAdmins,
  handleAdminCommands,
  handleClosePanel,
  handleTechAdminPanelButton,
  handleBackToAdminPanel,
  isAdmin,
  isTechAdmin,
  isTechSuperAdmin,
  getTechSuperAdminIds,
};