//bot.js(тестовый)
console.log("ШАГ 1: bot.js достигнут.");


const { Telegraf, Markup } = require('telegraf'); // Импортируем Telegraf и Markup
const subscriptionMiddleware = require('./middleware/subscription');
const {
  getUserById,
  activateDoubleMode,
  deactivateDoubleMode,
  activateDiceMode,
  deactivateDiceMode,
  updateUserBalance,
  updateUserDFBalance,
  isDoubleChat,
  isDiceChat,
  addChat,
  isUserBanned,
  getBlacklistEntry,
  decreaseContainerCount,
  incrementLikesReceived,
  incrementDislikesReceived,
  isUserMuted,
  getDonationHistory, 
  addDonationToHistory,
  updateTotalDonatedStars,
  getReferrerId,
  getUserStatuses,
  getBetsByRoundId,
  getWeaponById,
  setActiveWeapon,
  getAttackState,
  getCurrentBoss,
  saveAttackState,
  getCurrentWeaponDurability,
  addWeaponToUser,
  getOwnedWeapons,
  logFinance,
  saveBet,
  getDoubleBetsByRound,
  getActivePlayersCount,
  logMessage,
} = require('./db');


const { diceGame, diceHandler, parseBetAmount } = require('./games/diceGame');
const { doubleGame, createUserLink } = require('./games/doubleGame');
const { logError } = require('./utils/errorHandler'); // Импортируем обработчик ошибок
const { setupGlobalErrorHandler } = require('./utils/error'); // Импортируем обработчик ошибок
const { incrementRequestCount, calculateLoadDetails } = require('./botMonitoring');
// Импортируем специализированные функции для работы с сессиями
const { getRegistrationSession, saveRegistrationSession } = require('./sessions/registrationSession');



// Импортируем db
const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3(dbPath);

// Импортируем обработчики как объекты
const { registerHandler, handleCaptchaWrong, handleCaptchaCorrect, handlePrivacyPolicyAcceptance } = require('./handlers/registration');
const { balanceHandler } = require('./handlers/balance');
const { bonusHandler } = require('./handlers/bonus');
const { profileHandler, handleManageProfile } = require('./handlers/profile');
const { gameModes, handleDoublePlusButton, handleBackToModesButton, handleDiceButton, handleAboutDoublePlusButton, handleAboutDiceButton } = require('./handlers/gameHandlers');
const { doubleHandler, handleMultiplierCommand, lastBetTimes } = require('./handlers/double');
const { addBalanceHandler, removeBalanceHandler, parseAmountWithSuffix, isAdmin, handleNotificationButton, enableNotificationsHandler, disableNotificationsHandler, handleEnableNotificationsButton } = require('./admin/addBalance'); // Из папки admin
const { helpHandler, handleHelpNavigation } = require('./handlers/help');
const { registerCardHandler, handleRegisterCardAction, handleCardInfoButton, handleShowUpgradeGrid, handleUpgradeCardLevel, cardInfoHandler, handleManageCardButton, performLevelUpgrade } = require('./handlers/cardInfo');
const { changeNicknameHandler } = require('./handlers/changeNickname');
const { forbesHandler } = require('./handlers/top'); // Обработчик "форбс"
const { referralLinkHandler, topReferralsHandler, referralsListHandler, handleMyReferrals, handleRefInfo, changeReferralBonus, setReferralBonusForAllUsers, handleBackToRefMenu, topSeasonalReferralsHandler, handleContestInfo } = require('./handlers/referralSystem'); // Реферальная ссылка
const { showAdminPanel, handleListAdmins, handleAdminCommands, handleClosePanel, isTechAdmin } = require('./admin/adminPanel');
const { 
  startPromoCreationSession, 
  handlePromoCreationMessage, 
  handleCallback, 
  listPromosHandler, 
  deletePromoHandler, 
  usePromoHandler 
} = require('./handlers/promoHandler');
const { listBannedPlayersHandler, startAutoUnban, isAdmin_ban } = require('./admin/blacklistManagement');
const { buyContainerHandler, containersHandler, setupContainerHandlers, sendContainerInfoMessage } = require('./handlers/buyContainer');
const { openContainerHandler } = require('./handlers/openContainer');
const { sendDonationOptions, handleDonation } = require('./donations/starDonation');
const { getTopDonators, getDonationStatistics } = require('./handlers/donationStats');
const { listStatusesHandler, awardStatusHandler, removeStatusHandler } = require('./statusCommands'); // Новые обработчики команд
const { updateStatuses } = require('./updateStatuses'); // Импортируем функцию обновления статусов
const { handleDbSizeCommand, handleBackupCommand,scheduleDailyBackup, } = require('./adminUtils.js');
const { bankHandler, handleFinance, handleP2P, handleExchangeRate } = require('./bank/bankHandler');
const { skinShopHandler, handlePageChange, handleSelectSkinToBuy, handleSkinNavigation, handleBuySkin, handleCloseShop, handleToShop } = require('./skins/shopHandler');
const { handleMySkins, handleMySkinsNavigation, handleApplySkin } = require('./skins/mySkinsHandlers');
const { statisticsHandler, showStatisticsMenu } = require('./handlers/statistics');
const { answerReport, createReport, getReports, deleteReportById } = require('./admin/reports');
const { muteUserHandler, unmuteUserHandler, listMutedPlayersHandler, startAutoUnmute } = require('./admin/muteManagement');
const { kickUserHandler } = require('./admin/kickManagement');
const { idHandler, profHandler, deleteHandler, changeIdHandler, giveHandler, freeIdsHandler, detailedTopHandler, topContainersHandler, takeHandler, topDfBalanceHandler, topCardBalanceHandler, topNpfSharesHandler,
  blockTransfersHandler, unblockTransfersHandler, resetHandler, subtractReferralsHandler, logAction, toggleTopVisibilityHandler,changeNicknameByNumericIdHandler, topReferrersHandler, topBossDamageHandler,
  unblockTopVisibilityHandler, giveEnergyHandler, takeEnergyHandler, sendMessageToUserHandler, checkPlayerWeaponsAndDamage, reduceBossHpHandler, updateSkinPriceHandler, checkMasterHandler,
  topAttackPowerHandler, sendChatIdToUser, setCardLevelHandler, infoBalanceHandler, setBalanceHandler, isPartnerManager, giveTicketsHandler, takeTicketsHandler
} = require('./handlers/technicalCommands');
const { sendDonationNotification } = require('./handlers/donationNotifications'); // Импортируем новую функцию
const { sendHandler } = require('./bank/bankTransfers');
const { topUpHandler, withdrawHandler } = require('./bank/cardTopUp');
const { showDonationMenu, handleDonationCommand, showDonationShopMenu, showSharesMenu, handleBuyDiscountedStatus } = require('./donations/donationShop');
const { listAllPrefixes, assignPrefix, removePrefix,   listUserPrefixes, setActivePrefix, createSpecialPrefixCommand, assignSpecialPrefix, removeSpecialPrefix,
 } = require('./handlers/prefixes');
const { rulesHandler, handlePartnershipCommand } = require('./handlers/rules');
const { testerKitHandler } = require('./handlers/testerKit');
const { sendPostToChannel } = require('./postToChannel');
const { handleTopUpAll, handleWithdrawAll, showWithdrawInstruction, showTopUpInstruction } = require('./bank/cardTopUp');
const { toggleHyperlinkHandler } = require('./handlers/top');
const { handleChatModeKeyboard } = require('./handlers/buttons');
const { checkSkins, checkSkinImage, giveSkinHandler, takeSkinHandler } = require('./skins/checkSkins');
const { callEveryoneHandler } = require('./middleware/all');
const { statusReportHandler, handleStatusList } = require('./handlers/statusReport');
const { rouletteHandler, repeatBetHandler, casinoCaptchaCorrectHandler, casinoCaptchaWrongHandler } = require('./handlers/roulette');
const { auctionHandler, startNewAuction, endAuction, handleMakeBid, exportAuctionBids } = require('./handlers/auction');
const { startGame, stopGame, handleGuessNumber, gameState } = require('./handlers/guessNumberGame');
const { startNewBoss, bossHandler, attackBoss, sendBossGameInfo, generateMathKeyboard } = require('./boss/bossHandler.js');
const { energyHandler, showEnergyInfo } = require('./boss/energyHandler.js');
const { upgradeAttackPower, showSkillUpgradeMenu, changeWeapon, weaponShop, buyWeapon } = require('./boss/upgradeAttackPower');
const { bossTopHandler } = require('./boss/bossTop');
const { fortyTwoHandler } = require('./handlers/fortyTwo.js')
const { empireHandler, empireStatisticsHandler } = require('./empire/handlers/empireHandler');
const { handleBuildMenu, handleBuildPage, handleViewBusinessInfo, handleShowUpgradeDetails, handleConfirmBuyBusiness, handleConfirmUpgradeBusiness } = require('./empire/handlers/buildHandlers');
const { giveBusinessHandler } = require('./empire/handlers/adminCommandsHandler');
const { handleNpfBuyCommand, handleNpfSellCommand, handleShowChart, handleNpfInfo, loadCourseState, startCourseUpdater } = require('./bank/npfShares');
const { handleNpfTechInfo, handleForceUpdateCourse } = require('./bank/bankTechCommands');
const { candyShopMenu, buyPfWithCandy, buyFortuneTicket, buyGoldContainers } = require('./Events/Halloween/candyShop');
const { showSecretGiftMenu, openSecretGift, closeSecretGiftMenu } = require('./Events/secretGift');
const { handleTestCommand, handleTestButton, handleConfirmAction } = require('./handlers/testHandler');
// Импорт модуля последовательного ввода
const { sequentialMiddleware, startSequentialInput, handleCancel } = require('./handlers/sequentialInput');

// Функция для отправки сообщения с кнопкой Mini App
async function sendMiniAppMessage(ctx) {
  const miniAppUrl = process.env.MINI_APP_URL;

  if (!miniAppUrl) {
    console.error('❌ Ошибка: MINI_APP_URL не задан в .env!');
    return ctx.reply('⚙️ Ошибка конфигурации Mini App.');
  }

  try {
    await ctx.reply('🎮 Открываю Mini App...', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Открыть приложение',
              web_app: {
                url: miniAppUrl, // Берем ссылку из .env
              },
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Ошибка при отправке сообщения с Mini App:', error);
    await ctx.reply('❌ Произошла ошибка при открытии приложения.');
  }
}



// Создаем экземпляр бота
const { SocksProxyAgent } = require('socks-proxy-agent');

// Настраиваем прокси-агент, указывая на твой локальный SOCKS5 порт из конфига
// Если у тебя есть логин/пароль для прокси, формат будет: socks5://user:pass@127.0.0.1:10808
const proxyUrl = 'socks5://127.0.0.1:10808'; 
const agent = new SocksProxyAgent(proxyUrl);

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    // Передаем агент в настройки telegram-клиента
    agent: agent,
    // Увеличиваем таймауты, так как через прокси может быть медленнее
    apiRoot: 'https://api.telegram.org', 
  },
});




// Автоматическое обновление статусов при старте бота
(async () => {
  try {
    await updateStatuses(); // Вызываем функцию обновления статусов
  } catch (error) {
    console.error('Ошибка при автоматическом обновлении статусов:', error);
  }
})();

const { runLogsCleanup } = require('./db');
runLogsCleanup();                            // один раз при старте
setInterval(runLogsCleanup, 60 * 60 * 1000); // далее каждый час

// Фоновая задача для мониторинга нагрузки
setInterval(() => {
  try {
    const loadDetails = calculateLoadDetails(); // Получаем детализированную нагрузку
    currentLoadDetails = {
      rps: loadDetails.rps,
      rpm: loadDetails.rpm,
      cpu: loadDetails.cpu,
      memory: loadDetails.memory,
      overall: loadDetails.overall,
      peakRPS: loadDetails.peakRPS,
    };
  } catch (error) {
    console.error('Ошибка при расчете нагрузки:', error);
  }
}, 15000); // Обновляем каждые 15 секунд


const GUESS_NUMBER_CHAT_ID = parseInt(process.env.GUESS_NUMBER_CHAT_ID, 10); // ID игрового чата

// Глобальный middleware для обработки сообщений в чате "Угадай число"
bot.use(async (ctx, next) => {
  try {
      // Если это не текстовое сообщение - пропускаем
      if (!ctx.message || !ctx.message.text) {
          return next();
      }

      const text = ctx.message.text.trim();
      const lowerText = text.toLowerCase();

      // Разрешаем запуск игры только администраторам в личных сообщениях
      if (lowerText.startsWith('начать_игру') && ctx.chat.type === 'private') {
          // Проверяем права администратора
          if (!(await isAdmin(ctx))) {
              return ctx.reply('❌ У вас нет прав для запуска игры.');
          }
          
          // Запускаем игру
          await startGame(ctx);
          
          // Отправляем подтверждение в личные сообщения
          await ctx.reply('🎮 Игра успешно запущена!');
          
          // Отправляем сообщение в игровой чат
          try {
              await bot.telegram.sendMessage(GUESS_NUMBER_CHAT_ID, '🎮 Игра "Угадай число" началась! Загадано число.');
          } catch (chatError) {
              await ctx.reply('⚠️ Не удалось отправить сообщение в игровой чат. Проверьте настройки.');
          }
          
          return;
      }

      // Продолжаем обработку других команд, если это не игровой чат
      if (ctx.chat.id !== GUESS_NUMBER_CHAT_ID) {
          return next();
      }

      // Обработка команд управления игрой в игровом чате
      if (lowerText === 'завершить_игру') {
          return stopGame(ctx);
      }

      // Проверяем попытки угадать число только в игровом чате
      if (gameState.isRunning) {
          await handleGuessNumber(ctx, text, bot); // Передаем bot как аргумент
      }

      // Продолжаем обработку других команд
      return next();

  } catch (error) {
      console.error('Ошибка в обработчике игры "Угадай число":', error);
      await ctx.reply('Произошла ошибка при обработке игры.');
  }
});

// Middleware для подсчёта запросов
bot.use(async (ctx, next) => {
  try {
    // Увеличиваем счётчик запросов для каждого входящего сообщения
    incrementRequestCount();

    await next(); // Продолжаем обработку запроса
  } catch (error) {
    console.error('Ошибка в middleware:', error);
    await ctx.reply('Произошла ошибка. Попробуйте через несколько секунд.');
  }
});

// Логирование нажатий кнопок (callback_query) в message_log — для счётчика онлайна
bot.on('callback_query', async (ctx, next) => {
  try {
    const userId = ctx.from?.id;
    if (userId) {
      logMessage(
        userId,
        ctx.chat?.type || 'private',
        ctx.chat?.id || userId,
        ctx.chat?.title || null,
        `[btn] ${ctx.callbackQuery?.data || ''}`,
        false
      );
    }
  } catch (e) {
    // ошибка логирования не должна ломать обработку кнопок
  }
  return next();
});

// Middleware для обработки последовательного ввода
bot.use(sequentialMiddleware());

// Глобальное хранилище состояний пользователей
const userStates = {};

// Глобальный middleware для проверки чс и подписки
bot.use(async (ctx, next) => {
  try {
    // Проверяем тип события
    if (ctx.updateType !== 'message') {
      return next(); // Пропускаем middleware, если событие не является текстовым сообщением
    }

    // Проверяем, что сообщение существует и содержит текст
    if (!ctx.message || typeof ctx.message.text !== 'string') {
      return next(); // Пропускаем middleware, если нет текста
    }

    const userId = ctx.from?.id?.toString(); // Получаем ID пользователя
    if (!userId) {
      console.warn('Получено сообщение без пользователя.');
      return; // Просто пропускаем обработку
    }

    // Исключение для команды /start (включая реферальный код)
    if (ctx.message.text.startsWith('/start')) {
      console.log('Пропускаем проверку подписки для команды "/start".');
      return next();
    }

    // Исключение для команды "репорт"
    if (ctx.message.text.trim().toLowerCase().startsWith('репорт')) {
      console.log('Пропускаем проверку чс для команды "репорт".');
      return next();
    }

    // Проверяем, находится ли пользователь в черном списке
    if (isUserBanned(userId)) {
      const bannedInfo = await getBlacklistEntry(userId); // Получаем информацию о бане
      const reason = bannedInfo?.reason || 'Не указана';
      const banExpiresAt = bannedInfo?.banned_until
        ? new Date(bannedInfo.banned_until * 1000).toLocaleString()
        : 'Навсегда';

      const user = await getUserById(userId);
      const username = user?.username || 'Неизвестный';
      const userLink = `<a href="tg://user?id=${userId}">${username}</a>`; // Создаем гиперссылку

      const bannedMessage = `
 ${userLink}, вы находитесь в черном списке.
📕 Причина: ${reason}
⏳ До: ${banExpiresAt}
`.trim();

      // Отправляем сообщение о блокировке только в личных чатах
      if (ctx.chat.type === 'private') {
        return ctx.reply(bannedMessage, { parse_mode: 'HTML' });
      } else {
        console.log(`Пользователь ${userId} находится в черном списке, но это публичный чат. Сообщение о блокировке не отправлено.`);
        return; // Просто игнорируем в публичных чатах
      }
    }

    // Если это личный чат, проверяем подписку на канал
    if (ctx.chat.type === 'private') {
      return subscriptionMiddleware(ctx, next); // Передаем управление в subscriptionMiddleware
    }

    // Для публичных чатов пропускаем проверку подписки
    return next();
  } catch (error) {
    console.error('Ошибка в middleware:', error);

    // Обработка случая "chat_id is empty"
    if (error.response && error.response.description.includes('chat_id is empty')) {
      console.warn('Пропускаем обработку из-за отсутствия chat_id.');
      return next();
    }

    // Отправляем сообщение об ошибке
    if (ctx.chat && ['group', 'supergroup'].includes(ctx.chat.type)) {
      await ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
    } else {
      console.warn('Ошибка не была обработана из-за типа чата.');
    }
  }
});

bot.use(async (ctx, next) => {
  try {
    // Проверяем тип события
    if (ctx.updateType !== 'message') {
      return next(); // Пропускаем middleware, если событие не является текстовым сообщением
    }

    // Проверяем, что сообщение существует и содержит текст
    if (!ctx.message || typeof ctx.message.text !== 'string') {
      return next(); // Пропускаем middleware, если нет текста
    }

    const userId = ctx.from?.id?.toString();
    const chatId = ctx.chat?.id?.toString();

    if (!userId || !chatId) {
      return next(); // Пропускаем middleware, если нет userId или chatId
    }

    // Исключение для команды "репорт"
    const text = ctx.message.text.trim().toLowerCase();
    if (text.startsWith('репорт')) {
      return next();
    }

    // Проверяем, находится ли пользователь в муте в этом чате
    const mutedInfo = await isUserMuted(userId, chatId);
    if (mutedInfo) {
      const reason = mutedInfo.reason || 'Не указана';
      const mutedUntil = mutedInfo.muted_until === null
        ? 'Навсегда'
        : new Date(mutedInfo.muted_until * 1000).toLocaleString();

      const username = ctx.from.username || 'Неизвестный';
      const userLink = `<a href="tg://user?id=${userId}">${username}</a>`;

      const mutedMessage = `
🔇 Вы находитесь в муте.
📕 Причина: ${reason}
⏳ До: ${mutedUntil}
`.trim();

      return ctx.reply(mutedMessage, { parse_mode: 'HTML' });
    }

    return next();
  } catch (error) {
    console.error('Ошибка в middleware:', error);
    await ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
  }
});

// Функция для проверки разрешения на выполнение команды
async function isCommandAllowed(ctx) {
  const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID; // ID разрешенного чата из переменных окружения
  const chatId = ctx.chat?.id?.toString(); // ID текущего чата
  const userId = ctx.from?.id?.toString(); // ID пользователя

  // Проверяем, находится ли команда в разрешенном чате
  if (!ALLOWED_CHAT_ID || chatId !== ALLOWED_CHAT_ID) {
    return false; // Команда запрещена в этом чате
  }

  // Проверяем, есть ли у пользователя статус "Beto-tester" или "Тех администратор"
  const userStatuses = await getUserStatuses(userId);
  if (!userStatuses.includes('Beto-tester') && !userStatuses.includes('Тех администратор')) {
    return false; // У пользователя нет нужных прав
  }

  return true; // Команда разрешена
}

// Функция для проверки статуса пользователя (забанен или замучен)
async function checkUserStatus(ctx) {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();

  if (!userId) {
    console.warn('Callback запрос без пользователя.');
    return false; // Пропускаем обработку
  }

  // Проверяем, находится ли пользователь в черном списке
  if (isUserBanned(userId)) {
    const bannedInfo = await getBlacklistEntry(userId); // Получаем информацию о бане
    const reason = bannedInfo?.reason || 'Не указана';
    const banExpiresAt = bannedInfo?.banned_until
      ? new Date(bannedInfo.banned_until * 1000).toLocaleString()
      : 'Навсегда';const { 
        addToBlacklist,
        removeFromBlacklist,
        getBlacklist,
        isUserBanned,
        getUserById,
        getUserByNumericId,
        getUserStatuses, // Добавляем функцию для получения статусов пользователя
      } = require('./db');
      
      
      // Функция для проверки, является ли пользователь главным администратором
      function isMainAdmin(userId) {
        return process.env.MAIN_ADMIN === userId.toString();
      }
      
      // Функция для проверки, является ли пользователь "Тех администратор"
      async function isTechAdmin(userId) {
        const statuses = await getUserStatuses(userId); // Получаем статусы пользователя
        return statuses.includes('Тех администратор'); // Проверяем наличие статуса
      }
      
      // Обновленная функция для проверки прав администратора
      async function isAdmin(ctx) {
        const senderId = ctx.from.id.toString();
        // Проверяем, является ли пользователь главным администратором
        if (isMainAdmin(senderId)) {
          return true;
        }
        // Проверяем, есть ли у пользователя статус "Тех администратор" или другой админ-статус
        try {
          const statuses = await getUserStatuses(senderId);
          return statuses.includes('Тех администратор') || statuses.includes('Администратор');
        } catch (error) {
          console.error('Ошибка при проверке статусов администратора:', error);
          return false;
        }
      }
      
      async function banUserHandler(ctx) {
        try {
          if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
            console.warn('❕ Получено некорректное сообщение без текста.');
            return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
          }
      
          const text = ctx.message.text.trim();
          const parts = text.split(/\s+/);
      
          if (parts.length < 2 || parts[0].toLowerCase() !== 'бан') {
            console.warn(`Сообщение "${text}" не является командой "бан".`);
            return ctx.reply('❕ Использование: бан <id> [время_в_часах] или "навсегда"\nПричина может быть указана в новой строке.');
          }
      
          // Разбираем numeric_id и время бана/тип бана
          const numericId = parseInt(parts[1], 10);
          let banType = parts[2]; // Время бана или слово "навсегда"
      
          if (isNaN(numericId)) {
            console.warn(`Некорректный аргумент id=${numericId}`);
            return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: бан <numeric_id> [время_в_часах] или "навсегда".');
          }
      
          // Проверяем права администратора
          if (!(await isAdmin(ctx))) {
            console.warn(`Пользователь ${ctx.from.id} попытался использовать команду "бан" без прав.`);
            return ctx.reply('❕ У вас нет прав для использования этой команды.');
          }
      
          // Проверяем, можно ли забанить пользователя
          const userToBan = await getUserByNumericId(numericId);
          if (!userToBan) {
            console.warn(`Пользователь с id=${numericId} не найден.`);
            return ctx.reply('❕ Пользователь с указанным id не найден.');
          }
      
          // Проверяем, находится ли пользователь уже в чёрном списке
          if (await isUserBanned(userToBan.id)) {
            console.warn(`Пользователь с id=${numericId} уже находится в чёрном списке.`);
            return ctx.reply('❕ Пользователь уже заблокирован.');
          }
      
          // Нельзя забанить главного администратора
          if (isMainAdmin(userToBan.id)) {
            console.warn(`Попытка забанить главного администратора.`);
            return ctx.reply('❕ Невозможно забанить главного администратора.');
          }
      
          // Нельзя забанить технического администратора
          const isTargetTechAdmin = await isTechAdmin(userToBan.id);
          if (isTargetTechAdmin) {
            console.warn(`Попытка забанить технического администратора.`);
            return ctx.reply('❕ Невозможно забанить технического администратора.');
          }
      
          // Вычисляем время окончания бана
          let banHours = null; // По умолчанию — вечный бан
          if (banType && banType.toLowerCase() !== 'навсегда') {
            banHours = parseFloat(banType); // Преобразуем во временное значение
            if (isNaN(banHours) || banHours <= 0) {
              console.warn(`Некорректное время бана: banHours=${banHours}`);
              return ctx.reply('❕ Некорректное время бана. Использование: бан <id> [время_в_часах] или "навсегда".');
            }
          }
      
          // Объединяем оставшиеся части в причину
          let reason = text.split('\n')[1]?.trim(); // Берём вторую строку после переноса
          if (!reason) {
            reason = parts.slice(3).join(' '); // Если причины нет во второй строке, собираем из оставшихся частей
          }
          if (!reason) {
            reason = 'Не указано'; // Устанавливаем стандартную причину, если она отсутствует
          }
      
          // Вычисляем время окончания бана
          const banUntil = banHours === null 
            ? null // Если бан навсегда, banned_until = null
            : Math.floor((Date.now() / 1000) + banHours * 3600); // Время окончания бана в секундах
      
          // Добавляем пользователя в чёрный список
          await addToBlacklist(userToBan.id, reason, banUntil);
      
          // Формируем сообщение администратору
          const username = userToBan.username || 'Неизвестный';
          const userLink = `<a href="tg://user?id=${userToBan.id}">${username}</a>`; // Гиперссылка на пользователя
          const adminMessage = `
      ☑️ Пользователь ${userLink} успешно заблокирован.
      🆔 Числовой ID: ${numericId}
      🗒 Причина: ${reason}
      ${banUntil === null ? '⏳ Время бана: Навсегда' : `⏳ Время бана: ${banHours} часов`}
          `.trim();
      
          console.log(adminMessage); // Лог для отладки
          await ctx.reply(adminMessage, { parse_mode: 'HTML' });
      
      // Отправляем сообщение заблокированному пользователю
      const userMessage = `
      📛 <b>Вы были забанены администратором.</b>
      📕 <b>Причина:</b> ${reason}
      ${banUntil === null 
        ? '⏳ <b>Время бана:</b> Навсегда' 
        : `⏳ <b>Время бана:</b> ${banHours} часов\n\n🆘 <b>"Репорт [текст вопроса]"</b> - в случае возникновения вопросов!`}
      `.trim();
      
      await ctx.telegram.sendMessage(userToBan.id, userMessage, { parse_mode: 'HTML' }).catch((error) => {
        console.error(`Не удалось отправить сообщение пользователю ${userToBan.id}:`, error);
      });
      
        } catch (error) {
          console.error('Ошибка при выполнении команды "бан":', error);
          await ctx.reply('❕ Произошла ошибка. Попробуйте позже.');
        }
      }
      
      // Обработка команды "разбан"
      async function unbanUserHandler(ctx) {
        try {
          if (!ctx.message || !ctx.message.text || ctx.message.text.trim() === '') {
            console.warn('Получено некорректное сообщение без текста.');
            return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
          }
      
          const text = ctx.message.text.trim();
          const parts = text.split(/\s+/);
      
          if (parts.length < 2 || parts[0].toLowerCase() !== 'разбан') {
            console.warn(`Сообщение "${text}" не является командой "разбан".`);
            return ctx.reply('❕ Использование: разбан <id>');
          }
      
          const numericId = parseInt(parts[1], 10);
      
          if (isNaN(numericId)) {
            console.warn(`Некорректный аргумент id=${numericId}`);
            return ctx.reply('❕ Некорректный числовой ID. Использование: разбан <id>');
          }
      
          // Проверяем права администратора
          if (!(await isAdmin(ctx))) {
            console.warn(`Пользователь ${ctx.from.id} попытался использовать команду "разбан" без прав.`);
            return ctx.reply('❕ У вас нет прав для использования этой команды.');
          }
      
          // Получаем информацию о пользователе по числовой ID
          const userToUnban = await getUserByNumericId(numericId);
      
          if (!userToUnban) {
            console.warn(`Пользователь с id=${numericId} не найден.`);
            return ctx.reply('❕ Пользователь с указанным id не найден.');
          }
      
          // Проверяем, находится ли пользователь в черном списке
          if (!(await isUserBanned(userToUnban.id))) {
            console.warn(`Пользователь с id=${numericId} не находится в черном списке.`);
            return ctx.reply('❕ Пользователь не находится в черном списке.');
          }
      
          // Удаляем пользователя из чёрного списка
          await removeFromBlacklist(userToUnban.id);
      
          // Формируем сообщение администратору
          const username = userToUnban.username || 'Неизвестный';
          const userLink = `<a href="tg://user?id=${userToUnban.id}">${username}</a>`; // Гиперссылка на пользователя
          const adminMessage = `❕ Пользователь ${userLink} успешно разблокирован.`;
      
          console.log(adminMessage); // Лог для отладки
          await ctx.reply(adminMessage, { parse_mode: 'HTML' });
      
      // Отправляем сообщение разблокированному пользователю
      const userMessage = '📛 <b>Вы были разблокированы администратором.</b>\n\n🆘 <b>Если у Вас остались вопросы по поводу блокировки — используйте "Репорт".</b>';
      
      await ctx.telegram.sendMessage(userToUnban.id, userMessage, {
        parse_mode: 'HTML'
      }).catch((error) => {
        console.error(`Не удалось отправить сообщение пользователю ${userToUnban.id}:`, error);
      });
      
        } catch (error) {
          console.error('Ошибка при выполнении команды "разбан":', error);
          await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
      }
      
      // Обработка команды "чс"
      async function listBannedPlayersHandler(ctx) {
        try {
          // Проверяем права администратора
          if (!(await isAdmin(ctx))) {
            return; // Завершаем выполнение без отправки ответа, если нет прав
          }
      
          const blacklist = await getBlacklist();
      
          if (!blacklist.length) {
            return ctx.reply('Черный список пуст.');
          }
      
          let response = '';
      
          for (const banned of blacklist) {
            const user = await getUserById(banned.user_id); // Получаем информацию о пользователе по Telegram ID
            if (!user) {
              // Если пользователь удален из базы данных, используем данные из черного списка
              response += `• <b>Неизвестно</b> | Числовой ID: ${banned.user_id} (удален) | Причина: ${
                banned.reason || 'Не указана'
              } | До: ${banned.banned_until ? new Date(banned.banned_until * 1000).toLocaleString() : 'Навсегда'}
      `;
              continue;
            }
      
            // Используем числовой ID (numeric_id) вместо Telegram ID
            const username = user?.username || 'Неизвестно'; // Если имя не указано
            const numericId = user?.numeric_id; // Числовой ID пользователя
            const userLink = `<a href="tg://user?id=${user.id}">${username}</a>`; // Гиперссылка на пользователя
      
            // Время окончания бана
            const banExpiresAt = banned.banned_until 
              ? new Date(banned.banned_until * 1000).toLocaleString() 
              : 'Навсегда';
      
            response += `• ${userLink} | Числовой ID: ${numericId} | Причина: ${banned.reason || 'Не указана'} | До: ${banExpiresAt}
      `;
          }
      
          // Отправляем список заблокированных пользователей
          await ctx.reply(response, { parse_mode: 'HTML' });
        } catch (error) {
          console.error('Ошибка при выполнении команды "чс":', error);
          await ctx.reply('Произошла ошибка. Попробуйте позже.');
        }
      }
      
      // Функция для автоматического разбана пользователей
      function startAutoUnban(bot) {
        setInterval(async () => {
          try {
            const blacklist = await getBlacklist(); // Получаем всех забаненных пользователей
            const currentTime = Math.floor(Date.now() / 1000); // Текущее время в секундах
      
            for (const bannedUser of blacklist) {
              const userId = bannedUser.user_id;
              const banExpiresAt = bannedUser.banned_until;
      
              // Если время бана истекло, удаляем пользователя из черного списка
              if (banExpiresAt && currentTime > banExpiresAt) {
                await removeFromBlacklist(userId);
      
                // Отправляем уведомление пользователю о разбане
                try {
                  await bot.telegram.sendMessage(
                    userId,
                    '⏳Время блокировки истекло, и ваш аккаунт был разблокирован!'
                  );
                } catch (error) {
                  console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error);
                }
              }
            }
          } catch (error) {
            console.error('Ошибка при выполнении автоматического разбана:', error);
          }
        }, 60000); // Проверяем каждую минуту
      }
      

  // Экспортируем функции
  module.exports = {
    banUserHandler,
    unbanUserHandler,
    listBannedPlayersHandler,
    startAutoUnban,
    isAdmin,
  };

    const bannedMessage = `
 Вы находитесь в черном списке.
📕 Причина: ${reason}
⏳ До: ${banExpiresAt}
`.trim();

    await ctx.answerCbQuery(bannedMessage, { parse_mode: 'HTML', show_alert: true });
    return false; // Игнорируем callback-запрос
  }

  // Проверяем, находится ли пользователь в муте в этом чате
  if (chatId) {
    const mutedInfo = await isUserMuted(userId, chatId);
    if (mutedInfo) {
      const reason = mutedInfo.reason || 'Не указана';
      const mutedUntil = mutedInfo.muted_until === null
        ? 'Навсегда'
        : new Date(mutedInfo.muted_until * 1000).toLocaleString();

      const username = ctx.from.username || 'Неизвестный';

      const mutedMessage = `
🔇 Вы находитесь в муте.
📕 Причина: ${reason}
⏳ До: ${mutedUntil}
`.trim();

      await ctx.answerCbQuery(mutedMessage, { parse_mode: 'HTML', show_alert: true });
      return false; // Игнорируем callback-запрос
    }
  }

  return true; // Пользователь не забанен и не замучен
}

// Команда /start с передачей экземпляра бота
bot.start(async (ctx) => {
  if (ctx.chat.type === 'private') {
      // Личный чат - стандартная регистрация
      await registerHandler(ctx, bot);
  } else {
      // Публичный чат - просим перейти в ЛС
      const botUsername = process.env.BOT_USERNAME || 'F_roobot';
      const startButton = Markup.inlineKeyboard([
          Markup.button.url('📝 Начать регистрацию', `https://t.me/${botUsername}?start=start`)
      ]);
      
      const userLink = createUserLink(ctx.from.id, ctx.from.username || ctx.from.first_name);
      return ctx.replyWithHTML(
          `${userLink}, для регистрации и использования функционала бота перейдите в личные сообщения.`,
          startButton
      );
  }
});
bot.command('help', helpHandler);

// Команда для тестирования последовательного ввода
bot.command('sequential', startSequentialInput);

// Обработчик кнопки отмены последовательного ввода
bot.action('sequential_cancel', handleCancel);

// Запуск задачи очистки просроченных промокодов каждые 60 секунд
setInterval(() => {
  try {
    const { cleanupExpiredPromos } = require('./db');
    const deletedCount = cleanupExpiredPromos();
    if (deletedCount > 0) {
      console.log(`[AUTO] Удалено ${deletedCount} просроченных промокодов.`);
    }
  } catch (error) {
    console.error('Ошибка при очистке промокодов:', error);
  }
}, 60000); // 60000 мс = 1 минута

// Универсальная функция для обработки многословных команд
function processMultiWordCommand(ctx, commandsMap) {
    const text = ctx.message.text.trim().toLowerCase();
    const parts = text.split(/\s+/);
    for (const [commandPattern, handler] of Object.entries(commandsMap)) {
        const patternParts = commandPattern.split(/\s+/);
        if (patternParts.every((part, index) => part === parts[index])) {
            try {
                return handler(ctx, parts); // Вызов обработчика команды
            } catch (error) {
                console.error(`Ошибка при выполнении команды "${commandPattern}":`, error);
                ctx.reply('Произошла ошибка. Попробуйте позже.');
                return null; // Прерываем выполнение
            }
        }
    }
    return null; // Команда не найдена
}

// Обработчик callback-запросов
bot.action(/^promo_create_/, async (ctx) => {
  await require('./handlers/promoHandler').handlePromoCreationCallback(ctx);
});

// Создание маппинга многословных команд
const multiWordCommands = {
// Создание промокода
'создать': async (ctx) => {
  // Запускаем пошаговый процесс вместо требования аргументов
  await startPromoCreationSession(ctx);
},
'рег': async (ctx) => {
  await registerHandler(ctx);
},
'помощь': async (ctx) => {
  await helpHandler(ctx, db);
},
'баланс': async (ctx) => {
  await balanceHandler(ctx, db);
},
'/buttons': async (ctx) => {
  await handleChatModeKeyboard(ctx, db);
},
'/buttons@f_roobot': async (ctx) => {
  await handleChatModeKeyboard(ctx, db);
},
'анонимность': async (ctx) => {
  await toggleHyperlinkHandler(ctx, db); // Новая команда
},
'начать игру': async (ctx) => {
  await startGame(ctx);
},
'2': async (ctx) => handleMultiplierCommand(ctx, 'x2'),
'3': async (ctx) => handleMultiplierCommand(ctx, 'x3'),
'5': async (ctx) => handleMultiplierCommand(ctx, 'x5'),
'игра': async (ctx) => handleMultiplierCommand(ctx, 'GAME'),
'game': async (ctx) => handleMultiplierCommand(ctx, 'GAME'),
'х2': async (ctx) => handleMultiplierCommand(ctx, 'x2'),
'х3': async (ctx) => handleMultiplierCommand(ctx, 'x3'),
'х5': async (ctx) => handleMultiplierCommand(ctx, 'x5'),
'бонус': async (ctx) => {
  await bonusHandler(ctx, db);
},
'протокол 42': async (ctx) => {
  await fortyTwoHandler(ctx);
},
// 'дебонус': async (ctx) => {
//   await resetAllBonusTimes(ctx, db);
// },
// 'пост': async (ctx, parts) => {
//   await sendPostToChannel(ctx, db);
// },
'профиль': async (ctx) => {
  await profileHandler(ctx, db);
},
'🪪 профиль': async (ctx) => {
  await profileHandler(ctx, db);
},
'проф': async (ctx) => {
  await profileHandler(ctx, db);
},
'статистика': async (ctx) => {
  await statisticsHandler(ctx, db);
},
'стата': async (ctx) => {
  await statisticsHandler(ctx, db);
},
'/help': async (ctx) => {
  await helpHandler(ctx);
},
'правила': async (ctx) => {
  await rulesHandler(ctx);
},
'зарегистрировать карту': async (ctx) => {
  await registerCardHandler(ctx);
},
'карта': async (ctx) => {
  await cardInfoHandler(ctx);
},
'карты': async (ctx) => {
  await cardInfoHandler(ctx);
},
'ник': async (ctx) => {
  await changeNicknameHandler(ctx, db);
},
'форбс': async (ctx) => {
  await forbesHandler(ctx, db);
},
'топ': async (ctx) => {
  await forbesHandler(ctx, db);
},
'рейтинг': async (ctx) => {
  await forbesHandler(ctx, db);
},
'🏆 рейтинг': async (ctx) => {
  await forbesHandler(ctx, db);
},
'реф': async (ctx) => {
  await referralLinkHandler(ctx);
},
'👥 реф система': async (ctx) => {
  await referralLinkHandler(ctx);
},
'рефы': async (ctx) => {
  await handleMyReferrals(ctx);
},

'размер': async (ctx) => {
  await handleDbSizeCommand(ctx);
},
'бэкап': async (ctx) => {
  await handleBackupCommand(ctx);
},
'банк': async (ctx) => {
  await bankHandler(ctx);
},
'🏦 банк': async (ctx) => {
  await bankHandler(ctx);
},
'скины': async (ctx) => {
  await skinShopHandler(ctx);
},
'донат': async (ctx) => {
  await handleDonationCommand(ctx);
},
'🍩 донат': async (ctx) => {
  await handleDonationCommand(ctx);
},
'/delete': async (ctx) => {
  await deleteHandler(ctx);
},
'бот': async (ctx) => {
  await checkMasterHandler(ctx);
},
'/reset': async (ctx) => {
  await resetHandler(ctx);
},
'реф_вычесть': async (ctx) => {
  await subtractReferralsHandler(ctx);
},
'/changeid': async (ctx) => {
  await changeIdHandler(ctx);
},
'/свободныеид': async (ctx) => {
  await freeIdsHandler(ctx);
},
'проверить_топ': async (ctx) => {
  await detailedTopHandler(ctx);
},
'топ_кулаков': async (ctx) => {
  await topAttackPowerHandler(ctx);
},
'снятьхп': async (ctx) => {
  await reduceBossHpHandler(ctx);
},
'проверить_босстоп': async (ctx) => {
  await topBossDamageHandler(ctx);
},
'проверить_статусы': async (ctx) => {
  await statusReportHandler(ctx);
},
'смс': async (ctx) => {
  await sendMessageToUserHandler(ctx);
},
'проверить_рефтоп': async (ctx) => {
  await topReferrersHandler(ctx);
},
'новая_цена': async (ctx) => {
  await updateSkinPriceHandler(ctx);
},
'проверить_конт': async (ctx) => {
  await topContainersHandler(ctx);
},
// Команды для просмотра топов
'проверить_дф': async (ctx) => {
  await topDfBalanceHandler(ctx);
},
'проверить_акции': async (ctx) => {
  await topNpfSharesHandler(ctx);
},
'проверить_карты': async (ctx) => {
  await topCardBalanceHandler(ctx);
},
'проверить_скины': async (ctx) => {
  await checkSkins(ctx);
},
'блок_переводы': async (ctx) => {
  await blockTransfersHandler(ctx);
},
'разблок_переводы': async (ctx) => {
  await unblockTransfersHandler(ctx);
},
'чек_скин': async (ctx) => {
  await checkSkinImage(ctx);
},
'выдать_скин': async (ctx) => {
  await giveSkinHandler(ctx);
},
'забрать_скин': async (ctx) => {
  await takeSkinHandler(ctx);
},
// 'тест': async (ctx) => {
//   await testerKitHandler(ctx);
// },
  // Команда "take" 
'забор': async (ctx) => {
  await takeHandler(ctx);
},
'дать': async (ctx) => {
  await giveHandler(ctx);
},
'уровень': async (ctx) => {
  await handleUpgradeCardLevel(ctx);
},
// 'конкурс': async (ctx) => {
//   await handleContestInfo(ctx);
// },
// 'акция': async (ctx) => {
//   await handleContestInfo(ctx);
// },
'объявление': async (ctx) => {
  await callEveryoneHandler(ctx);
},
'завершить_аукцион': async (ctx) => {
  if (!(await isAdmin(ctx))) return; // Добавляем await, так как isAdmin асинхронная
  await endAuction(ctx);
},
'аук_инфо': async (ctx) => {
  if (!(await isAdmin(ctx))) {
      return await ctx.reply('❌ У вас нет прав для выполнения этой команды.');
  }
  await exportAuctionBids(ctx);
},
'новый_аукцион': async (ctx) => {
  if (!(await isAdmin(ctx))) return; // Проверяем права администратора
  
  let args = ctx.message.text.split(/\s+/).slice(1); // Извлекаем аргументы после команды
  if (args.length < 3) {
    return await ctx.reply('❌ Неверный формат команды. Используйте: новый_аукцион [мин.ставка] [шаг] [приз]');
  }
  
  const minBet = parseInt(args[0]);
  const minStep = parseInt(args[1]);
  const prize = args.slice(2).join(' ');
  
  if (isNaN(minBet) || isNaN(minStep)) {
    return await ctx.reply('❌ Минимальная ставка и шаг должны быть числами');
  }
  
  if (minBet <= 0 || minStep <= 0) {
    return await ctx.reply('❌ Минимальная ставка и шаг должны быть больше нуля');
  }

  await startNewAuction(ctx, minBet, minStep, prize); // Передаем параметры нового аукциона
},
'аук': async (ctx) => {
  await auctionHandler(ctx);
},
'аукцион': async (ctx) => {
  await auctionHandler(ctx);
},
'приложение': async (ctx) => {
  await sendMiniAppMessage(ctx);
},
// Обработчик команды "новый_босс"
'новый_босс': async (ctx) => {
  try {
    // Проверяем права администратора
    if (!(await isAdmin(ctx))) {
      return await ctx.reply('❌ У вас нет прав для выполнения этой команды.');
    }

    // Извлекаем аргументы после команды
    const args = ctx.message.text.split(/\s+/).slice(1);
    if (args.length < 3) {
      return await ctx.reply(
        '❌ Неверный формат команды. Используйте: новый_босс [название] [файл_изображения] [HP] [тип приза] [количество]'
      );
    }

    const [name, imageFile, hpStr] = args;
    const hp = parseInt(hpStr, 10);

    // Проверяем корректность HP
    if (isNaN(hp) || hp <= 0) {
      return await ctx.reply('❌ Некорректное значение HP. Укажите положительное число.');
    }

    // Вызываем функцию для создания нового босса
    await startNewBoss(ctx, name, imageFile, hp);
  } catch (error) {
    console.error('Ошибка при выполнении команды "новый_босс":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
},
'бос': async (ctx) => {
  await bossHandler(ctx);
},
'босс': async (ctx) => {
  await bossHandler(ctx);
},
'👾 босс': async (ctx) => {
  await bossHandler(ctx);
},
'боссс': async (ctx) => {
  // if (!(await isCommandAllowed(ctx))) return;
  await bossHandler(ctx);
},
'атака': async (ctx) => {
  const userId = ctx.from.id.toString();

  // Проверяем cooldown
  if (!checkCooldown(userId, 'upgrade_attack_power')) {
    return await ctx.reply('⏳ Подождите немного перед следующей попыткой.');
  }

  // Вызываем функцию повышения силы урона с обработкой ошибок
  await handleCallbackWithErrorHandling(ctx, async () => {
    await attackBoss(ctx);
  });
},
'энергия': async (ctx) => {
  await energyHandler(ctx);
},
'info_balance': async (ctx) => {
  await infoBalanceHandler(ctx);
},
'set_balance': async (ctx) => {
  await setBalanceHandler(ctx);
},
'дать_энергию': async (ctx) => {
  await giveEnergyHandler(ctx);
},
'забрать_энергию': async (ctx) => {
  await takeEnergyHandler(ctx);
},
'повысить урон': async (ctx) => {

  const userId = ctx.from.id.toString();

  // Проверяем cooldown
  if (!checkCooldown(userId, 'upgrade_attack_power')) {
    return await ctx.reply('⏳ Подождите немного перед следующей попыткой.');
  }

  // Вызываем функцию повышения силы урона с обработкой ошибок
  await handleCallbackWithErrorHandling(ctx, async () => {
    await upgradeAttackPower(ctx);
  });
},
'босс_топ': async (ctx) => {
  await bossTopHandler(ctx);
},
'блок_топа': async (ctx) => {
  await toggleTopVisibilityHandler(ctx);
},
'разблок_топа': async (ctx) => {
  await unblockTopVisibilityHandler(ctx);
},
'создать_префикс': async (ctx) => {
  await createSpecialPrefixCommand(ctx);
},
'выдать_спец_префикс': async (ctx) => {
  await assignSpecialPrefix(ctx);
},
'забрать_спец_префикс': async (ctx) => {
  await removeSpecialPrefix(ctx);
},
'сменить_ник': async (ctx) => {
  await changeNicknameByNumericIdHandler(ctx);
},
'список_оружия': async (ctx) => {
  await checkPlayerWeaponsAndDamage(ctx);
},

'сотрудничество': async (ctx) => {
  await handlePartnershipCommand(ctx);
},
'кейсы': async (ctx) => {
  await sendContainerInfoMessage(ctx);
},
'кейс': async (ctx) => {
  await sendContainerInfoMessage(ctx);
},
  'пополнить': async (ctx, parts) => {
    await topUpHandler(ctx);
  },
  'снять': async (ctx, parts) => {
    await withdrawHandler(ctx);
  },
'перевод': sendHandler,
'передать': sendHandler,
'перевести': sendHandler,
'магазин': showDonationShopMenu,
'шоп': showDonationShopMenu,
  'удалить промо': async (ctx, parts) => {
    if (parts.length !== 3) {
      return ctx.reply('Использование: удалить промо <id_промо>');
    }
    await deletePromoHandler(ctx);
  },
  'список промо': async (ctx, parts) => {
    if (parts.length !== 2) {
      return ctx.reply('Использование: список промо');
    }
    await listPromosHandler(ctx);
  },
  'добавить админа': async (ctx, parts) => {
    if (parts.length !== 3) {
      return ctx.reply('Использование: добавить админа [id]');
    }
    await addAdmin(ctx, parts[2]);
  },
  'удалить админа': async (ctx, parts) => {
    if (parts.length !== 3) {
      return ctx.reply('Использование: удалить админа [id]');
    }
    await removeAdmin(ctx, parts[2]);
  },
  'список админов': async (ctx, parts) => {
    if (parts.length !== 2) {
      return ctx.reply('Использование: список админов');
    }
    await listAdmins(ctx);
  },
  'админ панель': async (ctx, parts) => {
    if (parts.length !== 2) {
      return ctx.reply('Использование: админ панель');
    }
    await showAdminPanel(ctx);
  },
'бан': async (ctx) => {
  try {
    // Проверка прав администратора
    if (!(await isAdmin_ban(ctx))) {
      return;
    }

    const message = ctx.message;
    if (!message || !message.text) {
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    // Разбиваем текст сообщения на части
    const text = message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем, является ли это ответом на сообщение
    const repliedMessage = message.reply_to_message;
    let numericId = null;
    let banType = null; // Может быть временем бана или словом "навсегда"
    let reason = null;

    if (repliedMessage && repliedMessage.from) {
      // Если команда является ответом на сообщение, получаем id из базы данных
      const userToBan = await getUserById(repliedMessage.from.id.toString());
      if (!userToBan) {
        return ctx.reply('❕ Не удалось найти пользователя по его ID.');
      }
      numericId = userToBan.numeric_id; // Берем numeric_id из базы данных

      // Обрабатываем параметры после команды "бан" в ответе
      if (parts.length >= 2) {
        const secondParam = parts[1]; // Второй параметр после "бан"
        const thirdParamStartIndex = 2; // Индекс начала причины

        // Проверяем, является ли второй параметр числом (время бана)
        const parsedTime = parseFloat(secondParam);
        if (!isNaN(parsedTime) && parsedTime > 0) {
          banType = parsedTime; // Устанавливаем время бана
          reason = parts.slice(thirdParamStartIndex).join(' '); // Причина — всё, что идёт после времени
        } else {
          banType = 'навсегда'; // Если второй параметр не число, бан навсегда
          reason = parts.slice(1).join(' '); // Причина — всё, что идёт после "бан"
        }
      } else {
        banType = 'навсегда'; // По умолчанию бан навсегда
      }
    } else {
      // Если команда написана без ответа, numeric_id берется из текста команды
      numericId = parseInt(parts[1], 10);
      if (isNaN(numericId)) {
        return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: бан [id] [время_в_часах/навсегда] [причина].');
      }

      // Определяем тип бана и причину
      banType = parts[2]?.toLowerCase() === 'навсегда' ? 'навсегда' : parseFloat(parts[2]);
      reason = parts.slice(3).join(' ');
    }

    // Формируем новое сообщение с правильным форматом для banUserHandler
    const newMessageText = `бан ${numericId} ${banType} ${reason || ''}`.trim();
    ctx.message.text = newMessageText;

    // Вызываем обработчик banUserHandler
    await require('./admin/blacklistManagement').banUserHandler(ctx);
  } catch (error) {
    console.error('Ошибка при выполнении команды "бан":', error);
    await ctx.reply('❕ Произошла ошибка. Попробуйте позже.');
  }
},

'разбан': async (ctx) => {
  try {
    // Проверка прав администратора
    if (!(await isAdmin_ban(ctx))) {
      return;
    }

    const message = ctx.message;
    if (!message || !message.text) {
      return ctx.reply('❕ Некорректное сообщение. Команда должна содержать текст.');
    }

    // Разбиваем текст сообщения на части
    const text = message.text.trim();
    const parts = text.split(/\s+/);

    // Проверяем, является ли это ответом на сообщение
    const repliedMessage = message.reply_to_message;
    let numericId = null;

    if (repliedMessage && repliedMessage.from) {
      // Если команда является ответом на сообщение, получаем numeric_id из repliedMessage
      const userToUnban = await getUserById(repliedMessage.from.id.toString());
      if (!userToUnban) {
        return ctx.reply('❕ Не удалось найти пользователя по его ID.');
      }
      numericId = userToUnban.numeric_id; // Берем numeric_id из базы данных
    } else {
      // Если команда написана без ответа, numeric_id берется из текста команды
      numericId = parseInt(parts[1], 10);
      if (isNaN(numericId)) {
        return ctx.reply('❕ Некорректный числовой ID пользователя. Использование: разбан [id].');
      }
    }

    // Формируем новое сообщение с правильным форматом для unbanUserHandler
    const newMessageText = `разбан ${numericId}`;
    ctx.message.text = newMessageText;

    // Вызываем обработчик unbanUserHandler
    await require('./admin/blacklistManagement').unbanUserHandler(ctx);
  } catch (error) {
    console.error('Ошибка при выполнении команды "разбан":', error);
    await ctx.reply('❕ Произошла ошибка. Попробуйте позже.');
  }
},
  'рассылка': async (ctx, parts) => {
    // Проверка прав администратора
    if (!(await isAdmin(ctx))) {
      return; // Завершаем выполнение без отправки ответа, если нет прав
    }
    if (parts.length < 2) {
      return ctx.reply('Использование: рассылка [текст|цитата]');
    }
    await require('./admin/broadcast').broadcastMessage(ctx, parts);
  },
  'чс': async (ctx, parts) => {
    if (parts.length !== 1) {
      return ctx.reply('Использование: чс');
    }
    await require('./admin/blacklistManagement').listBannedPlayersHandler(ctx);
  },
'репорт': async (ctx, parts) => {
  try {
// Проверяем, есть ли текст репорта
const text = ctx.message.text.trim();
const reportText = text.split(/\s+/).slice(1).join(' '); // Объединяем всё после первого слова в одну строку

if (!reportText) {
  return ctx.reply(
    '❔ Укажите <b>текст репорта</b>. \n❕ <b>Использование:</b> репорт [текст]',
    { parse_mode: 'HTML' }
  );
}
    // Передаем управление в createReport с текстом репорта
    await require('./admin/reports').createReport(ctx, db, reportText); // Передаем db и текст репорта
  } catch (error) {
    console.error('Ошибка при обработке команды "репорт":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
},
  'ответить': async (ctx, parts) => {
    if (parts.length < 3) {
      return ctx.reply('Использование: ответить [номер_репорта] [текст_ответа]');
    }
    await require('./admin/reports').answerReport(ctx, db, parts); // Передаем db и parts
  },
  'список репортов': async (ctx, parts) => {
    if (parts.length !== 2) {
      return ctx.reply('Использование: список репортов');
    }
    await require('./admin/reports').getReports(ctx, db); // Передаем db
  },
'контейнер': async (ctx, parts) => {
    try {
        const text = ctx.message.text.trim().toLowerCase();
        const parts = text.split(/\s+/);

        // Парсим команду
        if (parts.length >= 3 && parts[1] === 'открыть') {
            const containerNumber = parseInt(parts[2], 10);
            const quantity = parts[3] ? parseInt(parts[3], 10) : 1; // По умолчанию 1

            // Валидация входных данных
            if (![1, 2, 3].includes(containerNumber)) {
                return ctx.reply('⚠️ <b>Ошибка:</b> Неверный номер контейнера. Доступные варианты: 1 (CLASSIC), 2 (PREMIUM), 3 (GOLD).', { parse_mode: 'HTML' });
            }

            if (isNaN(quantity) || quantity <= 0) {
                return ctx.reply('⚠️ <b>Ошибка:</b> Неверное количество. Укажите положительное число.', { parse_mode: 'HTML' });
            }

            // Проверка статуса пользователя
            const userId = ctx.from.id.toString();
            const userStatuses = await getUserStatuses(userId); // Получаем статусы пользователя

            let maxQuantity = 1; // По умолчанию максимум 1 контейнер

            if (userStatuses.includes('Администратор') || userStatuses.includes('Тех администратор')) {
                maxQuantity = Infinity; // Безлимит для администраторов
            } else if (userStatuses.includes('DIAMOND')) {
                maxQuantity = 50; // Максимум 50 для DIAMOND
            }

            if (quantity > maxQuantity) {
                return ctx.reply(`⚠️ <b>Ошибка:</b> \n\n•  Вы не можете открыть более ${maxQuantity} контейнер(ов) за раз.`, { parse_mode: 'HTML' });
            }

            // Вызываем обработчик открытия контейнера
            await openContainerHandler(ctx, containerNumber, quantity);
        } else if (parts.length === 4 && parts[1] === 'купить') {
            await buyContainerHandler(ctx);
        } else {
            return  ctx.reply('❕ <b>Использование</b>: контейнер купить [номер] [количество] или контейнер открыть [номер] [количество]', { parse_mode: 'HTML' });
        }
    } catch (error) {
        console.error('[КОНТЕЙНЕР] Ошибка:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
},
  'контейнеры': async (ctx) => {
    await containersHandler(ctx);
  },
  'конт': async (ctx) => {
    await containersHandler(ctx);
  },
  'конты': async (ctx) => {
    await containersHandler(ctx);
  },
  '📦 контейнеры': async (ctx) => {
    await containersHandler(ctx);
  },
  'список статусов': listStatusesHandler, // Добавляем обработчик списка статусов
  'наградить': awardStatusHandler,
  'разжаловать': removeStatusHandler, // Обработчик удаления статуса
  '/id': idHandler, // Техническая команда /id
  'ид': idHandler,
  '/prof': profHandler, // Техническая команда /prof
  'чек': profHandler,
  'гет': profHandler,
  'игровые режимы': gameModes,
  'дабл': gameModes,
'рулетка': async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    await rouletteHandler(ctx);
  });
},
'казино': async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    await rouletteHandler(ctx);
  });
},
'азино': async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    await rouletteHandler(ctx);
  });
},
  '🎮 игровые режимы': gameModes,
'выдать': async (ctx, parts) => {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(senderId))) {
      return; // Завершаем выполнение без ответа, если нет прав
    }

    // Проверяем минимальное количество аргументов
    if (parts.length < 4) {
      return ctx.reply('❌ Использование: выдать [тип] [ID игрока] [значение]');
    }

    const type = parts[1].toLowerCase(); // Тип приза ("пф" или "префикс")
    const numericId = parseInt(parts[2], 10); // ID игрока
    const value = parts[3]; // Значение (сумма или ID префикса)

    // Проверяем корректность ID игрока
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный ID игрока.');
    }

    // Логика для валюты
    if (type === 'пф') {
      let amount;
      try {
        amount = parseAmountWithSuffix(value); // Используем функцию для обработки "к"
      } catch (error) {
        return ctx.reply(`❌ ${error.message}`);
      }
      if (amount <= 0) {
        return ctx.reply('❌ Сумма должна быть положительной.');
      }
      await addBalanceHandler(ctx, [null, null, numericId, amount]); // Вызываем обработчик добавления баланса
    } 
    // Логика для префиксов
    else if (type === 'префикс') {
      const prefixId = parseInt(value, 10);
      if (isNaN(prefixId)) {
        return ctx.reply('❌ Некорректный ID префикса.');
      }
      await assignPrefix(ctx, [null, null, numericId, prefixId]); // Вызываем обработчик выдачи префикса
    } 
    // Неподдерживаемый тип
    else {
      return ctx.reply('❌ Неподдерживаемый тип приза. Используйте "пф" или "префикс".');
    }
  } catch (error) {
    console.error('[ВЫДАТЬ] Ошибка:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
},
// Обработка команды "забрать"
'забрать': async (ctx, parts) => {
  try {
    const senderId = ctx.from.id.toString();

    // Проверяем права "Тех администратора"
    if (!(await isTechAdmin(senderId))) {
      return; // Завершаем выполнение без ответа, если нет прав
    }

    // Проверяем минимальное количество аргументов
    if (parts.length < 4) {
      return ctx.reply('❌ Использование: забрать [тип] [ID игрока] [значение]');
    }

    const type = parts[1].toLowerCase(); // Тип приза ("пф" или "префикс")
    const numericId = parseInt(parts[2], 10); // ID игрока
    const value = parts[3]; // Значение (сумма или ID префикса)

    // Проверяем корректность ID игрока
    if (isNaN(numericId)) {
      return ctx.reply('❌ Некорректный ID игрока.');
    }

    // Логика для валюты
    if (type === 'пф') {
      let amount;
      try {
        amount = parseAmountWithSuffix(value); // Используем функцию для обработки "к"
      } catch (error) {
        return ctx.reply(`❌ ${error.message}`);
      }
      if (amount <= 0) {
        return ctx.reply('❌ Сумма должна быть положительной.');
      }
      await removeBalanceHandler(ctx, [null, null, numericId, amount]); // Вызываем обработчик удаления баланса
    } 
    // Логика для префиксов
    else if (type === 'префикс') {
      const prefixId = parseInt(value, 10);
      if (isNaN(prefixId)) {
        return ctx.reply('❌ Некорректный ID префикса.');
      }
      await removePrefix(ctx, [null, null, numericId, prefixId]); // Вызываем обработчик забирания префикса
    } 
    // Неподдерживаемый тип
    else {
      return ctx.reply('❌ Неподдерживаемый тип приза. Используйте "пф" или "префикс".');
    }
  } catch (error) {
    console.error('[ЗАБРАТЬ] Ошибка:', error);
    return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
},
  'промо': async (ctx, parts) => { // Добавляем обработчик "промо"
    if (parts.length < 2) {
      return ctx.reply('❕Использование: промо [название_промо]');
    }
    await usePromoHandler(ctx, db); // Передаем db
  },
// Обработка команды "мут"
'мут': async (ctx) => {
  try {
    // Проверяем, что команда используется не в приватном чате
    if (ctx.chat.type === 'private') {
      return; // В личных чатах команда игнорируется
    }

    // Вызываем готовый обработчик мута
    await muteUserHandler(ctx);
  } catch (error) {
    console.error('Ошибка при выполнении команды "мут":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
},

// Обработка команды "размут"
'размут': async (ctx) => {
  try {
    // Проверяем, что команда используется не в приватном чате
    if (ctx.chat.type === 'private') {
      return; // В личных чатах команда игнорируется
    }

    // Вызываем готовый обработчик размута
    await unmuteUserHandler(ctx);
  } catch (error) {
    console.error('Ошибка при выполнении команды "размут":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
},
  // Обработчик команды "статистика донатов"
  'донатная статистика': async (ctx) => {
    await require('./handlers/donationStats').getDonationStatistics(ctx);
  },
  'топ донатеров': async (ctx) => {
    await getTopDonators(ctx); // Add handler for "топ донатеров"
  },
  'топ_рефералов': async (ctx) => {
    await topReferralsHandler(ctx);
  },
  'мутлист': async (ctx) => {
    await listMutedPlayersHandler(ctx);
  },
  'все префиксы': async (ctx) => {
    await listAllPrefixes(ctx); // Показать все доступные префиксы
  },
  'мои префиксы': async (ctx) => {
  await listUserPrefixes(ctx);
},
// Обработка команды "сменить_реф"
'сменить_реф': async (ctx, parts) => {
  await changeReferralBonus(ctx, parts);
},
'задать_уровень': async (ctx, parts) => {
  await setCardLevelHandler(ctx, parts);
},
'сменить_реф_бонус_30000': async (ctx, parts) => {
  await setReferralBonusForAllUsers(ctx, parts);
},
'уведы вкл': async (ctx) => {
  await enableNotificationsHandler(ctx);
},
'уведы выкл': async (ctx) => {
  await disableNotificationsHandler(ctx);
},
'чатид': async (ctx) => {
  await sendChatIdToUser(ctx);
},
'dice': async (ctx) => {
  await diceHandler(ctx);
},
'удалить_репорт': async (ctx, parts) => {
  try {
    // Проверяем, что команда содержит правильное количество частей
    if (parts.length !== 2) {
      return ctx.reply('❌ Использование: удалить_репорт [номер_репорта]');
    }

    // Извлекаем ID репорта
    const reportId = parseInt(parts[1], 10);

    // Проверяем, является ли ID числом
    if (isNaN(reportId)) {
      return ctx.reply('❌ Некорректный ID репорта. Убедитесь, что это число.');
    }

    // Передаем управление в функцию удаления репорта
    await require('./admin/reports').deleteReportById(ctx, db, reportId);
  } catch (error) {
    console.error('[УДАЛЕНИЕ РЕПОРТА] Ошибка:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
},
'установить префикс': async (ctx, parts) => {
  await setActivePrefix(ctx, parts);
},
'!ник': async (ctx) => {
  await changeNicknameHandler(ctx); // Обработчик команды !ник
},
// Обработка команды "кик"
'кик': async (ctx) => {
  try {
    // Проверяем, что команда используется не в приватном чате
    if (ctx.chat.type === 'private') {
      return; // В личных чатах команда игнорируется
    }

    // Вызываем готовый обработчик кика
    await kickUserHandler(ctx);
  } catch (error) {
    console.error('Ошибка при выполнении команды "кик":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
},
// 'империя': async (ctx) => {
//   await empireHandler(ctx); 
// },
// 'give_business': async (ctx) => {
//   await giveBusinessHandler(ctx); 
// },
//   // Команда для полной информации об акциях (техническая)
//   'npf': async (ctx) => {
//     await handleNpfInfo(ctx);
//   },
//   'акции': async (ctx) => { // Алиас для /npf
//     await handleNpfInfo(ctx);
//   },

//   // Команда для покупки акций
//   'купить_акции': async (ctx) => {
//     await handleNpfBuyCommand(ctx); // Теперь вызывает функцию из npfShares.js
//   },

//   // Команда для продажи акций
//   'продать_акции': async (ctx) => {
//     await handleNpfSellCommand(ctx); // Теперь вызывает функцию из npfShares.js
//   },

//   // Команда для просмотра графика (всё время)
//   'npf_график': async (ctx) => {
//     await handleShowChart(ctx);
//   },
//   'график': async (ctx) => { // Алиас для /npf_график
//     await handleShowChart(ctx);
//   },

//   // --- Технические команды для "Тех администратора ---
//   // Команда для получения детальной информации (только для тех админа)
//   'npf_tech_info': async (ctx) => {
//     await handleNpfTechInfo(ctx);
//   },

//   // Команда для принудительного обновления курса (только для тех админа)
//   'force_update_course': async (ctx) => {
//     await handleForceUpdateCourse(ctx);
//   },
'конфеты': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'ивент': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'хэллоуин': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'хэллуин': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'хэлоуин': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'🎃 halloween event': async (ctx) => {
  const { candyHandler } = require('./Events/Halloween/candy');
  await candyHandler(ctx);
},
'выдать_конфеты': async (ctx, parts) => {
  await require('./Events/Halloween/adminCandy').giveCandyHandler(ctx);
},
'забрать_конфеты': async (ctx, parts) => {
  await require('./Events/Halloween/adminCandy').takeCandyHandler(ctx);
},
'обменник': async (ctx, parts) => {
  await require('./Events/Halloween/exchange.js').exchangeCandyToTickets(ctx);
},
'колесо': async (ctx) => {
  const { fortuneWheelHandler } = require('./Events/fortuneWheel');
  await fortuneWheelHandler(ctx);
},
'фортуна': async (ctx) => {
  const { fortuneWheelHandler } = require('./Events/fortuneWheel');
  await fortuneWheelHandler(ctx);
},
'фартуна': async (ctx) => {
  const { fortuneWheelHandler } = require('./Events/fortuneWheel');
  await fortuneWheelHandler(ctx);
},
'хэллоуин_шоп': async (ctx) => {
  const { candyShopMenu } = require('./Events/Halloween/candyShop');
  await candyShopMenu(ctx);
},
'скрепыш': async (ctx) => {
  await showSecretGiftMenu(ctx);
},
'кнопка': async (ctx) => {
  await handleTestCommand(ctx);
},
'выдать_билетики': async (ctx) => {
  await giveTicketsHandler(ctx);
},
'забрать_билетики': async (ctx) => {
  await takeTicketsHandler(ctx);
},
// 'логи': async (ctx) => { await logsHandler(ctx); },
// '/logs': async (ctx) => { await logsHandler(ctx); },

};


async function handlePrivateChat(ctx) {
  try {
    const text = ctx.message.text.trim(); // Сохраняем оригинальный текст (с учетом переносов строки)
    const lowerText = text.toLowerCase(); // Преобразуем текст в нижний регистр
    const parts = lowerText.split(/\s+/); // Разделяем сообщение на части по пробелам
    const command = parts[0]; // Первая часть — основная команда

    // Проверяем подписку пользователя
    const userId = ctx.from.id.toString();

    // Обработка многословных команд через processMultiWordCommand
    if (processMultiWordCommand(ctx, multiWordCommands)) {
      return;
    }
else {
      // Обработка специальных команд (!ник)
      if (lowerText.startsWith('!ник')) {
        try {
          await changeNicknameHandler(ctx, db); // Передаем db
        } catch (error) {
          logError(error); // Логируем ошибку
          await ctx.reply('Произошла ошибка при изменении никнейма.');
        }
        return;
      }

      // Обработка команды "бан"
      if (command === 'бан') {
        if (parts.length < 2) {
          return ctx.reply('Использование: бан [id] [причина] [время_в_часах] или "навсегда".');
        }

        // Вызов обработчика бана из blacklistManagement
        await require('./admin/blacklistManagement').banUserHandler(ctx);
        return;
      }

      // Обработка команды "разбан"
      if (command === 'разбан') {
        if (parts.length !== 2) {
          return ctx.reply('Использование: разбан [id]');
        }

        // Вызов обработчика разбана из blacklistManagement
        await require('./admin/blacklistManagement').unbanUserHandler(ctx);
        return;
      }

      // Обработка команды "чс"
      if (command === 'чс') {
        // Вызов обработчика списка заблокированных пользователей из blacklistManagement
        await require('./admin/blacklistManagement').listBannedPlayersHandler(ctx);
        return;
      }

      // Если команда не распознана
      console.warn(`Неизвестная команда "${lowerText}" для личного чата.`);
    }
  } catch (error) {
    logError(error); // Логируем ошибку
    await ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
  }
}

// Клавиатура для режима "дабл"
function createDoubleKeyboard() {
  return Markup.keyboard([
      ['х2', 'х3', 'х5', 'GAME'], // Первая строка (4 кнопки)
      ['Банк', 'Баланс', 'Донат', 'Бонус'] // Вторая строка (3 кнопки)
  ])
      .resize(); // Автоматически изменять размер клавиатуры
}

// Клавиатура для режима "дайс"
function createDiceKeyboard() {
  return Markup.keyboard([
      ['Dice', 'Банк', 'Донат'], // Первая строка (2 кнопки)
      ['Баланс', 'Рейтинг', 'Бонус'], // Вторая строка (2 кнопки)
      
  ])
      .resize(); // Автоматически изменять размер клавиатуры
}

// Функция для получения скидки на активацию промокода
function getActivationDiscount(statuses) {
  const statusNames = statuses.map(status => status.toLowerCase());
  if (statusNames.includes('diamond')) {
    return 0.5; // 50% скидка для DIAMOND
  } else if (statusNames.includes('platinum')) {
    return 0.35; // 35% скидка для PLATINUM
  } else if (statusNames.includes('gold')) {
    return 0.2; // 20% скидка для GOLD
  }
  return 0; // Нет скидки для других статусов
}


// Функция для обработки команд в публичных чатах
async function handlePublicChat(ctx, chatId, lowerText, command) {
  try {
    const isDoubleChatEnabled = await isDoubleChat(chatId);
    const isDiceChatEnabled = await isDiceChat(chatId);

    const getActiveMode = () => {
      if (isDoubleChatEnabled) return 'дабл';
      if (isDiceChatEnabled) return 'дайс';
      return null;
    };

    const activeMode = getActiveMode();

    // Проверка попытки активации нового режима в активном чате
    if ((isDoubleChatEnabled || isDiceChatEnabled) && lowerText.startsWith('активировать')) {
      return ctx.reply(`❕ В данном чате уже активен режим "${activeMode}".`);
    }

// Активация режима "дабл"
else if (lowerText.startsWith('активировать дабл')) {
  try {
    const parts = lowerText.split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply('❕ Некорректный формат команды. Использование: активировать дабл');
    }
    if (activeMode) {
      return ctx.reply(`❕ В данном чате уже активен режим "${activeMode}".`);
    }

    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❕ Для активации режима "дабл" необходимо иметь аккаунт.');
    }

    // Получаем статусы пользователя
    const userStatuses = await getUserStatuses(userId);

    // Рассчитываем стоимость активации с учетом скидки
    const baseCost = 100000; // Базовая стоимость активации
    const discount = getActivationDiscount(userStatuses); // Получаем скидку
    const discountedCost = Math.floor(baseCost * (1 - discount)); // Стоимость со скидкой

    // Проверяем баланс пользователя
    if (user.balance < discountedCost) {
      return ctx.reply(`❕ Для активации режима "дабл" требуется 100.000 PF на балансе.`);
    }

    // Активируем режим
    await activateDoubleMode(chatId);
    await updateUserBalance(userId, -discountedCost);

    // Формируем сообщение о скидке
    let discountMessage = '';
    if (discount > 0) {
      discountMessage = `💎 Ваш статус предоставляет скидку ${Math.floor(discount * 100)}%. `;
    }

    // Создаем клавиатуру для режима "дабл"
    const doubleKeyboard = createDoubleKeyboard();

    // Отправляем сообщение об успешной активации с новой клавиатурой
    await ctx.replyWithHTML(
      `☑️ Режим "<b>DOUBLE PLUS</b>" успешно активирован в этом чате.\n${discountMessage}` +
      `\n🪙 Списано с вашего баланса: <s>100 000</s> <b>${discountedCost} PF</b>`,
      { reply_markup: doubleKeyboard } // Устанавливаем клавиатуру
    );
  } catch (error) {
    logError(error);
    await ctx.reply('❕ Произошла ошибка при активации режима "дабл".');
  }
}


    // Деактивация режима "дабл"
    else if (lowerText.startsWith('деактивировать дабл')) {
      try {
        // Проверка прав администратора
        if (!(await isAdmin(ctx))) {
          return; // Завершаем выполнение без отправки ответа, если нет прав
        }

        const parts = lowerText.split(/\s+/);
        if (parts.length !== 2) {
          return ctx.reply('❕ Некорректный формат команды. Использование: деактивировать дабл');
        }
        if (activeMode !== 'дабл') {
          return ctx.reply(`❕ Невозможно деактивировать режим "дабл". В данном чате активен режим "${activeMode || 'никакой'}".`);
        }
        await deactivateDoubleMode(chatId);
        await ctx.replyWithHTML(`☑️ Режим "<b>DOUBLE PLUS</b>" успешно деактивирован в этом чате.`);
      } catch (error) {
        logError(error);
        await ctx.reply('❕ Произошла ошибка при деактивации режима "дабл".');
      }
    }


// Активация режима "дайс"
else if (lowerText.startsWith('активировать дайс')) {
  try {
    const parts = lowerText.split(/\s+/);
    if (parts.length !== 2) {
      return ctx.reply('❕ Некорректный формат команды. Использование: активировать дайс');
    }
    if (activeMode) {
      return ctx.reply(`❕ В данном чате уже активен режим "${activeMode}".`);
    }

    const userId = ctx.from.id.toString();
    const user = await getUserById(userId);
    if (!user) {
      return ctx.reply('❕ Для активации режима "дайс" необходимо иметь аккаунт.');
    }

    // Получаем статусы пользователя
    const userStatuses = await getUserStatuses(userId);

    // Рассчитываем стоимость активации с учетом скидки
    const baseCost = 50000; // Базовая стоимость активации
    const discount = getActivationDiscount(userStatuses); // Получаем скидку
    const discountedCost = Math.floor(baseCost * (1 - discount)); // Стоимость со скидкой

    // Проверяем баланс пользователя
    if (user.balance < discountedCost) {
      return ctx.reply(`❕ Для активации режима "дайс" требуется 50.000 PF на балансе.`);
    }

    // Активируем режим
    await activateDiceMode(chatId);
    await updateUserBalance(userId, -discountedCost);

    // Формируем сообщение о скидке
    let discountMessage = '';
    if (discount > 0) {
      discountMessage = `💎 Ваш статус предоставляет скидку ${Math.floor(discount * 100)}%. `;
    }

    // Создаем клавиатуру для режима "дайс"
    const diceKeyboard = createDiceKeyboard();

    // Отправляем сообщение об успешной активации с новой клавиатурой
    await ctx.replyWithHTML(
      `☑️ Режим "<b>DICE</b>" успешно активирован в этом чате.\n${discountMessage}` +
      `\n🪙 Списано с вашего баланса: <s>50 000</s> <b>${discountedCost} PF</b>`,
      { reply_markup: diceKeyboard } // Устанавливаем клавиатуру
    );
  } catch (error) {
    logError(error);
    await ctx.reply('❕ Произошла ошибка при активации режима "дайс".');
  }
}

    // Деактивация режима "дайс"
    else if (lowerText.startsWith('деактивировать дайс')) {
      try {
        // Проверка прав администратора
        if (!(await isAdmin(ctx))) {
          return; // Завершаем выполнение без отправки ответа, если нет прав
        }

        const parts = lowerText.split(/\s+/);
        if (parts.length !== 2) {
          return ctx.reply('❕ Некорректный формат команды. Использование: деактивировать дайс');
        }
        if (activeMode !== 'дайс') {
          return ctx.reply(`❕ Невозможно деактивировать режим "дайс". В данном чате активен режим "${activeMode || 'никакой'}".`);
        }
        await deactivateDiceMode(chatId);
        await ctx.replyWithHTML(`☑️ Режим "<b>DISE</b>" успешно деактивирован в этом чате.`);
      } catch (error) {
        logError(error);
        await ctx.reply('❕ Произошла ошибка при деактивации режима "дайс".');
      }
    }

    // Обработка команд вне зависимости от режимов
    else if (!isDoubleChatEnabled && !isDiceChatEnabled) {
      // Обработка многословных команд через processMultiWordCommand
      if (processMultiWordCommand(ctx, multiWordCommands)) {
        return;
      }
    }
    
// Обработка команд в активном режиме "дабл"
else if (isDoubleChatEnabled) {
  // Объекты для отслеживания cooldown'ов для разных команд
  const bankCooldowns = {};
  const balanceCooldowns = {};
  const donateCooldowns = {};
  const bonusCooldowns = {};
  const gameCooldowns = {};
  const multiplierCooldowns = {}; // Для множителей x2, x3, x5

  // Команды, связанные со ставками и банком
  if (
    lowerText === 'банк' || 
    /^([235]|игра|game)\s+(всё|все|[\d\w]+)([к]*)$/i.test(lowerText) || 
    /^(2|3|5|игра|game|х2|х3|х5)$/i.test(lowerText)
  ) {
    try {
      // Проверяем cooldown для команды "банк"
      if (lowerText === 'банк') {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = bankCooldowns[userId];
        const cooldownDuration = 5 * 1000; // 5 секунд для команды "банк"

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        bankCooldowns[userId] = currentTime;
      }

      // Проверяем cooldown для множителей (x2, x3, x5)
      if (/^(2|3|5|х2|х3|х5)$/i.test(lowerText)) {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = multiplierCooldowns[userId];
        const cooldownDuration = 3 * 1000; // 3 секунды для множителей

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        multiplierCooldowns[userId] = currentTime;
      }

      // Проверяем cooldown для команды "game"
      if (/^игра|game/i.test(lowerText)) {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = gameCooldowns[userId];
        const cooldownDuration = 4 * 1000; // 4 секунды для команды "game"

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        gameCooldowns[userId] = currentTime;
      }

      await doubleHandler(ctx, db);
    } catch (error) {
      logError(error);
      await ctx.reply('Произошла ошибка при обработке ставки или банка.');
    }
  } 
  // Разрешенные команды в режиме "дабл"
  else if (
    command === 'баланс' || 
    command === 'бонус' ||  
    command === 'бан' || 
    command === 'разбан' || 
    command === 'чс' || 
    command === 'мут' || 
    command === 'размут' || 
    command === 'мутлист' || 
    command === 'кик' || 
    command === 'наградить' || 
    command === 'конкурс' ||
    command === 'акция' ||
    command === 'промо' ||
    command === 'статистика' ||
    command === 'стата' || 
    command === 'снять' || 
    command === 'пополнить' || 
    command === 'перевод' ||
    command === 'передать' ||
    command === 'перевести' ||
    command === 'правила' || 
    command === 'топ' ||
    command === 'рейтинг' || 
    command === 'форбс' || 
    command === 'объявление' ||
    command === 'донат' ||
    command === '/prof' ||
    command === 'чек' ||
    command === 'чатид' ||
    command === 'гет' ||
    command === '/id' ||
    command === 'ид' || 
    command === '/buttons' || 
    command === 'бот' ||
    command === '/buttons@f_roobot' ||
    lowerText.startsWith('!ник') || 
    lowerText.startsWith('ник')
  ) {
    try {
      // Проверяем cooldown для команды "баланс"
      if (command === 'баланс') {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = balanceCooldowns[userId];
        const cooldownDuration = 5 * 1000; // 5 секунд для команды "баланс"

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        balanceCooldowns[userId] = currentTime;
      }

      // Проверяем cooldown для команды "бонус"
      if (command === 'бонус') {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = bonusCooldowns[userId];
        const cooldownDuration = 10 * 1000; // 10 секунд для команды "бонус"

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        bonusCooldowns[userId] = currentTime;
      }

      // Проверяем cooldown для команды "донат"
      if (command === 'донат') {
        const userId = ctx.from.id;
        const currentTime = Date.now();
        const lastRequestTime = donateCooldowns[userId];
        const cooldownDuration = 10 * 1000; // 10 секунд для команды "донат"

        if (lastRequestTime && currentTime - lastRequestTime < cooldownDuration) {
          return ctx.reply('❌ Не флудите, попробуйте ещё раз через пару секунд!');
        }

        // Обновляем время последнего запроса
        donateCooldowns[userId] = currentTime;
      }

      // Обработка остальных команд
      if (command === 'чс') {
        // Вызов обработчика списка заблокированных пользователей из blacklistManagement
        await require('./admin/blacklistManagement').listBannedPlayersHandler(ctx);
        return;
      }

      const handler = multiWordCommands[command] || changeNicknameHandler;
      await handler(ctx, db);
    } catch (error) {
      logError(error);
      await ctx.reply('Произошла ошибка при выполнении команды.');
    }
  } 
  // Уведомление о недоступности множителя х50
  else if (/^50\s/.test(lowerText)) {
    await ctx.reply(
      '❕ Множитель х50 отсутствует в режиме Double Plus.\n' +
      '❕ Доступные множители: x2, x3, x5, GAME.\n' +
      'Например: "игра 100" или "5 200"!'
    );
  } 
  // Игнорирование остальных команд
  else {
    console.warn(`Игнорирование команды "${command}" в чате "дабл".`);
  }
}

// Обработка команд в активном режиме "дайс"
else if (isDiceChatEnabled) {
  // Разрешенные команды в режиме "дайс"
  if (
    command === 'баланс' || 
    command === 'бонус' ||  
    command === 'бан' || 
    command === 'разбан' || 
    command === 'чс' || 
    command === 'мут' || 
    command === 'размут' || 
    command === 'мутлист' || 
    command === 'кик' || 
    command === 'наградить' || 
    command === 'конкурс' ||
    command === 'акция' ||
    command === 'промо' || 
    command === 'снять' || 
    command === 'dice' ||  
    command === 'пополнить' || 
    command === 'перевод' ||
    command === 'передать' ||
    command === 'перевести' ||
    command === 'правила' || 
    command === 'топ' ||
    command === 'рейтинг' || 
    command === 'форбс' || 
    command === 'объявление' ||
    command === '/prof' ||
    command === 'чек' ||
    command === 'чатид' ||
    command === 'гет' ||
    command === '/id' || 
    command === 'ид' ||
    command === '/buttons' ||
    command === 'бот' ||
    command === '/buttons@f_roobot' ||
    command === 'донат' || 
    lowerText.startsWith('!ник') || 
    lowerText.startsWith('ник')
  ) {
    try {

      // Обработка команды "чс"
      if (command === 'чс') {
        if (parts.length !== 1) {
          return ctx.reply('Использование: чс');
        }
        await require('./admin/blacklistManagement').listBannedPlayersHandler(ctx);
      } 
      // Остальные команды
      else {
        const handler = multiWordCommands[command] || changeNicknameHandler;
        await handler(ctx, db);
      }
    } catch (error) {
      logError(error);
      await ctx.reply('Произошла ошибка при выполнении команды.');
    }
  } 
  // Команды, связанные со ставками и банком
  else if (lowerText.startsWith('дайс ')) {
    try {
      const stakeParts = lowerText.split(/\s+/);
      if (stakeParts.length !== 2) {
        return ctx.reply('Некорректный формат команды. Использование: дайс <сумма>');
      }
      const amountInput = stakeParts[1];
      let amount;
      try {
        amount = parseBetAmount(amountInput);
      } catch (error) {
        return ctx.reply(error.message);
      }
      if (amount < 1) {
        return ctx.reply('❕️ Минимальная ставка — 1 PF.');
      }
      const result = await diceGame.handleBet(ctx.from.id, ctx.from.username, amount, chatId, bot);
      await ctx.reply(result.message);
    } catch (error) {
      logError(error);
      await ctx.reply('Произошла ошибка при обработке ставки.');
    }
  } 
  // Просмотр банка
  else if (lowerText === 'банк') {
    try {
      const bankInfo = diceGame.showBank(chatId);
      await ctx.reply(bankInfo, { parse_mode: 'HTML' });
    } catch (error) {
      logError(error);
      await ctx.reply('Произошла ошибка при просмотре ставок.');
    }
  } 
  // Игнорирование остальных команд
  else {
    console.warn(`Игнорирование команды "${command}" в чате "дайс".`);
  }
}
  } catch (error) {
    logError(error);
    await ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
  }
}
 
async function handleCallbackWithErrorHandling(ctx, handler) {
  try {
    await handler(ctx);
  } catch (error) {
    console.error('Ошибка при обработке:', error);

    // Обрабатываем ошибку 429 (слишком много запросов)
    if (error.response && error.response.error_code === 429) {
      const retryAfter = error.response.parameters?.retry_after || 0;

      // Логируем возникновение ошибки 429
      console.log(`[LOG] Ошибка 429: Слишком много запросов. Повторная попытка через ${retryAfter} секунд.`);

      // Отправляем уведомление пользователю
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery(`⏳ Слишком много запросов. Пожалуйста, подождите ${retryAfter} секунд.`);
        } catch (cbError) {
          console.error('[LOG] Не удалось отправить уведомление о кулдауне:', cbError);
        }
      } else {
        try {
          await ctx.reply(`⏳ Слишком много запросов. Пожалуйста, подождите ${retryAfter} секунд.`);
        } catch (replyError) {
          console.error('[LOG] Не удалось отправить сообщение о кулдауне:', replyError);
        }
      }

      // Ждем указанное время перед повторной попыткой
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

      // Логируем начало повторной попытки
      console.log('[LOG] Повторная попытка выполнить запрос после ошибки 429.');

      try {
        // Повторяем запрос
        await handler(ctx);
        console.log('[LOG] Повторная попытка завершилась успешно.');
      } catch (retryError) {
        // Логируем ошибку при повторной попытке
        console.error('[LOG] Повторная попытка завершилась ошибкой:', retryError);
        if (ctx.callbackQuery) {
          try {
            await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.');
          } catch (cbError) {
            console.error('[LOG] Не удалось отправить уведомление об ошибке:', cbError);
          }
        } else {
          try {
            await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
          } catch (replyError) {
            console.error('[LOG] Не удалось отправить сообщение об ошибке:', replyError);
          }
        }
      }
    } else {
      // Для всех остальных ошибок отправляем стандартное сообщение
      console.error('[LOG] Произошла другая ошибка:', error);
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.');
        } catch (cbError) {
          console.error('[LOG] Не удалось отправить уведомление об ошибке:', cbError);
        }
      } else {
        try {
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        } catch (replyError) {
          console.error('[LOG] Не удалось отправить сообщение об ошибке:', replyError);
        }
      }
    }
  }
}


const MAX_MESSAGE_AGE = 60 * 1000; // Максимальный возраст сообщения в миллисекундах (10 секунд)

// Глобальное хранилище для отслеживания cooldown'ов пользователей
const cooldowns = {
    global: {},        // Общий cooldown для всех сообщений
    specific: {        // Специфические cooldown'ы для команд
        game: {},
        bank: {},
        balance: {},
        donate: {},
        bonus: {},
        multiplier: {}
    }
};

// Middleware для обработки ошибок и пропуска ошибки 429
bot.use(async (ctx, next) => {
    try {
        await next();
    } catch (error) {
        if (error.response && error.response.error_code === 429) {
            const retryAfter = error.response.parameters?.retry_after || 5;
            console.warn(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
            // Просто игнорируем ошибку 429 без отправки ответа пользователю
            return;
        }
        logError(error);
        await ctx.reply('Произошла ошибка. Попробуйте через несколько секунд.');
    }
});

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
  try {
      const userId = ctx.from.id.toString();      
      const chatId = ctx.chat?.id;
      const chatType = ctx.chat?.type;
      const currentTime = Date.now();
      const text = ctx.message.text.trim();
      const { logMessage } = require('./db');
      logMessage(userId, chatType, chatId, ctx.chat?.title || null, text, text.startsWith('/'));
      const lowerText = text.toLowerCase();
    // ✅ ЛОГИРОВАНИЕ СООБЩЕНИЙ (вставить сюда)
    if (ctx.message && ctx.message.text) {
      await logFinance({
        type: 'message',
        actorUserId: ctx.from.id,
        targetUserId: null,
        amount: null,
        currency: null,
        ref: null,
        chatId: chatId,
        chatTitle: ctx.chat?.title,
        chatType: chatType,
        reason: null,
        action: text.substring(0, 500),
        payload: { is_command: text.startsWith('/') },
        success: 1,
      });
    }
      // ПРОВЕРКА: Если пользователь в процессе создания промокода
      const { handlePromoCreationMessage } = require('./handlers/promoHandler');
      const handledByPromoFlow = await handlePromoCreationMessage(ctx);
      if (handledByPromoFlow) {
        return; // Прерываем дальнейшую обработку, сообщение ушло в сессию
      }

      // Проверяем, является ли текущий чат игровым чатом "Угадай число"
      const isGuessNumberChat = chatId === GUESS_NUMBER_CHAT_ID;

      // Если это игровой чат, игнорируем все команды, кроме игры "Угадай число"
      if (isGuessNumberChat) {
          // Разрешаем только числовые сообщения и команды управления игрой
          if (
              !/^\d+$/.test(lowerText) && // Числа (для угадывания)
              !lowerText.startsWith('начать_игру') && // Команда запуска игры
              lowerText !== 'завершить_игру' // Команда завершения игры
          ) {
              console.log(`[ИГРА] Игнорируется сообщение в игровом чате: ${text}`);
              return; // Игнорируем сообщение
          }
      }

      // Продолжаем стандартную обработку для других чатов
      // Проверяем общий cooldown (0.5 секунды)
      const globalCooldownDuration = 500; // 0.5 секунды
      if (cooldowns.global[userId] && currentTime - cooldowns.global[userId] < globalCooldownDuration) {
          return; // Просто игнорируем сообщение без ответа
      }

      // Обновляем время последнего сообщения
      cooldowns.global[userId] = currentTime;

      // Проверяем специфические cooldown'ы
      let specificCooldownDuration = 0;

      if (/^(2|3|5|х2|х3|х5)$/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для множителей
          const lastTime = cooldowns.specific.multiplier[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.multiplier[userId] = currentTime;
      } else if (/^игра|game/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для игры
          const lastTime = cooldowns.specific.game[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.game[userId] = currentTime;
      } else if (/^банк$/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для банка
          const lastTime = cooldowns.specific.bank[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.bank[userId] = currentTime;
      } else if (/^баланс$/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для баланса
          const lastTime = cooldowns.specific.balance[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.balance[userId] = currentTime;
      } else if (/^донат$/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для доната
          const lastTime = cooldowns.specific.donate[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.donate[userId] = currentTime;
      } else if (/^бонус$/i.test(lowerText)) {
          specificCooldownDuration = 3000; // 3 секунды для бонуса
          const lastTime = cooldowns.specific.bonus[userId];
          if (lastTime && currentTime - lastTime < specificCooldownDuration) {
              return; // Игнорируем повторные запросы
          }
          cooldowns.specific.bonus[userId] = currentTime;
      }

      // Получаем сессию регистрации
      const registrationSession = getRegistrationSession(userId);

      // Проверяем время отправки сообщения
      const messageDate = ctx.message.date * 1000; // Время отправки сообщения в миллисекундах
      const now = Date.now();

      if (now - messageDate > MAX_MESSAGE_AGE) {
          return;
      }

      // Проверяем, существует ли пользователь в базе данных
      const user = await getUserById(userId);
      if (!user) {
          // Если пользователь не зарегистрирован и не начал процесс регистрации
          if (!registrationSession || !registrationSession.registrationInProgress) {
              await logAction(ctx, null, chatType, null, text, false); // Логируем ошибку
              return ctx.reply(
                  '🕹 Вы ещё не зарегистрированы. Для игры в нашего бота, необходимо зарегистрироваться через команду "/start"!',
                  { parse_mode: 'HTML' }
              );
          }
      }

      // Если пользователь находится на этапе решения капчи
      if (registrationSession?.captchaPending) {
          await logAction(ctx, user, chatType, null, text, false); // Логируем ошибку
          return ctx.reply(
              '📚 Для завершения регистрации необходимо пройти капчу!',
              { parse_mode: 'HTML' }
          );
      }

      // Если пользователь должен принять пользовательское соглашение
      if (!registrationSession?.policyAccepted) {
          await logAction(ctx, user, chatType, null, text, false); // Логируем ошибку
          return ctx.reply(
              '📚 Для завершения регистрации необходимо принять пользовательское соглашение(обязательно к прочтению)!',
              { parse_mode: 'HTML' }
          );
      }

      const parts = lowerText.split(/\s+/);
      const command = parts[0];

      await addChat(chatId);

      if (chatType === 'private') {
          await handlePrivateChat(ctx, command);
      } else if (chatType === 'group' || chatType === 'supergroup') {
          if (!chatId) {
              await logAction(ctx, user, chatType, null, text, false); // Логируем ошибку
              return ctx.reply('Произошла ошибка с определением чата.');
          }

          const isDoubleChatEnabled = await isDoubleChat(chatId);
          if (isDoubleChatEnabled && /^(2|3|5)\s+(\d+)([к]*)$/i.test(lowerText)) {
              await doubleHandler(ctx);
              await logAction(ctx, user, chatType, ctx.chat.title, text, true); // Логируем успешное выполнение
              return;
          }

          await handlePublicChat(ctx, chatId, lowerText, command);
      }

      // Логируем успешное выполнение команды
      await logAction(ctx, user, chatType, ctx.chat?.title, text, true);
  } catch (error) {
      // Логируем ошибку
      const user = await getUserById(ctx.from.id);
      const chatTitle = ctx.chat?.title || 'Неизвестный чат';
      await logAction(ctx, user, ctx.chat?.type, chatTitle, ctx.message.text.trim(), false);
      logError(error);
      await ctx.reply('Произошла ошибка. Попробуйте через несколько секунд.');
  }
});

bot.action('manage_profile', async (ctx) => {
  await handleManageProfile(ctx);
});

bot.action('enable_notifications', async (ctx) => {
  await enableNotificationsHandler(ctx);
});

bot.action('disable_notifications', async (ctx) => {
  await disableNotificationsHandler(ctx);
});

bot.action('toggle_hyperlink', async (ctx) => {
  await toggleHyperlinkHandler(ctx, db); // Убедитесь, что db доступен
});

bot.action('back_to_profile', async (ctx) => {
  await profileHandler(ctx);
});



// Обработчик callback-запросов для админ-панели
bot.action('list_admins', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleListAdmins(ctx);
    });
  }
});

bot.action('admin_commands', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleAdminCommands(ctx);
    });
  }
});

bot.action('close_panel', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleClosePanel(ctx);
    });
  }
});

// Настройка обработчиков кнопок
setupContainerHandlers(bot);

// Хранилище для временных блокировок (cooldown)
const cooldowns2 = {};

// Время блокировки в миллисекундах (например, 5 секунд)
const COOLDOWN_TIME = 500;

// Обработчик callback-запросов для открытия контейнеров
bot.action(/^open_container_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const userId = ctx.from.id.toString(); // ID пользователя
    const containerNumber = parseInt(ctx.match[1], 10); // Получаем номер контейнера из callback_data

    // Проверяем cooldown
    if (cooldowns2[userId] && Date.now() - cooldowns2[userId] < COOLDOWN_TIME) {
      const remainingTime = Math.ceil((COOLDOWN_TIME - (Date.now() - cooldowns2[userId])) / 1000);
      return ctx.answerCbQuery(`Подождите ${remainingTime} секунд перед следующим открытием.`);
    }

    // Устанавливаем время последнего нажатия
    cooldowns2[userId] = Date.now();

    // Используем универсальную функцию для обработки ошибок
    await handleCallbackWithErrorHandling(ctx, async () => {
      await openContainerHandler(ctx, containerNumber);
    });
  }
});

bot.action(/^game_choice_(-?\d+)_([a-z]+)$/, async (ctx) => {
  try {
    if (!(await checkUserStatus(ctx))) return ctx.answerCbQuery('❌ Вы не можете участвовать в игре.');
    const [, chatIdStr, choice] = ctx.match;
    const chatId = parseInt(chatIdStr, 10);
    const userId = ctx.from.id.toString();

    if (!doubleGame.round || Date.now() >= doubleGame.round.endTime) {
      return ctx.answerCbQuery('❕ Раунд уже завершен.');
    }
    if (!doubleGame.round.gameButtonActive) {
      return ctx.answerCbQuery('❕ Кнопки выбора недоступны.');
    }

    const bets = getDoubleBetsByRound(doubleGame.round.hash);
    const userBet = bets.find((b) => b.user_id === userId && b.multiplier === 'GAME');
    if (!userBet) return ctx.answerCbQuery('❕ Вы не участвуете в текущем раунде GAME.');

    const gKey = `global_choice_${userId}`;
    if (doubleGame.globalChoices[gKey] && doubleGame.globalChoices[gKey] !== choice) {
      return ctx.answerCbQuery(`❕ Вы уже выбрали ${doubleGame.globalChoices[gKey] === 'left' ? 'левую' : 'правую'} ячейку во всех чатах.`);
    }

    if (!doubleGame.recordGameChoice(userId, chatId, choice)) {
      return ctx.answerCbQuery('❕ Выбор уже сделан или кнопки неактивны.');
    }
    try { updateGameChoicesForRoundUser(doubleGame.round.hash, userId, chatId, choice); } catch (e) {}

    const userFromDb = await getUserById(userId);
    const userLink = createUserLink(userId, userFromDb?.username || 'Неизвестный');
    await ctx.answerCbQuery(`❕ Вы выбрали: ${choice === 'left' ? 'Левая' : 'Правая'}`);
    await ctx.replyWithHTML(`☑️ ${userLink}, ваш выбор записан: ${choice === 'left' ? '<b>Левая</b>' : '<b>Правая</b>'}`);
  } catch (error) {
    console.error('Ошибка при обработке выбора ячейки:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.');
  }
});


// Обработчик нажатия кнопок "Лайк" и "Дизлайк"
bot.action(/^report_feedback_(\d+)_(like|dislike)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const reportId = parseInt(ctx.match[1], 10); // ID репорта
      const feedbackType = ctx.match[2]; // Тип обратной связи: like или dislike
      
      // Проверяем, существует ли репорт
      const stmt = db.prepare('SELECT * FROM reports WHERE id = ? AND status = ?');
      const report = stmt.get(reportId, 'answered');
      if (!report) {
        return ctx.answerCbQuery('❕ Репорт не найден или уже был оценён.');
      }
      
      // Проверяем, оценивал ли пользователь этот репорт ранее
      if (report.user_feedback) {
        return ctx.answerCbQuery('❕ Вы уже оценили этот репорт.');
      }
      
      // Обновляем обратную связь пользователя
      const updateStmt = db.prepare(`
        UPDATE reports
        SET user_feedback = ?
        WHERE id = ?
      `);
      updateStmt.run(feedbackType, reportId);
      
      // Получаем данные администратора
      const adminId = report.admin_id;
      const adminUser = getUserById(adminId);
      if (adminUser) {
        // Обновляем статистику администратора
        if (feedbackType === 'like') {
          incrementLikesReceived(adminId); // Увеличиваем количество лайков
          updateUserDFBalance(adminId, 1); // Начисляем 1 DF за лайк
        } else if (feedbackType === 'dislike') {
          incrementDislikesReceived(adminId); // Увеличиваем количество дизлайков
        }
        
        // Отправляем уведомление администратору
        const feedbackMessage = feedbackType === 'like' 
          ? `👍 Ваш ответ на репорт №${reportId} был оценён <b>положительно</b>.\n💰На ваш баланс <b>начислено</b>: 1 DF.` 
          : `👎 Ваш ответ на репорт №${reportId} был оценён <b>отрицательно</b>.\n🫡Старайтесь лучше`;
        await ctx.telegram.sendMessage(adminId, feedbackMessage, { parse_mode: 'HTML' });
      }
      
      // Ответ пользователю
      const feedbackResponse = feedbackType === 'like' 
        ? '✅ <b>Спасибо за вашу оценку! Администратору начислено 1 DF.</b>' 
        : '✅ Спасибо за вашу оценку!';
      await ctx.answerCbQuery(feedbackResponse, { parse_mode: 'HTML' });
    });
  }
});

// Обработчик кнопки "участвовать"
bot.action(/^participate_(.+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const roundId = ctx.match[1]; // Извлекаем roundId из callback_data
      const chatId = ctx.chat.id;
      const userId = ctx.from.id.toString();
      const usernameFromTelegram = ctx.from.username;

      // Получаем активные раунды для чата
      const activeRounds = diceGame.chatRounds[chatId] || [];
      const round = activeRounds.find((r) => r.roundId === roundId);

      // Проверяем, существует ли раунд
      if (!round) {
        return ctx.answerCbQuery('❌ Раунд не найден или уже завершен.');
      }

      // Проверяем, не истекло ли время регистрации
      if (Date.now() > round.endTime) {
        return ctx.answerCbQuery('❌ Время регистрации ставок истекло.');
      }

      // Проверяем, участвует ли пользователь уже в раунде
      if (Object.keys(round.participants || {}).includes(userId)) {
        return ctx.answerCbQuery('❌ Вы уже участвуете в этом раунде.');
      }

      // Проверяем ограничение по количеству участников
      if (Object.keys(round.participants || {}).length >= round.maxParticipants) {
        return ctx.answerCbQuery('❌ Максимальное количество участников достигнуто.');
      }

      // Регистрируем ставку
      const result = await diceGame.handleBet(userId, usernameFromTelegram, round.roundAmount, chatId, bot);
      if (result.success) {
        // Создаем гиперссылку на пользователя
        const userLink = createUserLink(userId, usernameFromTelegram || 'Неизвестный');

        // Отправляем сообщение в чат
        await ctx.telegram.sendMessage(
          chatId,
          `🎲 ${userLink} зарегистрировался в раунде дайса с суммой ставки ${round.roundAmount.toLocaleString('ru-RU')} PF.`,
          { parse_mode: 'HTML' }
        );

        // Подтверждаем действие пользователю
        await ctx.answerCbQuery(`✅ Ставка ${round.roundAmount.toLocaleString('ru-RU')} PF принята.`);
      } else {
        await ctx.answerCbQuery(`❌ ${result.message}`);
      }
    });
  }
});

// Обработчик кнопки "Повторить"
bot.action(/^repeat_round_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const betAmount = parseInt(ctx.match[1], 10); // Извлекаем сумму ставки из callback_data
      const chatId = ctx.chat.id;
      const userId = ctx.from.id.toString();
      const usernameFromTelegram = ctx.from.username;

      // Проверяем, активен ли уже раунд с такой суммой ставки
      const activeRounds = diceGame.chatRounds[chatId] || [];
      const existingRound = activeRounds.find((round) => round.roundAmount === betAmount);
      if (existingRound) {
        return ctx.answerCbQuery('❕ Раунд с такой суммой ставки уже активен.');
      }

      // Создаем новый раунд
      const startResult = diceGame.startRound(chatId, bot, betAmount);
      if (!startResult.success) {
        return ctx.answerCbQuery(startResult.message || 'Произошла ошибка при запуске нового раунда.');
      }

      // Получаем созданный раунд
      const updatedActiveRounds = diceGame.chatRounds[chatId] || [];
      const newRound = updatedActiveRounds.find((round) => round.roundAmount === betAmount);
      if (!newRound) {
        return ctx.answerCbQuery('❌ Не удалось найти созданный раунд.');
      }

      // Проверяем баланс пользователя перед регистрацией ставки
      const user = await getUserById(userId);
      if (!user || user.balance < betAmount) {
        return ctx.answerCbQuery('❌ Недостаточно средств для регистрации в раунде.');
      }

      // Регистрируем ставку пользователя в новом раунде
      const handleBetResult = await diceGame.handleBet(userId, usernameFromTelegram, betAmount, chatId, bot);
      if (!handleBetResult.success) {
        return ctx.answerCbQuery(`❌ ${handleBetResult.message}`);
      }

      // Создаем гиперссылку на пользователя
      const userLink = createUserLink(userId, usernameFromTelegram || 'Неизвестный');

      // Отправляем сообщение в чат
      await ctx.telegram.sendMessage(
        chatId,
        `🎲 ${userLink} зарегистрировал новый раунд дайса с суммой ставки ${betAmount.toLocaleString('ru-RU')} PF.`,
        { parse_mode: 'HTML' }
      );

      // Подтверждаем действие пользователю
      await ctx.answerCbQuery(`🎲 Новый раунд дайса начат с суммой ставки ${betAmount} PF. Ваша ставка принята.`);
    });
  }
});


// Обработка callback-запросов для донатов
bot.action(/^donate_(\d+)$/, async (ctx) => {
  try {
      const userId = ctx.from.id.toString();
      const amount = parseInt(ctx.match[1], 10); // Получаем сумму доната из callback_data

      // Передаем управление в функцию handleDonation
      await handleDonation(ctx, userId, amount, bot);
  } catch (error) {
      console.error(error);
      await ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка предварительного запроса (pre_checkout_query)
bot.on('pre_checkout_query', async (ctx) => {
  try {
      console.log(`Предварительный запрос на оплату:`, ctx.preCheckoutQuery);

      // Подтверждаем предварительный запрос
      await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
      console.error(`Ошибка при обработке pre_checkout_query:`, error);
      await ctx.answerPreCheckoutQuery(false, 'Произошла ошибка при подтверждении платежа.');
  }
});

// Обработка успешного платежа
bot.on('message', async (ctx) => {
  try {
      if (ctx.message.successful_payment) {
          const { total_amount } = ctx.message.successful_payment;
          const userId = ctx.from.id.toString();
          console.log(`[DEBUG] Обработчик платежей: Получен успешный платеж от пользователя ${userId}`);
          console.log(`[DEBUG] Обработчик платежей: Сумма доната: ${total_amount} звезд`);

          // Начисляем награду игроку
          const rewardAmount = total_amount * 10; // 1 звезда = 10 DF

          updateUserDFBalance(userId, rewardAmount);
          updateTotalDonatedStars(userId, total_amount, db);
          addDonationToHistory(userId, total_amount, db);

          // Проверяем, является ли пользователь рефералом
          const referrerId = await getReferrerId(userId); // Получаем ID реферера
          if (referrerId) {
              const referrerBonus = Math.floor(rewardAmount * 0.1); // 10% от награды
              updateUserDFBalance(referrerId, referrerBonus);

              // Уведомляем реферера о бонусе
              await ctx.telegram.sendMessage(
                  referrerId,
                  `☑️ Вы получили +${referrerBonus} DF за донат вашего реферала!`,
                  { parse_mode: 'HTML' }
              );
          }

          // Отправляем уведомление о донате в специальный чат
          await sendDonationNotification(ctx, userId, total_amount);

          // Создаем инлайн-клавиатуру с кнопкой "Статистика донатов"
          const keyboard = {
              inline_keyboard: [
                  [{ text: '📊 Статистика донатов', callback_data: 'donation_stats' }]
              ]
          };

          // Отправляем сообщение с благодарностью и кнопкой
          await ctx.replyWithHTML(
              `<b>😇 Спасибо!</b>\n` +
              `🍩 Ваш донат на сумму ${total_amount} звезд успешно принят.`,
              { reply_markup: keyboard }
          );

          await ctx.replyWithHTML(
              `🍩 Вам зачислено: <b>${rewardAmount} DF</b>`,
              { parse_mode: 'HTML' }
          );
      }
  } catch (error) {
      console.error(`Ошибка при обработке успешного платежа для пользователя ${ctx.from.id}:`, error);
      await ctx.reply('Произошла ошибка при обработке платежа.');
  }
});

// Обработка callback-запроса для кнопки "Статистика донатов"
bot.action('donation_stats', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const userId = ctx.from.id.toString();
      await require('./handlers/donationStats').getDonationStatistics(ctx);
    });
  }
});

// Обработка отмены доната
bot.action('donate_cancel', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      console.log(`Отмена доната пользователем ${ctx.from.id}`);
      await ctx.answerCbQuery('😢 Донат отменен.');
      await ctx.deleteMessage();
    });
  }
});

// Обработчик переключения страниц в магазине
bot.action(/^page_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handlePageChange(ctx);
    });
  }
});

// Открытие меню статистики
bot.action('show_statistics', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await showStatisticsMenu(ctx);
    });
  }
});

// Игровая статистика
bot.action('statistics_handler', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await statisticsHandler(ctx);
    });
  }
});

// Статистика донатов
bot.action('donation_statistics', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await getDonationStatistics(ctx);
    });
  }
});

// Обработчик выбора скина для покупки
bot.action('select_skin_to_buy', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleSelectSkinToBuy(ctx);
    });
  }
});

// Обработчик навигации между скинами в режиме покупки
bot.action(/^(prev|next)_skin_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleSkinNavigation(ctx);
    });
  }
});

// Обработчик покупки скина
bot.action(/^buy_skin_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleBuySkin(ctx);
    });
  }
});

// Обработчик применения скина
bot.action(/^apply_skin_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleApplySkin(ctx);
    });
  }
});

bot.action('partnership_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handlePartnershipCommand(ctx);
    });
  }
});

bot.action('open_containers', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await containersHandler(ctx);
    });
  }
});

// Обработчик закрытия магазина
bot.action('close_shop', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleCloseShop(ctx);
    });
  }
});

// Обработчик просмотра "моих скинов"
bot.action('my_skins', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleMySkins(ctx);
    });
  }
});

// Обработчик навигации между "моими скинами"
bot.action(/^(prev|next)_my_skin_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleMySkinsNavigation(ctx, ctx.match[1]);
    });
  }
});

// Обработчик возврата в магазин скинов
bot.action('to_shop', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleToShop(ctx);
    });
  }
});


// Обработчик правильного ответа на капчу
bot.action(/^captcha_\w+$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleCaptchaCorrect(ctx);
    });
  }
});

// Обработчик неправильного ответа на капчу
bot.action(/^wrong_\w+$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleCaptchaWrong(ctx);
    });
  }
});

// --- Регистрация обработчиков капчи казино ---
bot.action(/^casino_captcha_\d+$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await casinoCaptchaCorrectHandler(ctx);
      });
  }
});

bot.action(/^casino_wrong_\d+$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await casinoCaptchaWrongHandler(ctx);
      });
  }
});

// Обработчик принятия политики конфиденциальности
bot.action('accept_policy', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handlePrivacyPolicyAcceptance(ctx);
    });
  }
});

// Обработчик ссылки для реферальной системы
bot.action('referral_link', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await referralLinkHandler(ctx);
    });
  }
});

const donationShop = require('./donations/donationShop'); // Импортируем модуль для донат-шопа

// Обработчик кнопки "Донат"
bot.action('donate', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleDonationCommand(ctx); // Вызываем обработчик из модуля donations/donationShop
    });
  }
});

// Обработчик кнопки "Пополнить баланс"
bot.action('donate_balance', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await sendDonationOptions(ctx); // Вызываем функцию для пополнения баланса
    });
  }
});

// Обработчик кнопки "Донат шоп"
bot.action('donate_shop', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showDonationShopMenu(ctx); // Показываем меню донат-шопа
    });
  }
});

// Обработчик кнопки "Назад"
bot.action('donate_back', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showDonationMenu(ctx); // Возвращаемся к начальному меню доната
    });
  }
});

// Обработчик кнопки "Валюта (PF)"
bot.action('donate_currency_pf', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showCurrencyPFMenu(ctx); // Показываем меню покупки валюты
    });
  }
});

// Обработчики покупки валюты
bot.action('buy_pf_15000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 20000, 180); // 15.000 PF за 130 DF
    });
  }
});

bot.action('buy_pf_50000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 100000, 900); // 50.000 PF за 420 DF
    });
  }
});

bot.action('buy_pf_100000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 500000, 3600); // 500.000 PF за 3600 DF
    });
  }
});

bot.action('buy_pf_250000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 1000000, 6800); // PF за 000 DF
    });
  }
});

bot.action('buy_pf_1000000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 3000000, 17900); // 3.000.000 PF за 00 DF
    });
  }
});

bot.action('buy_pf_2250000', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyPF(ctx, 10000000, 44750); //  PF за DF
    });
  }
});

// Обработчик кнопки "Информация о PF"
bot.action('pf_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showPFInfo(ctx); // Показываем информацию о PF
    });
  }
});

// Обработчик кнопки "Назад" в меню валюты
bot.action('donate_currency_pf_back', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп
    });
  }
});

// Обработчик кнопки "Статусы"
bot.action('donate_statuses', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showStatusesMenu(ctx); // Показываем меню покупки статусов
    });
  }
});

// Обработчики покупки статусов
bot.action('buy_status_gold', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyStatus(ctx, 'GOLD', 899, 6); // 899 DF за статус GOLD (ID 6)
    });
  }
});

bot.action('buy_status_platinum', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyStatus(ctx, 'PLATINUM', 1999, 5); // 1999 DF за статус PLATINUM (ID 5)
    });
  }
});

bot.action('buy_status_diamond', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyStatus(ctx, 'DIAMOND', 4499, 4); // 4499 DF за статус DIAMOND (ID 4)
    });
  }
});

bot.action('buy_status_admin', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyStatus(ctx, 'Администратор', 6499, 1); // 6499 DF за статус Администратор (ID 1)
    });
  }
});

// Обработчик кнопки "Информация о статусах"
bot.action('status_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showStatusInfo(ctx); // Показываем информацию о статусах
    });
  }
});

// Обработчик кнопки "Назад" в меню валюты
bot.action('donate_statuses_back', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп
    });
  }
});

// Обработчики кнопок информации о конкретных статусах
bot.action('status_info_Администратор', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleStatusInfo(ctx, 'Администратор'); // Показываем информацию о статусе Администратор
    });
  }
});

bot.action('status_info_DIAMOND', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleStatusInfo(ctx, 'DIAMOND'); // Показываем информацию о статусе DIAMOND
    });
  }
});

bot.action('status_info_PLATINUM', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleStatusInfo(ctx, 'PLATINUM'); // Показываем информацию о статусе PLATINUM
    });
  }
});

bot.action('status_info_GOLD', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleStatusInfo(ctx, 'GOLD'); // Показываем информацию о статусе GOLD
    });
  }
});

// Обработчик кнопки "Назад" из меню информации о статусах
bot.action('status_info_back', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showStatusesMenu(ctx); // Возвращаемся в меню покупки статусов
    });
  }
});



// Обработчик кнопки "Контейнеры"
bot.action('donate_containers', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showContainersMenu(ctx); // Показываем меню покупки контейнеров
    });
  }
});

// Обработчики покупки контейнеров
bot.action('buy_container_1', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyContainer(ctx, 1, 200); // 1 контейнер за 100 DF
    });
  }
});

bot.action('buy_container_5', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyContainer(ctx, 5, 900); // 5 контейнеров за 449 DF
    });
  }
});

bot.action('buy_container_25', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyContainer(ctx, 25, 4500); // 25 контейнеров за 2299 DF
    });
  }
});

bot.action('buy_container_100', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.handleBuyContainer(ctx, 100, 17000); // 100 контейнеров за 8499 DF
    });
  }
});

// Обработчик кнопки "Информация о контейнерах"
bot.action('container_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showContainerInfo(ctx); // Показываем информацию о контейнерах
    });
  }
});

// Обработчик кнопки "Назад" в меню контейнеров
bot.action('donate_containers_back', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп
    });
  }
});

// Обработчик кнопки "Скины"
bot.action('donate_skins', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await skinShopHandler(ctx); // Вызываем функцию из импортированного модуля
    });
  }
});

// Обработчик кнопки "Мои рефералы"
bot.action('my_referrals', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleMyReferrals(ctx); // Вызываем обработчик без проверок
    });
  }
});

bot.action('my_prefixes', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await listUserPrefixes(ctx); // Вызываем обработчик без проверок
    });
  }
});

// Обработчик кнопки "Реф инфо"
bot.action('ref_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleRefInfo(ctx); // Вызываем обработчик без проверок
    });
  }
});

bot.action('top_pf', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./handlers/top').forbesHandler(ctx, db);
    });
  }
});

bot.action('top_players', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./handlers/top').forbesHandler(ctx, db);
    });
  }
});


bot.action('top_referrals', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./handlers/top').handleTopReferrals(ctx);
    });
  }
});


// Обработка кнопок
bot.action('contest_info', async (ctx) => {
  await handleContestInfo(ctx);
});

bot.action('top_seasonal_referrals', async (ctx) => {
  await topSeasonalReferralsHandler(ctx);
});

bot.action('back_to_ref_menu', async (ctx) => {
  await handleBackToRefMenu(ctx);
});
// В bot.action добавляем новый обработчик
bot.action('top_seasonal_referrals', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./handlers/referralSystem').topSeasonalReferralsHandler(ctx);
    });
  }
});

bot.action('top_donators', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./handlers/top').handleTopDonators(ctx);
    });
  }
});

bot.action('topup_card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await showTopUpInstruction(ctx); // Вызов функции с инструкциями
      });
  }
});








// Обработчики покупки статусов по акции

bot.action(/buy_discounted_status_(.+)/, async (ctx) => {
  try {
    const [_, statusName] = ctx.match; // Извлекаем только название статуса
    const availableStatuses = [
      { name: 'GOLD', cost: 674, id: 6 },         // 899 - 25% = 674
      { name: 'PLATINUM', cost: 1499, id: 5 },   // 1999 - 25% = 1499
      { name: 'DIAMOND', cost: 3374, id: 4 },    // 4499 - 25% = 3374
      { name: 'Администратор', cost: 4874, id: 1 }, // 6499 - 25% = 4874
    ];

    // Находим соответствующий статус
    const selectedStatus = availableStatuses.find(
      (status) => status.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!selectedStatus) {
      return ctx.reply('❌ Неверный запрос. Попробуйте снова.');
    }

    // Вызываем функцию обработки покупки статуса
    await handleBuyDiscountedStatus(ctx, selectedStatus.name, selectedStatus.cost, selectedStatus.id);
  } catch (error) {
    console.error('Ошибка при покупке статуса:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Обработчик кнопки "Назад" в меню акций
bot.action('donate_shares_back', async (ctx) => {
  try {
    // Возвращаемся к основному меню донат-шопа
    await showDonationShopMenu(ctx);
  } catch (error) {
    console.error('Ошибка при возврате из меню акций:', error);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

//=============================












// Обработчики действий для кнопок
bot.action('double_plus', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleDoublePlusButton(ctx);
    });
  }
});

bot.action('dice', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleDiceButton(ctx);
    });
  }
});

bot.action('roulete', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      // Подтверждаем нажатие кнопки
      await ctx.answerCbQuery();

      // Редактируем сообщение или отправляем новое с подсказкой
      await ctx.editMessageText(
        '🎰 Для игры в казино введите команду:\n<code>казино</code> сумма_ставки\n\nℹ️Например: <code>казино 1к</code>',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад', callback_data: 'back_to_modes' }]
            ]
          }
        }
      );
    });
  }
});

bot.action('about_double_plus', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleAboutDoublePlusButton(ctx);
    });
  }
});

bot.action('about_dice', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleAboutDiceButton(ctx);
    });
  }
});

bot.action('back_to_modes', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleBackToModesButton(ctx);
    });
  }
});
//============================
// Обработчик кнопки "Регистрация карты"
bot.action('register_card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleRegisterCardAction(ctx);
    });
  }
});

// Обработчик кнопок управления картой
bot.action('manage_card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleManageCardButton(ctx);
    });
  }
});

// Обработчик кнопок магазина скинов
bot.action('skin_shop', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await skinShopHandler(ctx);
    });
  }
});

bot.action('card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await cardInfoHandler(ctx);
    });
  }
});

// Обработчик кнопок информации о карте
bot.action('card_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleCardInfoButton(ctx);
    });
  }
});

// Обработчик кнопок возврата в меню карты
bot.action('back_to_card_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await cardInfoHandler(ctx);
    });
  }
});


// Обработчик кнопки "Закрыть меню карты"
bot.action('close_card_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) { // Предполагается, что checkUserStatus существует
    await handleCallbackWithErrorHandling(ctx, async () => { // Предполагается, что handleCallbackWithErrorHandling существует
      try {
        // Пытаемся удалить сообщение с меню карты
        // ctx.update.callback_query.message.message_id содержит ID сообщения, на которое нажали кнопку
        if (ctx.update?.callback_query?.message?.message_id) {
          await ctx.deleteMessage(ctx.update.callback_query.message.message_id);
        } else {
          // Если по какой-то причине ID сообщения недоступен, просто отправим сообщение
          await ctx.reply('❌ Меню карты закрыто.');
        }
        // Подтверждаем нажатие кнопки
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Ошибка при закрытии меню карты:', error);
        // Отправляем сообщение пользователю, если удаление не удалось
        await ctx.reply('❌ Не удалось закрыть меню. Сообщение может быть слишком старым.');
        // Подтверждаем нажатие кнопки даже в случае ошибки
        await ctx.answerCbQuery();
      }
    });
  }
});


//Обработчик кнопки "Назад" из сетки прокачки (возврат к меню прокачки)
bot.action('upgrade_card_level', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleUpgradeCardLevel(ctx); // Повторный вызов этой функции
      await ctx.answerCbQuery();
    });
  }
});

// Обработчик кнопки подтверждения повышения уровня
bot.action(/upgrade_level_confirm_(\d+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) { // Предполагается, что checkUserStatus существует
    await handleCallbackWithErrorHandling(ctx, async () => { // Предполагается, что handleCallbackWithErrorHandling существует
      const targetLevel = parseInt(ctx.match[1], 10);
      if (isNaN(targetLevel) || targetLevel < 1 || targetLevel > 20) {
         await ctx.reply('❌ Некорректный уровень для повышения.');
         await ctx.answerCbQuery();
         return;
      }
      // Вызываем функцию выполнения повышения уровня
      await performLevelUpgrade(ctx, targetLevel);
    });
  }
});

// Обработчик кнопки "Сетка прокачки"
bot.action('show_upgrade_grid', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleShowUpgradeGrid(ctx);
    });
  }
});

// Обработчик кнопок возврата в главное меню
bot.action('back_to_main_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await ctx.reply('Вы вернулись в главное меню.');
    });
  }
});
//=====================================
// Обработчик кнопок информации о карте
bot.action('card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await cardInfoHandler(ctx);
    });
  }
});

// Обработчик кнопок курса обмена
bot.action('exchange_rate', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleExchangeRate(ctx);
    });
  }
});

// Обработчик кнопок финансов
bot.action('finance', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleFinance(ctx);
    });
  }
});

// Обработчик кнопок P2P
bot.action('p2p', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleP2P(ctx);
    });
  }
});

// Регистрация обработчика кнопки отключения уведомлений
bot.action(/disable_notifications:(\d+)/, async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    await handleNotificationButton(ctx);
  });
});

// Регистрация обработчика кнопки включения уведомлений
bot.action('enable_notifications', async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    await handleEnableNotificationsButton(ctx);
  });
});


// Обработчик кнопки "Уникальные предложения"
bot.action('donate_unique_offers', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./donations/donationShop').showUniqueOffersMenu(ctx);
    });
  }
});

// Обработчик кнопки "Акции"
bot.action('donate_shares', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await ctx.replyWithHTML(
        `🚀 <b>Акции</b>\n\n` +
        `На данный момент никаких акций не проводится!\n\n` +
        `Следите за новостями в нашем канале: t.me/FBot42`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад', 'donate_back')],
        ])
      );
    });
  }
});

// // Обработчик кнопки "Акции"
// bot.action('donate_shares', async (ctx) => {
//   if (await checkUserStatus(ctx)) {
//     await handleCallbackWithErrorHandling(ctx, async () => {
//       await showSharesMenu(ctx); // Используем функцию показа меню акций
//     });
//   }
// });

// Добавляем обработчик кнопок status_list_
bot.action(/status_list_(.+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      try {
        // Вызываем нашу функцию handleStatusList, которая формирует файлы
        await handleStatusList(ctx);
      } catch (error) {
        console.error('Ошибка при обработке списка статусов:', error);
        await ctx.reply('❌ Произошла ошибка при формировании списка.');
      }
    });
  }
});

// Обработчик callback-запросов для кнопок ставок
bot.action(/^bet_(x\d+|GAME)_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const [, multiplier, amount] = ctx.match;
      const userId = ctx.from.id;
      const userFromDb = await getUserById(userId.toString());
      const username = userFromDb?.username || 'Неизвестный';

      // Проверка cooldown
      const cooldownKey = `${userId}_${multiplier}`;
      const currentTime = Date.now();
      const lastBetTime = lastBetTimes[cooldownKey];
      const cooldownDuration = 1000; // Минимальное время между ставками (1 секунда)

      if (lastBetTime && currentTime - lastBetTime < cooldownDuration) {
        return ctx.answerCbQuery('❌ Не флудите, попробуйте еще раз через пару секунд!', { show_alert: true });
      }

      // Сохраняем время последней ставки
      lastBetTimes[cooldownKey] = currentTime;

      // Проверяем время окончания приема ставок
      const remainingTimeForBets = doubleGame.round.result === 'GAME'
      ? doubleGame.round.endTime - 20 * 1000
      : doubleGame.round.endTime - 5 * 1000;

      if (currentTime >= remainingTimeForBets) {
        return ctx.answerCbQuery('⏳ Ставки больше не принимаются. Формируются итоги игры.', { show_alert: true });
      }

      // Проверяем баланс пользователя
      if (userFromDb.balance < amount) {
        return ctx.answerCbQuery('❌ Недостаточно средств для ставки.');
      }

      // Обрабатываем ставку через DoubleGame
      const betResult = await doubleGame.handleBet(userId, username, multiplier, amount, ctx.chat.id);
      if (betResult.success) {
        // Отправляем уведомление через answerCbQuery
        ctx.answerCbQuery(`✔️ Ставка ${amount} PF на ${multiplier} принята.`);

        // Отправляем сообщение в чат с подтверждением ставки
        const userLink = createUserLink(userId, username);
        const confirmationMessage = `✔️ ${userLink}, ваша ставка ${amount.toLocaleString('ru-RU')} PF на ${multiplier} принята.`;
        return ctx.reply(confirmationMessage, { parse_mode: 'HTML' });
      } else {
        return ctx.answerCbQuery(`❌ ${betResult.message || 'Не удалось принять ставку.'}`);
      }
    });
  }
});

// Обработчик callback-запросов для кнопок дайса
bot.action(/^start_dice_(\d+)$/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      try {
        const betAmount = parseInt(ctx.match[1], 10); // Получаем сумму ставки из callback_data
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const userFromDb = await getUserById(userId.toString());
        const username = userFromDb?.username || 'Неизвестный';

        // Проверяем, достаточно ли у пользователя средств для этой ставки
        if (userFromDb.balance < betAmount) {
          return ctx.answerCbQuery('Недостаточно средств для данной ставки.');
        }

        // Начинаем новый раунд дайса
        const startResult = diceGame.startRound(chatId, bot, betAmount);
        if (!startResult.success) {
          return ctx.answerCbQuery(startResult.message || 'Произошла ошибка при создании раунда.');
        }

        // Ответ пользователю
        ctx.answerCbQuery(`Ставка ${betAmount.toLocaleString('ru-RU')} PF принята. Раунд запущен.`);
      } catch (error) {
        console.error('Ошибка при обработке кнопки начала раунда дайса:', error);
        ctx.answerCbQuery('Произошла ошибка. Попробуйте позже.');
      }
    });
  }
});

// Обработчик кнопки "Пополнить всё"
bot.action('topup_all', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleTopUpAll(ctx); // Вызываем обработчик пополнения всей суммы
    });
  }
});

// Обработчик кнопки "Снять всё"
bot.action('withdraw_all', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleWithdrawAll(ctx); // Вызываем обработчик снятия всей суммы
    });
  }
});

// Обработчик кнопки "Пополнить" в меню управления картой
bot.action('show_topup_instruction', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await showTopUpInstruction(ctx); // Вызываем функцию из cardTopUp.js
    });
  }
});

// Обработчик кнопки "Снять" в меню управления картой
bot.action('show_withdraw_instruction', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await showWithdrawInstruction(ctx); // Вызываем функцию из cardTopUp.js
    });
  }
});

// // Обработчик покупки игрового ID 5
// bot.action('buy_id_5', async (ctx) => {
//   if (await checkUserStatus(ctx)) {
//     await handleCallbackWithErrorHandling(ctx, async () => {
//       await require('./donations/donationShop').handleBuyId(ctx, 5, 5000);
//     });
//   }
// });

// Обработчик покупки игрового ID 6
bot.action('buy_id_6', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await require('./donations/donationShop').handleBuyId(ctx, 6, 5000);
    });
  }
});

// // Обработчик покупки игрового ID 7
// bot.action('buy_id_7', async (ctx) => {
//   if (await checkUserStatus(ctx)) {
//     await handleCallbackWithErrorHandling(ctx, async () => {
//       await require('./donations/donationShop').handleBuyId(ctx, 7, 5000);
//     });
//   }
// });

// Обработчик кнопки "Повторить" для рулетки
bot.action(/repeat_bet_(\d+)/, async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    if (!(await checkUserStatus(ctx))) return;
    await repeatBetHandler(ctx);
  });
});

// Обработчик кнопки "Удвоить ставку" для рулетки
bot.action(/double_bet_(\d+)/, async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    if (!(await checkUserStatus(ctx))) return;

    // Извлекаем сумму удвоенной ставки из callback_data
    const doubledBetAmount = parseInt(ctx.match[1]);

    // Проверяем, что удвоенная ставка не превышает максимальный лимит
    if (doubledBetAmount > 350000) {
      return await ctx.answerCbQuery('❌ Максимальная ставка — 350 000 PF.');
    }

    // Вызываем обработчик повторной ставки с удвоенной суммой
    await repeatBetHandler(ctx, doubledBetAmount);
  });
});

// Обработчик кнопки "Сделать ставку" для аукциона
bot.action(/make_bid_(\d+)/, async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    if (!(await checkUserStatus(ctx))) return;

    // Извлекаем сумму ставки из callback_data
    const amount = parseInt(ctx.match[1]);

    // Проверяем, что сумма ставки корректна
    if (isNaN(amount) || amount <= 0) {
      return await ctx.answerCbQuery('❌ Некорректная сумма ставки.');
    }

    // Вызываем функцию обработки ставки
    await handleMakeBid(ctx);
  });
});

// Обработчик кнопки "Коэффициенты"
bot.action('show_coefficients', async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
      if (!(await checkUserStatus(ctx))) return;

      // Текст с коэффициентами (исправленные множители)
      const coefficientsText = `
✖️ КОЭФФИЦИЕНТЫ КОМБИНАЦИЙ:

7 | 7 | 7  
Множитель:  7х   

🍋 | 🍋 | 🍋 
Множитель: 4х 

🍇 | 🍇 | 🍇 
Множитель: 2.5х  

BAR | BAR | BAR 
Множитель: 1.5х 
______________________

7 | 7 | —
Множитель: 2х 

🍋 | 🍋 | — 
Множитель: 1.5х 

🍇 | 🍇 | — 
Множитель: 1.2х 

BAR | BAR | — 
Множитель: 1х 
______________________

Разные символы на трех барабанах
Множитель: 0х
`;

      // Отправляем сообщение с коэффициентами
      await ctx.reply(coefficientsText, { parse_mode: 'HTML' });
  });
});


bot.action('open_contest', async (ctx) => {
  try {
    await handleContestInfo(ctx); // Вызываем функцию handleContestInfo
  } catch (error) {
    console.error('Ошибка при обработке нажатия на кнопку "Открыть конкурс":', error);
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Обработчик кнопки "Аукцион"
bot.action('auction', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      // Вызываем функцию auctionHandler для обработки запроса
      await auctionHandler(ctx);
    });
  }
});

// Обработка навигации по справке
bot.action(/help_page_(\d+)/, handleHelpNavigation);

// Инициализация игры Double
doubleGame.initGame(bot);

// Обработчик кнопки "Атака"
bot.action('attack_boss', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await attackBoss(ctx); // Вызываем функцию атаки босса
    });
  }
});

// Обработчик кнопок с индексами (например, "attack_boss_0", "attack_boss_1")
bot.action(/attack_boss_(\d+)/, async (ctx) => {
  await handleCallbackWithErrorHandling(ctx, async () => {
    try {
      const userId = ctx.from.id.toString(); // ID текущего пользователя
      const selectedButtonIndex = parseInt(ctx.match[1], 10); // Индекс нажатой кнопки

      // Логируем вызов обработчика кнопки
      console.log(`[LOG] Пользователь ${userId} попытался нажать на кнопку атаки.`);
      console.log(`[DEBUG] Нажата кнопка с индексом: ${selectedButtonIndex} (тип: ${typeof selectedButtonIndex})`);
      console.log(`[DEBUG] ctx.match:`, ctx.match);
      console.log(`[DEBUG] ctx.callbackQuery.message.message_id:`, ctx.callbackQuery?.message?.message_id);

      // Получаем состояние атаки для пользователя
      let attackState = getAttackState(userId);
      console.log(`[DEBUG] Состояние атаки пользователя ${userId}:`, JSON.stringify(attackState));

      if (!attackState) {
        console.log(`[WARNING] У пользователя ${userId} нет активного состояния атаки.`);
        return ctx.answerCbQuery('❌ Это не ваше меню атаки. Состояние атаки не найдено.');
      }

      const expectedMessageId = attackState.message_id;
      const actualMessageId = ctx.callbackQuery?.message?.message_id;

      console.log(`[DEBUG] Ожидаемый Message ID: ${expectedMessageId} (тип: ${typeof expectedMessageId})`);
      console.log(`[DEBUG] Фактический Message ID: ${actualMessageId} (тип: ${typeof actualMessageId})`);

      if (!actualMessageId) {
        console.log(`[ERROR] Не удалось получить message_id из ctx.callbackQuery для пользователя ${userId}.`);
        return ctx.answerCbQuery('❌ Ошибка: Не удалось определить сообщение.');
      }

      if (actualMessageId !== expectedMessageId) {
        console.log(`[WARNING] Message ID не совпадает для пользователя ${userId}:`);
        console.log(`         Ожидаемый: ${expectedMessageId}, Фактический: ${actualMessageId}`);
        return ctx.answerCbQuery('❌ Это не ваше меню атаки. Message ID не совпадает.');
      }

      // --- НОВАЯ ЛОГИКА ПРОВЕРКИ ---
      // 1. Получаем правильный ОТВЕТ из состояния (это число, например, 9)
      const correctAnswer = attackState.correct_button_index;
      console.log(`[DEBUG] Правильный ответ (из состояния): ${correctAnswer} (тип: ${typeof correctAnswer})`);

      // 2. Получаем текущего босса, чтобы сгенерировать ту же клавиатуру
      const currentBoss = getCurrentBoss();
      if (!currentBoss) {
         console.log(`[ERROR] Босс не найден при проверке ответа для пользователя ${userId}.`);
         return ctx.answerCbQuery('❌ Ошибка: Босс не найден.');
      }

      // 3. Генерируем ту же клавиатуру, что и при создании сообщения
      //    correctAnswer передается для генерации правильного примера
      const keyboardData = generateMathKeyboard(correctAnswer, currentBoss.phase);
      
      // 4. Получаем текст ответа на нажатой кнопке
      //    Это текст, который видел пользователь (например, "9")
      const selectedAnswerText = keyboardData.answers[selectedButtonIndex];
      console.log(`[DEBUG] Текст на нажатой кнопке (индекс ${selectedButtonIndex}): "${selectedAnswerText}" (тип: ${typeof selectedAnswerText})`);

      // 5. Сравниваем текст на кнопке с правильным ответом (оба приведены к строке)
      //    Это ключевое исправление: раньше сравнивали индекс с числом
      const isCorrect = String(selectedAnswerText) === String(correctAnswer);
      console.log(`[DEBUG] Результат проверки: "${selectedAnswerText}" === "${correctAnswer}" -> ${isCorrect}`);

      // 6. Передаем всю необходимую информацию в attackBoss
      //    Добавляем в ctx.match информацию о результате проверки и выбранном ответе
      //    Это позволяет attackBoss не перегенерировать клавиатуру и сразу знать результат
      ctx.selectedAnswerText = selectedAnswerText; // Текст ответа пользователя
      ctx.isCorrectAnswer = isCorrect;             // Результат проверки
      ctx.correctAnswer = correctAnswer;           // Правильный ответ (число)
      
      // Передаем контекст в функцию attackBoss для обработки результата
      await attackBoss(ctx);
      
    } catch (error) {
      console.error('Ошибка при обработке кнопки атаки:', error);
      await ctx.answerCbQuery('Произошла ошибка при обработке запроса.');
    }
  });
});

// Обработчик кнопки "Топ по урону"
bot.action('boss_damage_top', async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await bossTopHandler(ctx); // Вызываем функцию топа по урону
      });
  }
});

// Обработчик кнопки "Энергия"
bot.action('energy_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await energyHandler(ctx);
      });
  }
});

// Обработчик кнопки "Прокачка навыков"
bot.action('skill_upgrade', async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await showSkillUpgradeMenu(ctx); // Вызываем функцию для отображения меню прокачки навыков
      });
  }
});


// Обработчик кнопки "Информация о боссе"
bot.action('boss_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await sendBossGameInfo(ctx); // Вызываем функцию для отправки информации о игре "босс"
    });
  }
});

// Обработчик кнопки "Назад" в топе босса
bot.action('back_to_boss_handler', async (ctx) => {
  if (await checkUserStatus(ctx)) {
      await handleCallbackWithErrorHandling(ctx, async () => {
          await bossHandler(ctx); // Вызываем функцию bossHandler
      });
  }
});

const cooldownsupgrade = {};

function checkCooldown(userId, command, cooldownTime = 5000) {
  const now = Date.now();
  if (cooldownsupgrade[userId] && cooldownsupgrade[userId][command] && now - cooldownsupgrade[userId][command] < cooldownTime) {
    return false; // Cooldown еще не прошел
  }

  // Устанавливаем новое время cooldown
  if (!cooldownsupgrade[userId]) cooldownsupgrade[userId] = {};
  cooldownsupgrade[userId][command] = now;
  return true;
}

// Использование в обработчике
bot.action('upgrade_attack_power', async (ctx) => {
  const userId = ctx.from.id.toString();

  if (!checkCooldown(userId, 'upgrade_attack_power')) {
    return await ctx.answerCbQuery('⏳ Подождите немного перед следующей попыткой.');
  }

  await handleCallbackWithErrorHandling(ctx, async () => {
    await upgradeAttackPower(ctx);
  });
});


// Обработчик для выбора оружия
bot.action(/select_weapon_(\d+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      const weaponId = ctx.match[1]; // Извлекаем ID оружия из callback_data

      // Получаем информацию об оружии
      const weapon = getWeaponById(weaponId); // Используем импортированную функцию
      if (!weapon) {
        return await ctx.reply('❌ Ошибка: Оружие не найдено.');
      }

      // Устанавливаем активное оружие для пользователя
      setActiveWeapon(ctx.from.id.toString(), weaponId); // Используем импортированную функцию

      // Уведомляем пользователя
      await ctx.reply(`✔️ Вы выбрали оружие: <b>${weapon.name}</b>`, { parse_mode: 'HTML' });

      // Возвращаемся в меню прокачки навыков
      await showSkillUpgradeMenu(ctx);
    });
  }
});

// Обработчик кнопки "Сменить оружие"
bot.action('change_weapon', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await changeWeapon(ctx); // Вызываем функцию смены оружия
    });
  }
});

// Обработчик кнопки "Магазин оружия"
bot.action('weapon_shop', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await weaponShop(ctx); // Вызываем функцию отображения магазина оружия
    });
  }
});

// Функция для форматирования чисел с разделителями тысяч
function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

bot.action(/buy_weapon_(\d+)/, async (ctx) => {
  try {
    const weaponId = parseInt(ctx.match[1], 10); // Извлекаем ID оружия из callback_data

    // Получаем информацию об оружии
    const weapon = getWeaponById(weaponId);
    if (!weapon) {
      return await ctx.reply('❌ Ошибка: Оружие не найдено.');
    }

    // Проверяем, доступно ли оружие для покупки
    const user = getUserById(ctx.from.id.toString());
    if (!user) {
      return await ctx.reply('❌ Ошибка: Пользователь не найден.');
    }

    const currentBalance = user.balance || 0;
    if (currentBalance < weapon.price) {
      return await ctx.reply(
        `❌ Недостаточно PF для покупки оружия. Требуется ${formatNumber(weapon.price)} PF.`
      );
    }

    // Проверяем, не куплено ли оружие
    const ownedWeaponsIds = getOwnedWeapons(ctx.from.id.toString());
    if (ownedWeaponsIds.includes(weapon.id)) {
      return await ctx.reply('❌ Это оружие уже куплено.');
    }

    // Уменьшаем баланс пользователя
    updateUserBalance(ctx.from.id.toString(), -weapon.price);

    // Добавляем оружие в список купленных
    addWeaponToUser(ctx.from.id.toString(), weapon.id);

    // Создаем клавиатуру с кнопками
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔫 Применить оружие', callback_data: 'change_weapon' }], // Смена оружия
        [{ text: 'Закрыть', callback_data: 'close_energy_info' }], // Закрыть сообщение
      ],
    };

    // Уведомляем пользователя
    await ctx.replyWithHTML(
      `🛒 <b>Покупка завершена!</b>\n\n` +
      `🔫 Вы купили: <b>${weapon.name}</b>\n` +
      `➖ Списано с баланса: -<b>${formatNumber(weapon.price)} PF</b>\n` +
      `💰 Оставшийся баланс PF: <b>${formatNumber(currentBalance - weapon.price)}</b>`,
      { reply_markup: keyboard }
    );

    // Возвращаемся в магазин оружия
    await weaponShop(ctx);
  } catch (error) {
    console.error('[buyWeapon] Ошибка:', error);
    await ctx.reply('Произошла ошибка при покупке оружия.');
  }
});


// Обработчик для просмотра информации об оружии
bot.action(/view_weapon_(\d+)/, async (ctx) => {
  try {
    const weaponId = parseInt(ctx.match[1], 10); // Извлекаем ID оружия из callback_data

    // Получаем информацию об оружии
    const weapon = getWeaponById(weaponId);
    if (!weapon) {
      return await ctx.reply('❌ Ошибка: Оружие не найдено.');
    }

    // Получаем текущую прочность оружия пользователя (если оружие уже куплено)
    const userId = ctx.from.id.toString();
    const currentDurability = getCurrentWeaponDurability(userId, weaponId);

    // Формируем сообщение о прочности
    let durabilityMessage;
    if (weapon.name === 'Кулак') {
      // Если оружие — это "Кулак", выводим прочность как ∞/∞
      durabilityMessage = `🔧 Прочность: <b>∞/∞</b>`;
    } else {
      // Для других видов оружия выводим текущую и максимальную прочность
      durabilityMessage = `🔧 Прочность: <b>${weapon.durability}</b>`;
    }

    // Получаем баланс пользователя
    const user = getUserById(userId);
    const currentBalance = user.balance || 0;

    // Формируем сообщение с информацией об оружии
    const message = `
ℹ️ <b>Информация об оружии:</b>

🔫 Название: <b>${weapon.name}</b>

    ⚔️ Сила урона: <b>${formatNumber(weapon.base_damage)}</b>
    ${durabilityMessage}

💰 Цена: <b>${formatNumber(weapon.price)} ${weapon.price_type}</b>
    `.trim();

    // Создаем клавиатуру с кнопкой "Купить" и кнопкой "Назад"
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: `Купить за ${formatNumber(weapon.price)} PF`,
            callback_data: `buy_weapon_${weapon.id}`,
          },
        ],
        [{ text: '⬅️ Назад', callback_data: 'weapon_shop' }],
      ],
    };

    // Отправляем сообщение с информацией об оружии
    await ctx.replyWithHTML(message, { reply_markup: keyboard });
  } catch (error) {
    console.error('[viewWeaponInfo] Ошибка:', error);
    await ctx.reply('Произошла ошибка при просмотре информации об оружии.');
  }
});

// Обработчик кнопки "Назад" из магазина оружия
bot.action('back_to_skill_upgrade_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await showSkillUpgradeMenu(ctx); // Возвращаемся в меню прокачки навыков
    });
  }
});

// Обработчик кнопки "Информация об энергии"
bot.action('show_energy_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await showEnergyInfo(ctx); // Вызываем функцию для вывода информации об энергии
    });
  }
});

// Обработчик кнопки "Закрыть"
bot.action('close_energy_info', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await ctx.deleteMessage(); // Удаляем сообщение с информацией об энергии
    });
  }
});


// Кнопка "Построить бизнес" из меню империи
bot.action('build_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleBuildMenu(ctx);
    });
  }
});

// Навигация по страницам меню постройки
bot.action(/build_page_(\d+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleBuildPage(ctx);
    });
  }
});

// Просмотр информации о бизнесе (и кнопка покупки/улучшения)
bot.action(/view_business_info_(\d+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleViewBusinessInfo(ctx);
    });
  }
});

// Показ деталей улучшения
bot.action(/show_upgrade_details_(\d+)_(\d+)/, async (ctx) => { // (\d+) для businessId, (\d+) для typeId
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleShowUpgradeDetails(ctx);
    });
  }
});

// Подтверждение покупки бизнеса
bot.action(/confirm_buy_business_(\d+)/, async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleConfirmBuyBusiness(ctx);
    });
  }
});

// Подтверждение улучшения бизнеса
bot.action(/confirm_upgrade_business_(\d+)_(\d+)/, async (ctx) => { // (\d+) для businessId, (\d+) для typeId
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await handleConfirmUpgradeBusiness(ctx);
    });
  }
});

// Кнопка "Назад" в меню империи (из меню постройки)
bot.action('back_to_empire', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      // Вызываем напрямую empireHandler
      await empireHandler(ctx);
    });
  }
});

bot.action('empire_stats', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, async () => {
      await empireStatisticsHandler(ctx);
    });
  }
});

bot.action('candy_top', async (ctx) => {
  const { candyTopHandler } = require('./Events/Halloween/candy');
  await candyTopHandler(ctx);
});

bot.action('candy_shop', async (ctx) => {
  const { newYearShopHandler } = require('./Events/Halloween/candy'); // Импортируем новую функцию
  await newYearShopHandler(ctx); // Вызываем новую функцию
});

bot.action('candy_exchange', async (ctx) => {
  const { exchangeCandyToTickets } = require('./Events/Halloween/exchange');
  await exchangeCandyToTickets(ctx);
});

// Обмен 1 билетик
bot.action('exchange_one_ticket', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { exchangeOneTicket } = require('./Events/Halloween/exchange');
    await handleCallbackWithErrorHandling(ctx, exchangeOneTicket);
  }
});

// Обмен всех конфет
bot.action('exchange_all_candy', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { exchangeAllCandy } = require('./Events/Halloween/exchange');
    await handleCallbackWithErrorHandling(ctx, exchangeAllCandy);
  }
});

// Обработчик кнопки "Вращать колесо" → открывает универсальное Колесо Фортуны
bot.action('halloween_fortune', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { fortuneWheelHandler } = require('./Events/fortuneWheel');
    await handleCallbackWithErrorHandling(ctx, fortuneWheelHandler);
  }
});

const { spinFortuneWheel } = require('./Events/fortuneWheel');

bot.action('spin_fortune_wheel', async (ctx) => {
  // Удаляем сообщение с кнопкой "Вращать снова" (или любое другое, содержащее эту кнопку)
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.deleteMessage(); // ✅ Удаляем сообщение с кнопкой
    } catch (err) {
      console.warn('[FORTUNE] Не удалось удалить сообщение с кнопкой:', err.message);
      // Продолжаем даже если не удалилось (например, уже удалено)
    }
  }

  // Запускаем вращение
  await spinFortuneWheel(ctx);
});

// Обработчик кнопки "Получить билетики"
bot.action('get_fortune_tickets', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await ctx.answerCbQuery('🎫 Функция получения билетиков пока недоступна.');
    // Позже можешь реализовать выдачу за определённые условия (например, за донат, за время и т.д.)
  }
});

bot.action('buy_pf_with_candy', async (ctx) => {
  if (await checkUserStatus(ctx)) await handleCallbackWithErrorHandling(ctx, buyPfWithCandy);
});
bot.action('buy_fortune_ticket', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { exchangeCandyToTickets } = require('./Events/Halloween/exchange');
    await handleCallbackWithErrorHandling(ctx, exchangeCandyToTickets);
  }
});
bot.action('buy_new_year_card', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { buyNewYearCard } = require('./Events/Halloween/candyShop');
    await handleCallbackWithErrorHandling(ctx, buyNewYearCard);
  }
});
bot.action('buy_snowman_prefix', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    const { buySnowmanPrefix } = require('./Events/Halloween/candyShop');
    await handleCallbackWithErrorHandling(ctx, buySnowmanPrefix);
  }
});
bot.action('buy_gold_containers', async (ctx) => {
  if (await checkUserStatus(ctx)) await handleCallbackWithErrorHandling(ctx, buyGoldContainers);
});

// === Обработчики кнопок для Секретных Пакетиков ===
bot.action('open_secret_gift', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, openSecretGift);
  }
});

bot.action('close_secret_gift_menu', async (ctx) => {
  if (await checkUserStatus(ctx)) {
    await handleCallbackWithErrorHandling(ctx, closeSecretGiftMenu);
  }
});
bot.action('spin_fortune_wheel', async (ctx) => {
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.deleteMessage(); // ✅ Удаляем кнопку
    } catch (e) {
      // Игнорируем, если сообщение уже удалено
    }
  }
  await spinFortuneWheel(ctx);
});

// Регистрация callback-кнопки
bot.action('test_button', handleTestButton);
bot.action('confirm_action', handleConfirmAction);

// Обработчик кнопок создания промокода
bot.action(/^promo_/, async (ctx) => {
  const { handleCallback } = require('./handlers/promoHandler');
  await handleCallback(ctx);
});


// Глобальный обработчик ошибок
setupGlobalErrorHandler(bot);

const MAIN_ADMIN_ID = process.env.MAIN_ADMIN; // ID главного администратора

// Функция для отправки уведомления о выключении
async function sendShutdownNotification(bot, reason) {
    try {
        const message = `
⚠️ <b>БОТ ВЫКЛЮЧЕН</b> ⚠️

<b>Причина:</b> ${reason}
<b>Дата:</b> ${new Date().toLocaleString()}
`.trim();

        await bot.telegram.sendMessage(MAIN_ADMIN_ID, message, { parse_mode: 'HTML' });
        console.log('Уведомление о выключении отправлено администратору.');
    } catch (error) {
        console.error('Не удалось отправить уведомление о выключении:', error);
    }
}

// Обработка сигнала SIGTERM (например, завершение через систему)
process.on('SIGTERM', async () => {
    console.log('Получен сигнал SIGTERM. Выключение бота...');
    await sendShutdownNotification(bot, 'SIGTERM (системное завершение)');
    process.exit(0); // Завершаем процесс
});

// Обработка необработанных исключений
process.on('uncaughtException', async (error) => {
    console.error('Необработанное исключение:', error);
    await sendShutdownNotification(bot, `Необработанное исключение: ${error.message}`);
    process.exit(1); // Завершаем процесс с ошибкой
});

// Обработка необработанных промисов
process.on('unhandledRejection', async (reason) => {
    console.error('Необработанный промис:', reason);
    await sendShutdownNotification(bot, `Необработанный промис: ${reason}`);
    process.exit(1); // Завершаем процесс с ошибкой
});


// Загружаем состояние курса при запуске
loadCourseState();
// Запускаем таймер для обновления курса каждую минуту
startCourseUpdater();

// Инициализация автоматического снятия мута и бана
startAutoUnmute(bot);
startAutoUnban(bot);

// Стало:
bot.launch()
  .then(() => {
    console.log('Бот успешно запущен и слушает обновления!');
    scheduleDailyBackup();
  })
  .catch((error) => {
    console.error('❌ Ошибка при запуске ботика:', error);
    console.error('❌ Stack:', error.stack); // Для дополнительной отладки
    process.exit(1); // Завершаем процесс с кодом 1 в случае ошибки
  });