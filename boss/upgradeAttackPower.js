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
async function upgradeAttackPower(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Получаем данные пользователя из базы данных
    const user = getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

    // Текущий уровень силы урона
    const currentAttackPower = user.attack_power || 1; // Базовое значение = 1

    // Рассчитываем стоимость следующей прокачки
    const nextUpgradeCost = 100 * currentAttackPower;

    // Проверяем баланс пользователя
    const currentBalance = user.balance || 0;
    if (currentBalance < nextUpgradeCost) {
      return await ctx.reply(
        `❌ ${userLink}, недостаточно PF для повышения силы урона. Требуется ${formatNumber(nextUpgradeCost)} PF.`
      );
    }

    // Получаем максимальную энергию для пользователя
    const maxEnergy = getMaxEnergyByStatus(userId); // Динамическое значение максимальной энергии

    // Проверяем текущую энергию пользователя
    const currentEnergy = getCurrentEnergy(userId);
    if (currentEnergy <= 0) {
      const energyInfo = getTimeUntilNextEnergyRestore(userId);
      if (!energyInfo) {
        return await ctx.reply(`❌ ${userLink}, не удалось получить информацию о вашей энергии.`);
      }
      const { currentEnergy: updatedEnergy, nextRestoreTime } = energyInfo;
      const now = Math.floor(Date.now() / 1000);

      // Если энергия уже максимальная
      if (updatedEnergy >= maxEnergy) {
        return await ctx.replyWithHTML(
          `⚡️ ${userLink}, ваша энергия максимально заполнена: <b>${updatedEnergy}/${maxEnergy}</b>`
        );
      }

      // Время до следующего восстановления энергии
      const timeLeft = Math.max(nextRestoreTime - now, 0);
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;

      return await ctx.replyWithHTML(
        `❌ ${userLink}, у вас недостаточно энергии для улучшения силы урона. ` +
        `Подождите, пока она восстановится.\n\n` +
        `⚡️ Текущая энергия: <b>${updatedEnergy}/${maxEnergy}</b>\n` +
        `⏳ Пополнение энергии: <b>${minutes} мин ${seconds} сек</b>`,
        {
          reply_markup: Markup.inlineKeyboard([
            Markup.button.callback('↩️ Назад в меню', 'back_to_menu'),
          ]),
        }
      );
    }

    // Уменьшаем баланс пользователя
    try {
      updateUserBalance(userId, -nextUpgradeCost); // Вызываем функцию обновления баланса
    } catch (error) {
      console.error('[upgradeAttackPower] Ошибка при обновлении баланса:', error.message);
      return await ctx.reply(`❌ ${userLink}, произошла ошибка: ${error.message}`);
    }

    // Снимаем одну единицу энергии
    reduceUserEnergy(userId);

    // Повышаем силу урона
    const newAttackPower = currentAttackPower + 1;
    updateAttackPower(userId, newAttackPower);

    // Получаем обновленные данные пользователя
    const updatedUser = getUserById(userId);
    const updatedBalance = updatedUser.balance || 0;

    // Создаем клавиатуру с кнопкой для повторной прокачки
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: `💪 Прокачать удар атаки (${formatNumber(100 * newAttackPower)} PF)`,
            callback_data: 'upgrade_attack_power',
          },
        ],
      ],
    };

    // Отправляем сообщение об успешном повышении
    await ctx.replyWithHTML(
      `⚔️ ${userLink}, сила урона успешно повышена!\n\n` +
      `➖ Списано с баланса: -<b>${formatNumber(nextUpgradeCost)} PF</b>\n\n` +
      `⚔️ Текущая сила урона: <b>${newAttackPower}</b>\n` +
      `💰 Оставшийся баланс PF: <b>${formatNumber(updatedBalance)}</b>\n` +
      `⚡️ Энергия: <b>${currentEnergy - 1}/${maxEnergy}</b>`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('[upgradeAttackPower] Ошибка:', error);
    await ctx.reply('Произошла ошибка при попытке улучшить силу урона.');
  }
}

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
    const user = getUserById(userId);
    console.log('[DEBUG] User data:', user);

    if (!user) {
      console.error(`[ERROR] Пользователь с ID ${userId} не найден.`);
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

    // Получаем активное оружие
    const activeWeapon = getActiveWeapon(userId);
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
      const currentDurability = getCurrentWeaponDurability(userId, activeWeapon.id);
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
    const user = getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

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
    const weapons = getAllWeapons();

    // Фильтруем оружия, которые есть у игрока
    const ownedWeapons = weapons.filter((weapon) => ownedWeaponsIds.includes(weapon.id));

    // Добавляем "Кулак" в список доступных оружий
    const defaultWeapon = getWeaponByName('Кулак'); // Получаем кулак из базы данных
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
    const user = getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));

    const currentBalance = user.balance || 0;
    const ownedWeaponsIds = user.owned_weapons || [];
    const weapons = getAllWeapons(); // Получаем все виды оружия из базы данных

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
async function buyWeapon(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const weaponId = parseInt(ctx.match[1], 10); // Извлекаем ID оружия из callback_data

    // Получаем данные пользователя
    const user = getUserById(userId);
    if (!user) {
      return await ctx.reply('❌ Пользователь не найден.');
    }

    // Формируем обращение к пользователю
    const userLink = createUserLink(userId, user.username, isHyperlinkDisabled(userId));
    const currentBalance = user.balance || 0;
    const ownedWeaponsIds = user.owned_weapons || [];
    const weapons = getAllWeapons(); // Получаем все виды оружия из базы данных

    // Находим оружие по ID
    const weapon = weapons.find((w) => w.id === weaponId);
    if (!weapon) {
      return await ctx.reply(`${userLink}, ❌ оружие не найдено.`);
    }

    // Проверяем баланс пользователя
    if (currentBalance < weapon.price) {
      return await ctx.reply(
        `${userLink}, ❌ недостаточно PF для покупки оружия. Требуется ${formatNumber(weapon.price)} PF.`
      );
    }

    // Проверяем, не куплено ли оружие
    if (ownedWeaponsIds.includes(weapon.id)) {
      return await ctx.reply(`${userLink}, ❌ это оружие уже куплено.`);
    }

    // Уменьшаем баланс пользователя
    updateUserBalance(userId, -weapon.price);

    // Добавляем оружие в список купленных
    const updatedOwnedWeapons = [...ownedWeaponsIds, weapon.id];
    db.prepare('UPDATE users SET owned_weapons = ? WHERE id = ?').run(
      JSON.stringify(updatedOwnedWeapons),
      userId
    );

  // Добавляем запись о прочности оружия
  const durabilityStmt = db.prepare(`
    INSERT INTO user_weapon_durability (user_id, weapon_id, current_durability)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, weapon_id) DO UPDATE SET
      current_durability = excluded.current_durability
  `);

  durabilityStmt.run(userId, weapon.id, weapon.durability);
  console.log(`[WEAPONS] Прочность оружия "${weapon.name}" инициализирована для пользователя ${userId}.`);

    // Создаем клавиатуру с кнопками
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔫 Применить оружие', callback_data: 'change_weapon' }], // Смена оружия
        [{ text: 'Закрыть', callback_data: 'close_message' }], // Закрыть сообщение
      ],
    };

    // Отправляем сообщение об успешной покупке
    await ctx.replyWithHTML(
      `${userLink}, 🛒 <b>Покупка завершена!</b>\n` +
        `➖ Списано с баланса: -<b>${formatNumber(weapon.price)} PF</b>\n` +
        `🔫 Вы купили: <b>${weapon.name}</b>\n` +
        `⚔️ Сила урона: <b>${formatNumber(weapon.base_damage)}</b>\n` +
        `🔧 Прочность: <b>${weapon.durability === -1 ? 'Бесконечная' : weapon.durability}</b>\n` +
        `💰 Оставшийся баланс PF: <b>${formatNumber(currentBalance - weapon.price)}</b>`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('[buyWeapon] Ошибка:', error);
    await ctx.reply('Произошла ошибка при покупке оружия.');
  }
}


module.exports = {
  upgradeAttackPower,
  showSkillUpgradeMenu,
  changeWeapon,
  weaponShop,
  buyWeapon
};