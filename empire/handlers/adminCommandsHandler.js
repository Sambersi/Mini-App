// empire/handlers/adminCommandsHandler.js
const { getUserById, getUserByNumericId } = require('../../db'); // Добавляем импорт getUserByNumericId
const { createBusiness, getUserBusinesses } = require('../db'); // Импортируем getUserBusinesses
const { BUSINESS_TYPES_MAP, getBusinessTypeNameById } = require('../logic/businessLogic'); // Для проверки ID типа и получения строкового имени

// Обработчик команды /give_business
async function giveBusinessHandler(ctx) {
  // Проверка прав (например, тех администратора)
  const isAdmin = await require('../../admin/adminPanel').isTechAdmin(ctx.from.id.toString()); // Импортируем проверку прав
  if (!isAdmin) {
    return ctx.reply('❌ У вас нет прав для использования этой команды.');
  }

  // Парсим аргументы: /give_business numeric_id_user type_id
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length !== 2) {
    return ctx.reply('❌ Неверный формат команды. Использование: /give_business [NUMERIC_ID_ИГРОКА] [ID_ТИПА_БИЗНЕСА]\n\nДоступные ID типов бизнеса:\n' + Object.entries(BUSINESS_TYPES_MAP).map(([id, info]) => `• ${id} - ${info.config.name}`).join('\n'));
  }

  const numericId = parseInt(args[0], 10);
  const typeId = parseInt(args[1], 10);

  // Валидация аргументов
  if (isNaN(numericId) || isNaN(typeId)) {
    return ctx.reply('❌ Некорректный NUMERIC_ID или ID_ТИПА_БИЗНЕСА. Убедитесь, что вы ввели числа.');
  }

  // Проверка, существует ли тип бизнеса с таким ID
  if (!BUSINESS_TYPES_MAP[typeId]) {
    return ctx.reply(`❌ Бизнес с ID ${typeId} не найден. Проверьте список доступных ID.`);
  }

  // --- ИСПРАВЛЕНИЕ: Используем getUserByNumericId вместо getUserById ---
  // getUserByNumericId(numericId) возвращает объект пользователя, где id - это Telegram ID
  const user = getUserByNumericId(numericId); // getUserByNumericId ожидает число или строку
  if (!user) {
    return ctx.reply(`❌ Игрок с NUMERIC_ID ${numericId} не найден.`);
  }

  const telegramId = user.id; // Telegram ID из найденной записи

  // --- НОВОЕ: Проверка на наличие бизнеса этого типа у игрока ---
  const userBusinesses = getUserBusinesses(telegramId);
  const businessTypeName = getBusinessTypeNameById(typeId); // Получаем строковое имя типа (например, 'mine')
  if (!businessTypeName) {
      // Это маловероятно, если typeId прошёл проверку выше, но на всякий случай
      console.error(`[adminCommands] Не удалось получить строковое имя для typeId ${typeId}`);
      return ctx.reply(`❌ Произошла внутренняя ошибка при определении типа бизнеса.`);
  }

  const existingBusiness = userBusinesses.find(business => business.type === businessTypeName);
  if (existingBusiness) {
      const businessConfig = BUSINESS_TYPES_MAP[typeId].config;
      return ctx.reply(`❌ У игрока ${user.username} уже есть бизнес типа "${businessConfig.name}". Невозможно выдать второй.`);
  }
  // --- КОНЕЦ НОВОГО ---

  // Пытаемся создать бизнес в базе империй
  const success = createBusiness(telegramId, typeId); // Передаем Telegram ID и ID типа

  if (success) {
    const businessName = BUSINESS_TYPES_MAP[typeId].config.name;
    await ctx.reply(`✅ Бизнес "${businessName}" успешно выдан игроку ${user.username} (NUMERIC_ID: ${numericId}, TELEGRAM_ID: ${telegramId}).`);
    console.log(`[ADMIN] Администратор ${ctx.from.id} выдал бизнес ID ${typeId} (тип: ${businessTypeName}) игроку ${telegramId} (NUMERIC_ID: ${numericId})`);
  } else {
    await ctx.reply(`❌ Не удалось выдать бизнес игроку ${user.username}.`);
  }
}

module.exports = {
  giveBusinessHandler
};
