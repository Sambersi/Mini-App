require('dotenv').config();
const { Markup } = require('telegraf');
const { getUserById } = require('../db');

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный'; // Используем имя из БД или "Неизвестный"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

// Содержание страниц
const pages = [
  `
📖 Вы открыли меню помощи! 

🗃 <b>Содержание:</b>
  
<b>💠 Важные</b> - стр. 1
<b>🎮 Игровые</b> - стр. 2
<b>🏦 Финансовые команды</b> - стр. 3
<b>👥 Реферальная система</b> - стр. 4
<b>📦 Для работы с контейнерами</b> - стр. 5
<b>📇 Для работы с префиксами</b> - стр. 6
<b>💬 Только в беседах</b> - стр. 7
  `,
  `
<b>💠 Важные:</b>

    • <code>/start</code> - Регистрация в боте
    • <code>/help</code> / <code>помощь</code> - Вывод списка команд
    • <code>ник</code> - Информация о смене ника
    • <code>конкурс</code> - Информация о реферальном конкурсе
    • <code>донат</code> - Открывает меню доната или показывает информацию о донате
    • <code>репорт</code> [текст] - Задать вопрос/отправить жалобу
    • <code>уведы выкл</code> — Отключает уведомления о пополнениях и списаниях баланса.
    • <code>уведы вкл</code> — Включает уведомления о пополнениях и списаниях баланса.
    • <code>Анонимность</code> - Скрывает/раскрывает гиперссылку на игрока в топе
    • <code>Сотрудничество</code> - Для владельцев каналов
    • <code>Аукцион</code> - информация об аукционе 

▫️ Страница 1/7
  `,
  `
<b>🎮 Игровые:</b>

    • <code>профиль</code> - Посмотреть свой профиль
    • <code>баланс</code> - Проверить текущий баланс
    • <code>бонус</code> - Получить ежедневный бонус
    • <code>промо</code> [название промокода] - Ввести промокод
    • <code>топ</code> / <code>рейтинг</code> / <code>форбс</code> - Топ игроков по балансу PF
    • <code>скины</code> - Открывает магазин скинов или показывает доступные скины
    • <code>казино</code> [ставка] - Выполняется ставка в казино, грузит слот
    • <code>дабл</code> - Вызывает информацию о режимах дабла и дайсах + игровой чат

▫️ Страница 2/7
  `,
  `
<b>🏦 Финансовые команды:</b>

    • <code>банк</code> - Информация о банке
    • <code>карта</code> - Создать или просмотреть свою банковскую карту
    • <code>пополнить</code> [сумма] - Пополнить баланс карты
    • <code>снять</code> [сумма] - Снять деньги с банковской карты
    • <code>перевод</code> / <code>передать</code> [ID игрока]/ответ на сообщение [сумма] - Перевести PF другому пользователю

▫️ Страница 3/7
  `,
  `
<b>👥 Реферальная система:</b>

    • <code>реф</code> - Получить реферальную ссылку
    • <code>рефы</code> - Посмотреть список своих рефералов
    • <code>топ_рефералов</code> - Увидеть топ по количеству рефералов

▫️ Страница 4/7
  `,
  `
<b>📦 Команды для работы с контейнерами:</b>

    • <code>контейнеры</code> - Показать количество доступных контейнеров
    • <code>контейнер открыть</code> [номер] [количесвто если есть требуемый статус]- Открыть контейнер и получить случайный приз
    • <code>контейнер купить</code> [номер] [количество] - Купить контейнер

▫️ Страница 5/7
  `,
  `
<b>💬 Только в беседах:</b>

<b>🕹 Для DOUBLE PLUS:</b>
   • <code>2</code>/<code>3</code>/<code>5</code>/<code>игра</code> [ставка] - Совершение ставки на один из доступных множителей
   • <code>активировать дабл</code> - Активировать режим Double (если у вас достаточно PF)
   • <code>банк</code> - Просмотреть текущие ставки в Double
    
<b>🎲 Для DICE:</b>
    • <code>дайс</code> [ставка] - Сделать ставку в Double (например: "дайс 100")
    • <code>активировать дайс</code> - Активировать режим Dice (если у вас достаточно PF)
    • <code>банк</code> - Просмотреть текущие ставки в DICE

▫️ Страница 6/7
  `,
  `
<b>📇 Команды для работы с префиксами:</b>

    • <code>мои префиксы</code> - Показывает список доступных пользователю префиксов
    • <code>установить префикс</code> [ID префикса] - Устанавливает активный префикс из доступных

▫️ Страница 7/7
  `,
];    

// Функция для создания клавиатуры
function createHelpKeyboard(currentPage) {
  const keyboard = [];
  if (currentPage > 0) {
    keyboard.push(Markup.button.callback('⬅️ Назад', `help_page_${currentPage - 1}`));
  }
  if (currentPage < pages.length - 1) {
    keyboard.push(Markup.button.callback('➡️ Вперёд', `help_page_${currentPage + 1}`));
  }
  return Markup.inlineKeyboard(keyboard);
}

// Обработка команды /help
async function helpHandler(ctx) {
  try {
    const userId = ctx.from.id;
    const userFromDb = await getUserById(userId.toString());
    const username = userFromDb?.username || 'Неизвестный';

    // Отправляем первую страницу
    const message = pages[0];
    const keyboard = createHelpKeyboard(0);

    if (ctx.chat.type === 'private') {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } else {
      const userLink = createUserLink(userId, username);
      await ctx.reply(`${userLink}, доступные команды:\n\n${message}`, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    }
  } catch (error) {
    console.error('Ошибка при обработке команды /help:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Обработчик кнопок "Вперёд" и "Назад"
async function handleHelpNavigation(ctx) {
  try {
    const currentPage = parseInt(ctx.match[1]); // Извлекаем номер страницы из callback_data
    const message = pages[currentPage];
    const keyboard = createHelpKeyboard(currentPage);

    // Редактируем сообщение с новой страницей
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (error) {
    console.error('Ошибка при навигации по справке:', error);
    await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
  }
}

module.exports = { helpHandler, handleHelpNavigation };