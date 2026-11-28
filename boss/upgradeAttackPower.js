//upgradeAttackPower.js
const { Markup } = require('telegraf');
const { updateUserBalance, getUserById, getCurrentWeaponDurability, getMaxEnergyByStatus, getCurrentEnergy, isHyperlinkDisabled, updateAttackPower, reduceUserEnergy, getWeaponByName, setActiveWeapon, getActiveWeapon, getAllWeapons } = require('../db');
const { getTimeUntilNextEnergyRestore } = require('./energyHandler')

// Функция для форматирования чисел
function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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


// Функция для повышения силы урона
const upgradeAttackPower=require('../src/telegram/attackUpgrade').createAttackUpgradeHandler({upgrade:require('../db').purchaseAttackUpgrade,getUserById,isHyperlinkDisabled,link:createUserLink,format:formatNumber});

async function showSkillUpgradeMenu(ctx) {
  try {
    // Проверяем наличие ctx.from
    if (!ctx.from) {
      console.error('[ERROR] ctx.from is null or undefined');
      return await ctx.reply('❌ Ошибка: Не удалось получить данные пользователя.');
    }

    const userId = ctx.from.id.toString();
    console.log('[DEBUG] User ID:', userId);

    // Получаем данные пользователя
    const user = (await getUserById(userId));
    console.log('[DEBUG] User data:', user);

    if (!user) {
      console.error(`[ERROR] Пользователь с ID ${userId} не найден.`);
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, (await isHyperlinkDisabled(userId)));

    // Получаем активное оружие
    const activeWeapon = (await getActiveWeapon(userId));
    console.log('[DEBUG] Active weapon:', activeWeapon);

    // Вычисляем итоговую силу урона
    const totalDamage =
      activeWeapon && activeWeapon.base_damage
        ? activeWeapon.base_damage
        : user.attack_power || 1;

    console.log('[DEBUG] Total damage:', totalDamage);

    // Рассчитываем стоимость следующей прокачки удара атаки
    const currentAttackPower = user.attack_power || 1;
    const nextUpgradeCost = 100 * currentAttackPower;

    // Получаем текущую прочность активного оружия
    let durabilityInfo = '';
    if (activeWeapon && activeWeapon.name !== 'Кулак') {
      const currentDurability = (await getCurrentWeaponDurability(userId, activeWeapon.id));
      const maxDurability = activeWeapon.durability;
    
      if (currentDurability === 0) {
        durabilityInfo = `🔧 Прочность: <b>Сломано</b>`;
      } else {
        durabilityInfo = `🔧 Прочность: <b>${currentDurability}/${maxDurability}</b>`;
      }
    } else {
      durabilityInfo = `🔧 Прочность: <b>Бесконечная</b>`;
    }

    // Формируем сообщение
    const message = `
ℹ️ ${userLink}, <b>меню прокачки навыков</b>

🔫 Активное оружие: <b>${activeWeapon ? activeWeapon.name : 'Кулаки'}</b>

    ⚔️ Сила урона: <b>${formatNumber(totalDamage)}</b>
    ${durabilityInfo}

💰 Стоимость следующей прокачки: <b>${formatNumber(nextUpgradeCost)} PF</b>
    `.trim();

    // Создаем клавиатуру с кнопками
    const keyboard = {
      inline_keyboard: [
        [{ text: `💪 Прокачать удар атаки (${formatNumber(nextUpgradeCost)} PF)`, callback_data: 'upgrade_attack_power' }], // Прокачка кулака
        [
          { text: '🔫 Сменить оружие', callback_data: 'change_weapon' }, // Смена оружия
          { text: '🛒 Магазин оружия', callback_data: 'weapon_shop' }, // Магазин оружия
        ],
        [{ text: '⬅️ Назад в меню', callback_data: 'back_to_boss_handler' }], // Назад
      ],
    };

    console.log('[DEBUG] Keyboard:', keyboard);

    // Отправляем сообщение с кнопками
    await ctx.replyWithHTML(`${message}`, { reply_markup: keyboard });
  } catch (error) {
    console.error('[showSkillUpgradeMenu] Ошибка:', error);
    await ctx.reply('Произошла ошибка при отображении меню прокачки навыков.');
  }
}


async function changeWeapon(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя
    const user = (await getUserById(userId));
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, (await isHyperlinkDisabled(userId)));

    // Преобразуем active_weapon в число
    const activeWeaponId = parseInt(user.active_weapon, 10);

    // Преобразуем owned_weapons в массив чисел
    let ownedWeaponsIds = [];
    try {
      ownedWeaponsIds = JSON.parse(user.owned_weapons || '[]').map(Number);
    } catch (error) {
      console.error(`[ERROR] Невозможно распарсить owned_weapons для пользователя ${userId}:`, error);
    }

    // Получаем все виды оружия из базы данных
    const weapons = (await getAllWeapons());

    // Фильтруем оружия, которые есть у игрока
    const ownedWeapons = weapons.filter((weapon) => ownedWeaponsIds.includes(weapon.id));

    // Добавляем "Кулак" в список доступных оружий
    const defaultWeapon = (await getWeaponByName('Кулак')); // Получаем кулак из базы данных
    if (!defaultWeapon) {
      return await ctx.reply('❌ Ошибка: Кулак не найден.');
    }

    // Если у игрока нет других оружий, список будет содержать только "Кулак"
    const availableWeapons = [defaultWeapon, ...ownedWeapons];

    // Формируем список доступных оружий
    const weaponList = availableWeapons.map((weapon) => {
      // Если это кулак, используем attack_power пользователя
      const damage = weapon.name === 'Кулак' ? user.attack_power : weapon.base_damage;

      // Проверяем, является ли это оружие активным
      const isActive = parseInt(weapon.id, 10) === activeWeaponId;

      // Добавляем галочку к активному оружию
      const weaponNameWithCheckmark = isActive ? `✅ ${weapon.name}` : weapon.name;

      return {
        text: `${weaponNameWithCheckmark} (${formatNumber(damage)} урона)`,
        callback_data: `select_weapon_${weapon.id}`,
      };
    });

    // Создаем клавиатуру с оружием
    const keyboard = {
      inline_keyboard: [
        ...weaponList.map((weapon) => [weapon]), // Каждое оружие в отдельной строке
        [{ text: '⬅️ Назад', callback_data: 'back_to_skill_upgrade_menu' }], // Кнопка "Назад"
      ],
    };

    // Отправляем сообщение с выбором оружия
    await ctx.replyWithHTML(`🔫 ${userLink}, выберите активное оружие:`, { reply_markup: keyboard });
  } catch (error) {
    console.error('[changeWeapon] Ошибка:', error);
    await ctx.reply('Произошла ошибка при смене оружия.');
  }
}

// Функция для отображения магазина оружия
async function weaponShop(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя
    const user = (await getUserById(userId));
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, (await isHyperlinkDisabled(userId)));

    const currentBalance = user.balance || 0;
    const ownedWeaponsIds = user.owned_weapons || [];
    const weapons = (await getAllWeapons()); // Получаем все виды оружия из базы данных

    // Исключаем кулак из списка оружий
    const availableWeapons = weapons.filter(
      (weapon) => weapon.name !== 'Кулак' && !ownedWeaponsIds.includes(weapon.id)
    );

    // Если нет доступных для покупки оружий
    if (availableWeapons.length === 0) {
      return await ctx.reply(`❌ Магазин оружия пуст.`);
    }

    // Формируем список доступных для покупки оружий
    const keyboard = {
      inline_keyboard: availableWeapons.map((weapon) => [
        {
          text: `${weapon.name} (${formatNumber(weapon.price)} PF)`,
          callback_data: `view_weapon_${weapon.id}`,
        },
      ]),
    };

    // Добавляем кнопку "Назад"
    keyboard.inline_keyboard.push([
      { text: '⬅️ Назад', callback_data: 'back_to_skill_upgrade_menu' },
    ]);

    // Отправляем сообщение с выбором оружия
    await ctx.replyWithHTML(
      `🛒 ${userLink}, <b>магазин оружия</b>\n\n` +
      `💰 Ваш баланс: <b>${formatNumber(currentBalance)} PF</b>\n\n` +
      `Выберите оружие для просмотра информации:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('[weaponShop] Ошибка:', error);
    await ctx.reply('Произошла ошибка при отображении магазина оружия.');
  }
}

// Функция для покупки оружия
const buyWeapon=require('../src/telegram/weaponCheckout').createWeaponCheckout({purchase:require('../db').purchaseWeapon,menu:weaponShop,format:formatNumber});


module.exports = {
  upgradeAttackPower,
  showSkillUpgradeMenu,
  changeWeapon,
  weaponShop,
  buyWeapon
};