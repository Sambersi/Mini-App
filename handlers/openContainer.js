const { Telegraf, Markup } = require('telegraf'); // Импортируем Markup для создания инлайн-кнопок
const { 
  getUserById, 
  updateUserBalance, 
  updateUserBalanceByNumericId,
  decreaseContainerCount,
  updateUserNpfShares,
  awardStatusToUser, // Функция для выдачи статуса
  addSkinToUser, // Функция для добавления скина
  getAllPrefixes,
  addPrefixToUser,
  getAllSkins,
  getSkinIdByName,
  getUserAvailableSkins,
  getCardTemplateById,
  getUserStatuses,
  beginTransaction,
  rollbackTransaction,
  updateContainerCount,
  commitTransaction,
  updateUserDFBalance
} = require('../db');
const { logError } = require('../utils/errorHandler'); // Импортируем logError
const path = require('path');
const fs = require('fs');

// Конфигурация шансов и призов для контейнеров
const containerRewards = {
  1: [ // CLASSIC Контейнер (1 приз)
    { type: 'PF', min: 3000, max: 9000, chance: 85 }, // от 3.000 до 10.000 PF шанс 85%
    { type: 'DF', min: 1, max: 6, chance: 0.1 },
    { type: 'status', name: 'GOLD', chance: 0.0001 },
    { type: 'prefix', chance: 1.5 }, // Новый тип награды: префикс
    { type: 'nothing', chance: 15 }, // ничего
  ],
  2: [ // PREMIUM Контейнер (1-2 приза, шанс 30% на второй приз)
    { type: 'PF', min: 10000, max: 30000, chance: 80 }, 
    { type: 'DF', min: 2, max: 9, chance: 0.2 },
    { type: 'status', name: ['GOLD', 'PLATINUM'], chance: 0.001 },   
    { type: 'skin', rarity: ['ORDINARY', 'EPIC'], chance: 0.5 },
    { type: 'npf_shares', min: 1, max: 5, chance: 5 },
    { type: 'prefix', chance: 3 }, //тип награды: префикс
    { type: 'nothing', chance: 12 },
  ],
  3: [ // GOLD Контейнер (1-3 приза, шанс 20% на второй и 10% на третий)
    { type: 'PF', min: 3000, max: 35000, chance: 80 }, 
    { type: 'DF', min: 10, max: 100, chance: 5 },
    { type: 'status', name: ['GOLD', 'PLATINUM', 'DIAMOND'], chance: 0.01 },//0.01
    { type: 'skin', rarity: ['ORDINARY', 'EPIC', 'LEGENDARY'], chance: 3 },
    { type: 'npf_shares', min: 5, max: 10, chance: 6 },
    { type: 'prefix', chance: 8 }, //  тип награды: префикс
    { type: 'nothing', chance: 10 },
  ]
};

// В начале файла добавьте:
const allowedSkinNamesForDrop = [
  'Red тян',
  'Паук',
  'Кошка-девочка'
];

// Функция для генерации случайного числа в диапазоне
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Функция для выбора случайного приза из массива
function getRandomReward(rewardOptions) {
  const totalChance = rewardOptions.reduce((sum, option) => sum + option.chance, 0);
  const randomValue = Math.random() * totalChance;

  let cumulativeChance = 0;
  for (const option of rewardOptions) {
    cumulativeChance += option.chance;
    if (randomValue < cumulativeChance) {
      return option;
    }
  }

  // Если ничего не выбрано (должно быть редко), возвращаем первый вариант
  return rewardOptions[0];
}

async function handleReward(userId, reward, user) {
  let rewardMessage = '';
  switch (reward.type) {
    case 'PF':
      const pfAmount = getRandomInt(reward.min, reward.max);
      await updateUserBalance(userId, pfAmount);
      rewardMessage = `💰 Вы получили ${pfAmount} PF.`;
      break;

    case 'DF':
      const dfAmount = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
      const updateResult = await updateUserDFBalance(user.id, dfAmount);
      
      if (updateResult.success) {
          rewardMessage = `💎 Вы получили ${dfAmount} DF.`;
      } else {
          rewardMessage = `❌ Ошибка при начислении DF: ${updateResult.message}`;
      }
      break;

    case 'status':
      const statusName = Array.isArray(reward.name)
        ? reward.name[Math.floor(Math.random() * reward.name.length)]
        : reward.name;

      // Начисляем статус пользователю
      await awardStatusToUser(userId, statusName);

      // Формируем основное сообщение о награде
      rewardMessage = `🌟 Вы получили статус: ${statusName}.`;
      break;

    case 'skin':
      const skinRarity = reward.rarity[Math.floor(Math.random() * reward.rarity.length)];
      const randomSkin = getRandomSkinByRarity(skinRarity); // Получаем случайный скин
    
      if (randomSkin) {
        const addResult = await addSkinToUser(userId, randomSkin.id); // Пробуем добавить
    
        if (addResult.success) {
          rewardMessage = `🎨 Вы получили скин: "${randomSkin.name}" (${skinRarity}).`;
        } else if (addResult.alreadyOwned) {
          rewardMessage = `♻️ Скин "${randomSkin.name}" уже есть у вас.`;
        } else {
          rewardMessage = `❌ Не удалось получить скин "${randomSkin.name}".`;
        }
      } else {
        rewardMessage = `🎨 Не удалось получить скин редкости: ${skinRarity}.`;
      }
      break;

    case 'npf_shares':
      const npfShares = getRandomInt(reward.min, reward.max);
      await updateUserNpfShares(userId, npfShares);
      rewardMessage = `📈 Вы получили ${npfShares} акций NPF.`;
      break;

    case 'prefix': // Новый тип награды: префикс
      const randomPrefix = await getRandomPrefix(); // Получаем случайный префикс
      if (randomPrefix) {
        await addPrefixToUser(userId, randomPrefix.id); // Добавляем префикс пользователю
        rewardMessage = `🔥 Вы получили префикс: "${randomPrefix.prefix}".`;
      } else {
        rewardMessage = `❓ Не удалось получить префикс.`;
      }
      break;

    case 'nothing':
      rewardMessage = `❌ В этот раз вам не повезло. Попробуйте снова!`;
      break;

    default:
      rewardMessage = `❓ Неизвестная награда.`;
  }

  return rewardMessage;
}

// Функция для получения случайного префикса
function getRandomPrefix() {
  try {
    const prefixes = getAllPrefixes(); // Получаем все доступные префиксы
    if (!prefixes || prefixes.length === 0) {
      console.error('[PREFIX] Нет доступных префиксов.');
      return null;
    }
    const randomIndex = Math.floor(Math.random() * prefixes.length); // Выбираем случайный индекс
    return prefixes[randomIndex]; // Возвращаем случайный префикс
  } catch (error) {
    console.error('[PREFIX] Ошибка при получении случайного префикса:', error);
    return null;
  }
}

// Функция для получения случайного скина по редкости
function getRandomSkinByRarity(rarity) {
  try {
    const skins = getAllSkins();
    
    // Фильтруем только те скины, которые в списке allowedSkinNamesForDrop и подходят по редкости
    const filteredSkins = skins.filter(skin => 
      skin.rarity === rarity && allowedSkinNamesForDrop.includes(skin.name)
    );

    if (!filteredSkins || filteredSkins.length === 0) {
      console.error(`[SKIN] Нет доступных скинов редкости: ${rarity} в списке разрешенных.`);
      return null;
    }

    const randomIndex = Math.floor(Math.random() * filteredSkins.length);
    return filteredSkins[randomIndex]; // Возвращаем случайный скин из разрешённого списка
  } catch (error) {
    console.error('[SKIN] Ошибка при получении случайного скина:', error);
    return null;
  }
}

async function openContainerHandler(ctx, containerNumber, quantity = 1) {
  try {
    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);

    if (!user) {
      return ctx.reply('⚠️ <b>Ошибка:</b> Вы ещё не зарегистрированы.', { parse_mode: 'HTML' });
    }

    // Проверяем корректность номера контейнера
    if (![1, 2, 3].includes(containerNumber)) {
      return ctx.reply('⚠️ <b>Ошибка:</b> Неверный номер контейнера. Доступные варианты: 1 (CLASSIC), 2 (PREMIUM), 3 (GOLD).', { parse_mode: 'HTML' });
    }

    // Проверяем наличие достаточного количества контейнеров
    const currentContainerCount = user[`container_type_${containerNumber}`] || 0;
    if (currentContainerCount < quantity) {
      return ctx.reply(`⚠️ <b>Ошибка:</b> У вас недостаточно ${['CLASSIC', 'PREMIUM', 'GOLD'][containerNumber - 1]} контейнеров.`, { parse_mode: 'HTML' });
    }

    // Начинаем транзакцию
    beginTransaction();

    try {
      let totalPF = 0;
      let totalDF = 0;
      let totalNpfShares = 0;
      const rewardMessages = [];
      const statusRewards = new Set();
      const skinRewards = new Set();
      const prefixRewards = new Set();

      for (let i = 0; i < quantity; i++) {
        // Определяем количество призов в зависимости от типа контейнера
        const rewardsCount = getRandomInt(1, containerNumber);

        for (let j = 0; j < rewardsCount; j++) {
          const reward = getRandomReward(containerRewards[containerNumber]);

          switch (reward.type) {
            case 'PF':
              const pfAmount = getRandomInt(reward.min, reward.max);
              totalPF += pfAmount;
              if (quantity === 1) {
                rewardMessages.push(`💰 PF: +${pfAmount.toLocaleString('ru-RU')}\n`);
              }
              break;

            case 'DF':
              const dfAmount = getRandomInt(reward.min, reward.max);
              totalDF += dfAmount;
              if (quantity === 1) {
                rewardMessages.push(`💎 DF: +${dfAmount.toLocaleString('ru-RU')}\n`);
              }
              break;

            case 'npf_shares':
              const npfShares = getRandomInt(reward.min, reward.max);
              totalNpfShares += npfShares;
              if (quantity === 1) {
                rewardMessages.push(`📈 NPF акции: +${npfShares}\n`);
              }
              break;

            case 'status':
              const statusName = Array.isArray(reward.name)
                ? reward.name[Math.floor(Math.random() * reward.name.length)]
                : reward.name;
              statusRewards.add(statusName);
              rewardMessages.push(`🌟 Статус: "${statusName}"\n`);
              break;

            case 'skin':
              const rarity = Array.isArray(reward.rarity)
                ? reward.rarity[Math.floor(Math.random() * reward.rarity.length)]
                : reward.rarity;
              const skin = await getRandomSkinByRarity(rarity);
              if (skin && !skinRewards.has(skin.id)) {
                skinRewards.add(skin.id);
                rewardMessages.push(`🎨 Скин: "${skin.name}" (${rarity})\n`);
              }
              break;

            case 'prefix':
              const prefix = await getRandomPrefix();
              if (prefix && !prefixRewards.has(prefix.id)) {
                prefixRewards.add(prefix.id);
                rewardMessages.push(`🔥 Префикс: "${prefix.prefix}"\n`);
              }
              break;

            case 'nothing':
              if (quantity === 1) {
                rewardMessages.push(`❌ В этот раз вам не повезло.\n`);
              }
              break;

            default:
              rewardMessages.push(`❓ Неизвестная награда\n`);
              break;
          }
        }
      }

      // Если открыто несколько контейнеров, добавляем суммарные значения
      if (quantity > 1) {
        if (totalPF > 0) {
          rewardMessages.unshift(`💰 PF: +${totalPF.toLocaleString('ru-RU')}\n`);
        }
        if (totalDF > 0) {
          rewardMessages.unshift(`💎 DF: +${totalDF.toLocaleString('ru-RU')}\n`);
        }
        if (totalNpfShares > 0) {
          rewardMessages.unshift(`📈 NPF акции: +${totalNpfShares}\n`);
        }
      }

      // Применяем изменения к балансам
      if (totalPF > 0) {
        await updateUserBalance(userId, totalPF);
      }
      if (totalDF > 0) {
        await updateUserDFBalance(userId, totalDF);
      }
      if (totalNpfShares > 0) {
        await updateUserNpfShares(userId, totalNpfShares);
      }

      // Применяем статусы
      for (const status of statusRewards) {
        await awardStatusToUser(userId, status);
      }

      // Применяем скины
      for (const skinId of skinRewards) {
        await addSkinToUser(userId, skinId);
      }

      // Применяем префиксы
      for (const prefixId of prefixRewards) {
        await addPrefixToUser(userId, prefixId);
      }

      // Уменьшаем количество контейнеров
      await decreaseContainerCount(userId, containerNumber, quantity);

      // Формируем финальное сообщение
      const finalMessage = `
📦 Вы успешно открыли ${quantity} ${['CLASSIC', 'PREMIUM', 'GOLD'][containerNumber - 1]} контейнер(ов)!
───────────────────
${rewardMessages.join('')}───────────────────
• Осталось ${['CLASSIC', 'PREMIUM', 'GOLD'][containerNumber - 1]}-контейнеров: ${currentContainerCount - quantity}.
`.trim();

      // Создаем клавиатуру для повторного открытия
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback(`Открыть ещё ${['CLASSIC', 'PREMIUM', 'GOLD'][containerNumber - 1]} контейнеры`, `open_container_${containerNumber}`)
      ]);

      // Отправляем результат
      await ctx.replyWithHTML(finalMessage, keyboard);

      // Фиксируем транзакцию
      commitTransaction();

    } catch (error) {
      // Откатываем транзакцию в случае ошибки
      rollbackTransaction();
      console.error('[openContainerHandler] Ошибка транзакции:', error);
      throw error;
    }

  } catch (error) {
    console.error('[openContainerHandler] Ошибка:', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Экспортируем функции
module.exports = { openContainerHandler, containerRewards, getRandomReward };