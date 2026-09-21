// doubleGame.js
"use strict";
const crypto = require('crypto');
const fs = require('fs'); // Модуль для работы с файловой системой
const pathModule = require('path'); // Модуль для работы с путями
const {
  getUserById,
  updateUserBalance,
  saveBet,
  getBetsByRoundId,
  saveBetDetails,
  updateDoubleStatistics,
  updateRoundStatistics,
  getActiveChatIdsByRoundHash,
  giveCandy,
  // --- НОВЫЕ ИМПОРТЫ ДЛЯ ЛОГИРОВАНИЯ ---
  createDoubleRound,
  updateDoubleBetOutcome,
  updateDoubleBetGameChoice,
  logDoubleBet,
  finishDoubleRoundLog,
  getDoubleBetsByRound,   
  markRoundBetsFailed,    
} = require('../db');

// --- Добавлено: Настройка файлового логирования ---
const DOUBLE_LOG_FILE_PATH = pathModule.join(__dirname, '..', 'logs', 'double_game.log');
// Убедимся, что директория для логов существует
const logDir = pathModule.dirname(DOUBLE_LOG_FILE_PATH);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// --- Добавлено: Интервал очистки логов (4 часа в миллисекундах) ---
const LOG_CLEANUP_INTERVAL = 4 * 60 * 60 * 1000; // 4 часа
let logCleanupIntervalId = null; // ID интервала для возможности остановки

// --- Добавлено: Путь к файлу состояния ---
const STATE_FILE_PATH = pathModule.join(__dirname, '..', 'data', 'double_game_state.json');
const DATA_DIR = pathModule.dirname(STATE_FILE_PATH);
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
// --- Конец добавления ---

function logToFile(message) {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const logMessage = `[${timestamp}] ${message}\n`;
    // console.log(logMessage.trim()); // Также выводим в консоль для удобства - УБРАНО
    fs.appendFileSync(DOUBLE_LOG_FILE_PATH, logMessage, { encoding: 'utf8' });
}

// --- Добавлено: Функция для очистки файла логов ---
function clearLogFile() {
    try {
        // Проверяем, существует ли файл
        if (fs.existsSync(DOUBLE_LOG_FILE_PATH)) {
             // Очищаем содержимое файла, записывая пустую строку с флагом 'w' (перезапись)
             fs.writeFileSync(DOUBLE_LOG_FILE_PATH, '', { encoding: 'utf8' });
             const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
             // console.log(`[${timestamp}] [LOG CLEANUP] Лог-файл ${DOUBLE_LOG_FILE_PATH} успешно очищен.`); // УБРАНО
             // Также логируем в сам файл факт очистки
             logToFile(`[LOG CLEANUP] Лог-файл успешно очищен.`);
        } else {
            // console.log(`[LOG CLEANUP] Лог-файл ${DOUBLE_LOG_FILE_PATH} не существует, очистка не требуется.`); // УБРАНО
            logToFile(`[LOG CLEANUP] Лог-файл ${DOUBLE_LOG_FILE_PATH} не существует, очистка не требуется.`);
        }
    } catch (err) {
        const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        // console.error(`[${timestamp}] [LOG CLEANUP] Ошибка при очистке лог-файла:`, err); // УБРАНО
        // Пытаемся залогировать ошибку в файл, если это возможно
        try {
            fs.appendFileSync(DOUBLE_LOG_FILE_PATH, `[${timestamp}] [ERROR] [LOG CLEANUP] Ошибка при очистке лог-файла: ${err.message}\n`, { encoding: 'utf8' });
        } catch (logErr) {
            // console.error(`[${timestamp}] [LOG CLEANUP] Не удалось записать ошибку очистки в лог-файл:`, logErr); // УБРАНО
            logToFile(`[ERROR] [LOG CLEANUP] Не удалось записать ошибку очистки в лог-файл: ${logErr.message}`);
        }
    }
}
// --- Конец добавления ---

// --- Добавлено: Функции для сохранения и загрузки состояния ---
function saveStateToFile(state) {
    try {
        const stateToSave = {
            globalRound: state.globalRound ? {
                hash: state.globalRound.hash,
                result: state.globalRound.result,
                salt: state.globalRound.salt,
                endTime: state.globalRound.endTime,
                warnedAboutFiveSeconds: state.globalRound.warnedAboutFiveSeconds,
                warnedAboutGameNotification: state.globalRound.warnedAboutGameNotification,
                notifiedAboutGameButtons: state.globalRound.notifiedAboutGameButtons,
                processedChats: Array.from(state.globalRound.processedChats), // Преобразуем Set в Array
                cellContents: state.globalRound.cellContents,
                finalMultipliers: state.globalRound.finalMultipliers,
                gameButtonActive: state.globalRound.gameButtonActive,
            } : null,
            gameChoices: state.gameChoices,
            globalChoices: state.globalChoices,
            activeGameBets: state.activeGameBets,
            globalUserChoices: state.globalUserChoices,
            // isProcessing обычно не сохраняется, так как это состояние выполнения
        };
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(stateToSave, null, 2), { encoding: 'utf8' });
        logToFile(`[STATE] Состояние успешно сохранено в файл ${STATE_FILE_PATH}`);
    } catch (err) {
        logToFile(`[ERROR] [STATE] Ошибка при сохранении состояния в файл: ${err.message}`);
    }
}

function loadStateFromFile() {
    try {
        if (fs.existsSync(STATE_FILE_PATH)) {
            const data = fs.readFileSync(STATE_FILE_PATH, { encoding: 'utf8' });
            const loadedState = JSON.parse(data);
           
            // Восстанавливаем объекты из примитивов
            if (loadedState.globalRound) {
                loadedState.globalRound.processedChats = new Set(loadedState.globalRound.processedChats || []);
            }
           
            logToFile(`[STATE] Состояние успешно загружено из файла ${STATE_FILE_PATH}`);
            return loadedState;
        } else {
            logToFile(`[STATE] Файл состояния ${STATE_FILE_PATH} не найден, используется состояние по умолчанию.`);
            return null;
        }
    } catch (err) {
        logToFile(`[ERROR] [STATE] Ошибка при загрузке состояния из файла: ${err.message}`);
        return null;
    }
}
// --- Конец добавления ---

// Функция для создания гиперссылки на пользователя
function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

const CELL_MULTIPLIER_WEIGHTS = {
  small: [
    { multiplier: 'x2', weight: 55 }, // 50% шанс для x2
    { multiplier: 'x5', weight: 30 }, // 30% шанс для x5
    { multiplier: 'x10', weight: 15 }, // 20% шанс для x10
  ],
  big: [
    { multiplier: 'x25', weight: 67 }, // 60% шанс для x25
    { multiplier: 'x50', weight: 25 }, // 30% шанс для x50
    { multiplier: 'x100', weight: 8 }, // 10% шанс для x100
  ],
};

class DoubleGame {
  constructor() {
    if (!DoubleGame.instance) {
      this.globalRound = null;
      this.isProcessing = {};
      this.gameChoices = {}; // Хранит выборы пользователей в формате `${chatId}_${userId}`
      DoubleGame.instance = this;
      this.globalChoices = {};
      this.activeGameBets = {}; // Для отслеживания активных ставок GAME
      this.globalUserChoices = {}; // Добавляем глобальное хранилище выборов пользователей
    }
    return DoubleGame.instance;
  }

  static getInstance() {
    if (!DoubleGame.instance) {
      DoubleGame.instance = new DoubleGame();
    }
    return DoubleGame.instance;
  }


  // Генерация случайного множителя с весами
  generateRandomMultiplier() {
    const MULTIPLIERS = [
      { multiplier: 'x2', weight: 46 },
      { multiplier: 'x3', weight: 30 },
      { multiplier: 'x5', weight: 20 },
      { multiplier: 'GAME', weight: 4 }, // Вероятность выпадения GAME — 4%
    ];
    const totalWeight = MULTIPLIERS.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of MULTIPLIERS) {
      random -= item.weight;
      if (random <= 0) return item.multiplier;
    }
    return MULTIPLIERS[0].multiplier;
  }

 
  // Генерация содержимого ячеек для множителей (для режима GAME)
  generateCellContents() {
    const selectRandomMultiplier = (weights) => {
      const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      for (const item of weights) {
        random -= item.weight;
        if (random <= 0) return item.multiplier;
      }
      return weights[0].multiplier; // Возвращаем первый множитель по умолчанию
    };
 
    // Случайно выбираем, какая ячейка получит большие множители
    const isLeftBig = Math.random() < 0.5; // true — левая большая, false — правая большая
 
    const left = [];
    const right = [];
 
    for (let i = 0; i < 3; i++) {
      left.push(selectRandomMultiplier(isLeftBig ? CELL_MULTIPLIER_WEIGHTS.big : CELL_MULTIPLIER_WEIGHTS.small));
      right.push(selectRandomMultiplier(isLeftBig ? CELL_MULTIPLIER_WEIGHTS.small : CELL_MULTIPLIER_WEIGHTS.big));
    }
 
    return { left, right };
  }

  // Выбор финальных множителей из содержимого ячеек
  selectFinalMultipliers(cellContents) {
    const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
 
    return {
      left: getRandomElement(cellContents.left),
      right: getRandomElement(cellContents.right),
    };
  }

  // Генерация хеша для раунда
  generateHash(multiplier, salt) {
    const cleanMultiplier = multiplier.replace('x', '');
    return crypto.createHash('md5').update(`${cleanMultiplier}|${salt}`).digest('hex');
  }

    // Запуск нового глобального раунда
    startGlobalRound(bot) {
      const multiplier = this.generateRandomMultiplier();
      const salt = Math.random().toString(36).substring(2);
      const hash = this.generateHash(multiplier, salt);
      const duration = 60 * 1000; // Длительность раунда — 60 секунд
      const endTime = Date.now() + duration;

      this.globalRound = {
          hash,
          result: multiplier,
          salt,
          endTime,
          warnedAboutFiveSeconds: false,
          warnedAboutGameNotification: false,
          notifiedAboutGameButtons: false,
          processedChats: new Set(),
          cellContents: multiplier === 'GAME' ? this.generateCellContents() : null,
          finalMultipliers: null,
          gameButtonActive: false,
      };

      // --- ЛОГИРОВАНИЕ: Создание раунда в БД ---
      try {
          createDoubleRound(hash, Date.now());
      } catch (e) {
          logToFile(`[ERROR] Ошибка создания раунда в БД: ${e.message}`);
      }

      logToFile(`Новый глобальный раунд начат: multiplier=${multiplier}, hash=${hash}, salt=${salt}, endTime=${new Date(endTime).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`);
      this.sendLogMessage(bot, `🎲 Новый глобальный раунд:\n▪️ Множитель: ${multiplier}\n▪️ Хеш: ${hash}\n▪️ Соль: ${salt}`);

      saveStateToFile(this);
  }
 
  // Обработка ставок
// Добавляем новое свойство для отслеживания активных ставок GAME
activeGameBets = {};

handleBet = async (userId, username, multiplier, amount, chatId, chatTitle = null) => {
  try {
      if (!this.globalRound) return { success: false, message: '❕ Раунд еще не начался.' };
     
      const currentTime = Date.now();
      const remainingTimeForBets = this.globalRound.result === 'GAME'
          ? this.globalRound.endTime - 20 * 1000
          : this.globalRound.endTime - 5 * 1000;
     
      if (remainingTimeForBets <= currentTime) {
          return { success: false, message: '⏳ Ставки больше не принимаются. Формируются итоги игры.' };
      }

      // Проверка на минимальную сумму ставки
      if (amount < 1) return { success: false, message: '❕ Минимальная ставка — 1 PF.' };

      // Проверка на существующие ставки GAME
      if (multiplier === 'GAME') {
          if (this.activeGameBets[userId]) {
              return { success: false, message: '❌ У вас уже есть активная ставка GAME.' };
          }
         
          // Регистрируем новую ставку GAME
          this.activeGameBets[userId] = true;
      }

      const user = await getUserById(userId);
      if (!user || user.balance < amount) {
          // Если баланса недостаточно, удаляем регистрацию ставки GAME
          if (multiplier === 'GAME') {
              delete this.activeGameBets[userId];
          }
          return { success: false, message: '❌ Недостаточно средств для ставки.' };
      }

      // Уменьшаем баланс пользователя
      await updateUserBalance(userId, -amount);

      // Сохраняем ставку в базу данных
      await saveBet(userId, chatId, username, multiplier, amount, this.globalRound.hash);
      // В handleBet (проигрыш/ставка):
// Логируем ставку в таблицу double_bets_log
logDoubleBet({
  ts: Date.now(),
  roundId: this.globalRound.hash,
  userId: userId,
  username: username,
  chatId: chatId,
  chatTitle: chatTitle, 
  multiplier: multiplier,
  amount: amount,
  status: 'accepted', // Статус принятой ставки
  isWin: null,        // Результат еще неизвестен
  winAmount: null     // Выигрыш еще неизвестен
});
      // Очищаем регистрацию ставки GAME после успешной обработки
      if (multiplier === 'GAME') {
          delete this.activeGameBets[userId];
      }

      // --- Добавлено: Сохраняем состояние после обработки ставки ---
      saveStateToFile(this);
      // --- Конец добавления ---

      return { success: true };

  } catch (error) {
      // При ошибке удаляем регистрацию ставки GAME
      if (multiplier === 'GAME') {
          delete this.activeGameBets[userId];
      }
      console.error('[handleBet] Ошибка:', error);
      return { success: false, message: 'Произошла ошибка при обработке ставки.' };
  }
}  

notifyGameResult(chatId, bot) {
  if (!this.globalRound || Date.now() >= this.globalRound.endTime) return;

      const bets = getDoubleBetsByRound(this.globalRound.hash);
    (async () => {
      try {
          // Фильтруем ставки только для текущего чата
          const chatBets = bets.filter((bet) => bet.chat_id === chatId.toString() && bet.multiplier === 'GAME');

          // Группируем ставки по пользователям
          const userBets = {};
          for (const bet of chatBets) {
              if (!userBets[bet.user_id]) {
                  const userFromDb = await getUserById(bet.user_id);
                  userBets[bet.user_id] = {
                      username: userFromDb?.username || 'Неизвестный',
                      totalAmount: 0,
                  };
              }
              userBets[bet.user_id].totalAmount += bet.amount;
          }

          // Формируем список участников
          let resolvedGameBets = [];
          for (const [userId, userData] of Object.entries(userBets)) {
              const userLink = createUserLink(userId, userData.username);
              resolvedGameBets.push(`${userLink} (${userData.totalAmount.toLocaleString('ru-RU')} PF)`);
          }

          // Создаем клавиатуру выбора ячеек
          const keyboard = {
              inline_keyboard: [
                  [
                      { text: 'Левая ячейка', callback_data: `game_choice_${chatId}_left` },
                      { text: 'Правая ячейка', callback_data: `game_choice_${chatId}_right` },
                  ],
              ],
          };

          // Формируем сообщение
          const message = `
▫️ Выберите ячейку с секретным множителем, используя кнопки ниже, иначе бот сам откроет её, с помощью рандома!

👥 Участники GAME:
${resolvedGameBets.join('\n') || 'Никто не сделал ставку на GAME'}
          `.trim();

          // Отправляем сообщение
          await bot.telegram.sendPhoto(chatId, {
              source: fs.createReadStream('./images/choice.png')
          }, {
              caption: message,
              reply_markup: keyboard,
              parse_mode: 'HTML',
          });

          // Активируем кнопки выбора
          this.globalRound.gameButtonActive = true;
          logToFile(`[notifyGameResult] Уведомление GAME отправлено в чат ${chatId}, кнопки активированы.`);

      } catch (error) {
          console.error(`Ошибка при уведомлении результатов GAME в чате ${chatId}:`, error);
          logToFile(`[ERROR] [notifyGameResult] Ошибка при уведомлении результатов GAME в чате ${chatId}: ${error.message}`);
      }
  }).catch((error) => {
      console.error(`Ошибка при обработке результатов GAME в чате ${chatId}:`, error);
      logToFile(`[ERROR] [notifyGameResult] Ошибка при обработке результатов GAME в чате ${chatId}: ${error.message}`);
  });
}

  isGameChoiceAllowed(userId, chatId) {
    if (!this.globalRound || Date.now() >= this.globalRound.endTime) return false;
    if (!this.globalRound.gameButtonActive) return false;
    const key = `${chatId}_${userId}`;
    return !this.gameChoices[key];
}

recordGameChoice(userId, chatId, choice) {
  const key = `${chatId}_${userId}`;
  const globalChoiceKey = `global_choice_${userId}`;

  if (this.globalChoices[globalChoiceKey]) {
      choice = this.globalChoices[globalChoiceKey];
  }

  if (this.isGameChoiceAllowed(userId, chatId)) {
      this.gameChoices[key] = choice;
      logToFile(`[recordGameChoice] Записан выбор пользователя ${userId} в чате ${chatId}: ${choice}`);
      
      // --- ЛОГИРОВАНИЕ: Обновление выбора в БД ---
      // Нам нужно найти ID ставки, чтобы обновить её. 
      // Так как у нас нет прямого доступа к betId здесь, мы можем попробовать обновить по userId + roundId + chatId
      // Но updateDoubleBetGameChoice требует betId. 
      // В текущей архитектуре проще обновить все ставки пользователя в этом раунде, если они GAME.
      // Однако, в db.js у нас updateDoubleBetGameChoice(betId, gameChoice).
      // Чтобы не усложнять, мы можем пропустить этот шаг здесь, если выбор сохраняется в стейте и используется в endRound.
      // Но для полноты логов, давайте попробуем обновить.
      // Так как мы не знаем betId, мы не можем вызвать updateDoubleBetGameChoice напрямую без запроса.
      // Оставим как есть, выбор сохранится в this.gameChoices и будет использован в endRound.
      // Если нужно строго в БД, нужно делать запрос на получение betId.
      
      saveStateToFile(this);
      return true;
  }
  return false;
}

  // Завершение раунда
  endRound = async (bot) => {
    const roundHash = this.globalRound?.hash || 'unknown';
    logToFile(`[endRound] Начало завершения раунда ${roundHash}`);
    if (!this.globalRound) {
      logToFile(`[endRound] Прервано: this.globalRound отсутствует.`);
      return;
    }
    if (this.isEndingRound) {
      logToFile(`[endRound] Прервано: раунд ${roundHash} уже завершается.`);
      return;
    }
    this.isEndingRound = true;
    try {
      // 1. Финальные множители GAME
      if (this.globalRound.result === 'GAME' && !this.globalRound.finalMultipliers) {
        this.globalRound.finalMultipliers = this.selectFinalMultipliers(this.globalRound.cellContents);
        logToFile(`[endRound] Финальные множители GAME: L=${this.globalRound.finalMultipliers.left}, R=${this.globalRound.finalMultipliers.right}`);
      }
      const { result, hash, salt, finalMultipliers } = this.globalRound;
  
      // 2. Ставки и активные чаты
      const allBets = getDoubleBetsByRound(hash);
      logToFile(`[endRound] Найдено ставок: ${allBets.length}`);
      const activeChats = [...new Set(allBets.map((b) => String(b.chat_id)))];
      logToFile(`[endRound] Найдено активных чатов: ${activeChats.length}`);
  
      // 3. СРАЗУ пишем паспорт раунда (status=finished) ДО любых отправок в Telegram,
      //    чтобы зависание сети/прокси не оставляло раунд «активным» в логах
      try {
        finishDoubleRoundLog(hash, { endTs: Date.now(), resultMultiplier: result, salt: salt, status: 'finished' });
        logToFile(`[endRound] Раунд ${hash} помечен finished в double_rounds.`);
      } catch (finishErr) {
        logToFile(`[ERROR] [endRound] Запись итогов раунда в БД: ${finishErr.message}`);
      }
  
      // 4. Статистика мульти-аккаунтинга
      const userWinningChats = {};
      for (const bet of allBets) {
        const isWin = bet.multiplier === result || (result === 'GAME' && this.checkGameWin(bet, finalMultipliers));
        if (isWin) {
          if (!userWinningChats[bet.user_id]) userWinningChats[bet.user_id] = new Set();
          userWinningChats[bet.user_id].add(bet.chat_id);
        }
      }
      const usersWithMultiChatWins = new Set();
      for (const [userId, chatSet] of Object.entries(userWinningChats)) {
        if (chatSet.size > 1) usersWithMultiChatWins.add(userId);
      }
  
      let allChatsProcessedSuccessfully = true;
      // 5. Обработка каждого чата
      const chatProcessingResults = await Promise.allSettled(
        activeChats.map(async (chatId) => {
          if (this.globalRound.processedChats.has(chatId) || this.isProcessing[chatId]) {
            return { chatId, success: true, message: "Пропущен" };
          }
          try {
            this.isProcessing[chatId] = true;
            const chatBets = allBets.filter((bet) => bet.chat_id === chatId.toString());
            if (!chatBets || chatBets.length === 0) {
              this.isProcessing[chatId] = false;
              return { chatId, success: true, message: "Нет ставок" };
            }
            const groupedBets = {};
            for (const bet of chatBets) {
              if (!groupedBets[bet.user_id]) {
                const userFromDb = await getUserById(bet.user_id);
                groupedBets[bet.user_id] = { username: userFromDb?.username || 'Неизвестный', bets: {}, hasWin: false };
              }
              if (!groupedBets[bet.user_id].bets[bet.multiplier]) {
                groupedBets[bet.user_id].bets[bet.multiplier] = { amount: 0, details: [] };
              }
              groupedBets[bet.user_id].bets[bet.multiplier].amount += bet.amount;
              groupedBets[bet.user_id].bets[bet.multiplier].details.push({ id: bet.id, amount: bet.amount });
            }
            let finalMessage = `<b>Итоговые результаты:</b>\n\n`;
            for (const [userId, userData] of Object.entries(groupedBets)) {
              let totalWinnings = 0;
              let totalLosses = 0;
              let wins = 0;
              let losses = 0;
              for (const [multiplier, betGroup] of Object.entries(userData.bets)) {
                let isWin = false;
                let winAmount = 0;
                let finalMultiplierValue = 0;
                let selectedMultStr = null;
                if (result === 'GAME') {
                  if (multiplier === 'GAME') {
                    let userChoice = this.gameChoices[`${chatId}_${userId}`] || this.globalChoices[`global_choice_${userId}`];
                    if (!userChoice) {
                      userChoice = Math.random() < 0.5 ? 'left' : 'right';
                      logToFile(`[endRound] Случайный выбор для ${userId}: ${userChoice}`);
                    }
                    this.globalUserChoices[userId] = userChoice;
                    this.gameChoices[`${chatId}_${userId}`] = userChoice;
                    selectedMultStr = userChoice === 'left' ? finalMultipliers.left : finalMultipliers.right;
                    finalMultiplierValue = parseInt(selectedMultStr.replace('x', ''), 10);
                    isWin = true;
                    winAmount = betGroup.amount * finalMultiplierValue;
                  }
                } else {
                  isWin = (multiplier === result);
                  if (isWin) {
                    finalMultiplierValue = parseInt(result.replace('x', ''), 10);
                    winAmount = betGroup.amount * finalMultiplierValue;
                  }
                }
                try {
                  for (const detail of betGroup.details) {
                    const detailWinAmount = isWin ? Math.floor(winAmount * (detail.amount / betGroup.amount)) : 0;
                    updateDoubleBetOutcome(detail.id, isWin, detailWinAmount);
                  }
                } catch (dbErr) {
                  logToFile(`[ERROR] [endRound] Ошибка обновления логов ставок для ${userId}: ${dbErr.message}`);
                }
                try {
                  await saveBetDetails(userId, [{ roundHash: hash, multiplier, amount: betGroup.amount, isWin: isWin ? 1 : 0, winAmount }]);
                } catch (e) { /* ignore */ }
                const userLink = createUserLink(userId, userData.username);
                if (isWin && winAmount > 0) {
                  if (multiplier === 'GAME') {
                    finalMessage += `✅ ${userLink} ставка ${betGroup.amount.toLocaleString('ru-RU')} PF на GAME [${selectedMultStr}] → приз ${winAmount.toLocaleString('ru-RU')} PF\n`;
                  } else {
                    finalMessage += `✅ ${userLink} ставка ${betGroup.amount.toLocaleString('ru-RU')} PF на x${multiplier.replace('x', '')} → приз ${winAmount.toLocaleString('ru-RU')} PF\n`;
                  }
                  if (!usersWithMultiChatWins.has(userId)) {
                    for (const detail of betGroup.details) {
                      if (detail.amount >= 100000 && Math.random() < 0.25) {
                        const candyCount = Math.floor(Math.random() * 6) + 1;
                        try {
                          giveCandy(userId, candyCount);
                          finalMessage += `🍬 +${candyCount} конфет\n`;
                        } catch (e) {}
                      }
                    }
                  }
                  userData.hasWin = true;
                  totalWinnings += winAmount;
                  wins++;
                  try {
                    await updateUserBalance(userId, winAmount);
                    logToFile(`[endRound] Выплата ${winAmount} PF → ${userId}`);
                  } catch (balErr) {
                    logToFile(`[ERROR] Ошибка выплаты ${userId}: ${balErr.message}`);
                  }
                } else {
                  finalMessage += `❌ ${userLink} ставка ${betGroup.amount.toLocaleString('ru-RU')} PF на ${multiplier} проиграла\n`;
                  totalLosses += betGroup.amount;
                  losses++;
                }
              }
              try {
                await updateRoundStatistics(userId, {
                  totalRounds: 1, roundWins: wins, roundLosses: losses,
                  doubleTotalBets: Object.keys(userData.bets).length,
                  doubleWins: wins, doubleLosses: losses,
                  doubleTotalWinnings: totalWinnings, doubleTotalLosses: totalLosses,
                });
              } catch (statErr) {
                logToFile(`[ERROR] Ошибка статистики ${userId}: ${statErr.message}`);
              }
            }
            if (result === 'GAME') {
              finalMessage += `\n<b>☑️ Результаты GAME:</b> L:${finalMultipliers.left} R:${finalMultipliers.right}\n`;
            }
            finalMessage += `\n🔒 Хеш: ${hash} | Проверка: ${result.replace('x', '')}|${salt}`;
            let messageSent = false;
            try {
              const imgName = result === 'GAME'
                ? `${finalMultipliers.left.replace('x', '')}l_${finalMultipliers.right.replace('x', '')}p.png`
                : `${result}.jpg`;
              const imgPath = pathModule.join(__dirname, '..', 'images', imgName);
              if (fs.existsSync(imgPath)) {
                await bot.telegram.sendPhoto(chatId, { source: fs.createReadStream(imgPath) }, { caption: finalMessage.trim(), parse_mode: 'HTML' });
              } else {
                await bot.telegram.sendMessage(chatId, finalMessage.trim(), { parse_mode: 'HTML' });
              }
              messageSent = true;
            } catch (sendErr) {
              logToFile(`[ERROR] Отправка в ${chatId}: ${sendErr.message}`);
            }
            this.globalRound.processedChats.add(chatId);
            this.isProcessing[chatId] = false;
            return { chatId, success: messageSent };
          } catch (chatErr) {
            console.error(`[endRound] Критическая ошибка чата ${chatId}:`, chatErr);
            this.isProcessing[chatId] = false;
            return { chatId, success: false, message: chatErr.message };
          }
        })
      );
  
      // 6. Проверка результатов отправки
      for (const res of chatProcessingResults) {
        if (res.status === 'rejected' || (res.value && !res.value.success)) {
          allChatsProcessedSuccessfully = false;
        }
      }
  
      // 7. Страховка: помечаем необработанные ставки как failed
      try {
        const leftover = markRoundBetsFailed(hash);
        if (leftover > 0) logToFile(`[endRound] Помечено failed необработанных ставок: ${leftover}`);
      } catch (e) {
        logToFile(`[ERROR] markRoundBetsFailed: ${e.message}`);
      }
  
      // 8. Сброс и запуск нового раунда
      if (this.globalRound) this.resetRounds();
      this.startGlobalRound(bot);
      if (!allChatsProcessedSuccessfully) {
        this.sendLogMessage(bot, `⚠️ Не все сообщения доставлены в раунде ${hash}.`);
      }
    } catch (error) {
      console.error('[endRound] Глобальная ошибка:', error);
      logToFile(`[ERROR] [endRound] Глобальная ошибка: ${error.message}`);
      if (this.globalRound) this.resetRounds();
      this.startGlobalRound(bot);
      this.sendLogMessage(bot, `💥 Критическая ошибка в endRound: ${error.message}`);
    } finally {
      this.isEndingRound = false;
      logToFile(`[endRound] Завершение метода endRound для раунда ${roundHash}`);
    }
  };



  // Вспомогательная функция для проверки выигрыша в GAME (нужна для сбора статистики выше)
  checkGameWin(bet, finalMultipliers) {
     if (bet.multiplier !== 'GAME') return false;
     // Здесь упрощенная логика, так как точный выбор пользователя известен только внутри цикла обработки чата
     // Для предварительного сбора мульти-чатов это допустимая погрешность или можно вернуть true для всех GAME ставок
     return true; 
  }


// Добавьте эту функцию в класс DoubleGame
async processRoundResults(bot) {
  try {
    if (!this.globalRound || Date.now() < this.globalRound.endTime) return;

    const { hash, result, finalMultipliers } = this.globalRound;
    const allBets = await getBetsByRoundId(hash);

    // Группируем ставки по пользователям
    const userBetsMap = {};
    for (const bet of allBets) {
      if (!userBetsMap[bet.user_id]) {
        userBetsMap[bet.user_id] = [];
      }
      userBetsMap[bet.user_id].push(bet);
    }

    // Обрабатываем каждый чат отдельно
    const activeChats = await getActiveChatIdsByRoundHash(hash);
    const chatProcessingPromises = activeChats.map(async (chatId) => {
      try {
        const chatBets = allBets.filter((bet) => bet.chat_id === chatId.toString());
        if (!chatBets.length) return;

        const chatUserStats = {};

        for (const bet of chatBets) {
          const isWin = this.isWinningBet(bet, result, finalMultipliers);
          const winAmount = isWin ? Math.floor(bet.amount * parseFloat(bet.multiplier)) : 0;

          if (!chatUserStats[bet.user_id]) {
            chatUserStats[bet.user_id] = {
              totalWinnings: 0,
              totalLosses: 0,
              wins: 0,
              losses: 0,
            };
          }

          if (isWin) {
            chatUserStats[bet.user_id].totalWinnings += winAmount;
            chatUserStats[bet.user_id].wins++;
          } else {
            chatUserStats[bet.user_id].totalLosses += bet.amount;
            chatUserStats[bet.user_id].losses++;
          }

          // Сохраняем детали ставки
          await saveBetDetails(bet.user_id, [{
            roundHash: hash,
            multiplier: bet.multiplier,
            amount: bet.amount,
            isWin: isWin ? 1 : 0,
            winAmount: winAmount,
          }]);
        }

        // Обновляем статистику пользователей
        for (const [userId, stats] of Object.entries(chatUserStats)) {
          await updateRoundStatistics(userId, {
            totalRounds: 1,
            roundWins: stats.wins,
            roundLosses: stats.losses,
            doubleTotalBets: stats.wins + stats.losses,
            doubleWins: stats.wins,
            doubleLosses: stats.losses,
            doubleTotalWinnings: stats.totalWinnings,
            doubleTotalLosses: stats.totalLosses,
          });

          // Обновляем баланс пользователя
          const balanceChange = stats.totalWinnings - stats.totalLosses;
          if (balanceChange !== 0) {
            await updateUserBalance(userId, balanceChange);
          }
        }
      } catch (error) {
        console.error(`Ошибка при обработке результатов для чата ${chatId}:`, error);
        logToFile(`[ERROR] [processRoundResults] Ошибка при обработке результатов для чата ${chatId}: ${error.message}`);
      }
    });

    await Promise.all(chatProcessingPromises);
  } catch (error) {
    console.error('Критическая ошибка при обработке результатов раунда:', error);
    logToFile(`[ERROR] [processRoundResults] Критическая ошибка: ${error.message}`);
  }
}

// Вспомогательная функция для определения выигрышной ставки
isWinningBet(bet, result, finalMultipliers) {
  if (result === 'GAME') {
    return bet.game_choice && finalMultipliers[bet.game_choice] === bet.multiplier;
  }
  return bet.multiplier === result;
}
  resetRounds() {
    this.globalRound = null;
    this.isProcessing = {};
    this.gameChoices = {};
    this.globalChoices = {}; // Очищаем глобальные выборы
    logToFile(`[resetRounds] Состояние раунда сброшено.`);
    // --- Добавлено: Сохраняем состояние после сброса ---
    saveStateToFile(this);
    // --- Конец добавления ---
  }
 
  initGame = (bot) => {
    logToFile(`[initGame] Инициализация игры Double.`);
    if (this.roundTimer) {
        logToFile(`[initGame] Очистка существующего roundTimer.`);
        clearInterval(this.roundTimer);
    }
    if (this.betBlockTimer) {
        logToFile(`[initGame] Очистка существующего betBlockTimer.`);
        clearInterval(this.betBlockTimer);
    }
    // --- Добавлено: Остановка и запуск интервала очистки логов ---
    if (logCleanupIntervalId) {
        logToFile(`[initGame] Остановка существующего интервала очистки логов.`);
        clearInterval(logCleanupIntervalId);
    }
    logToFile(`[initGame] Запуск интервала очистки логов каждые ${LOG_CLEANUP_INTERVAL / 1000 / 60 / 60} часа(ов).`);
    logCleanupIntervalId = setInterval(clearLogFile, LOG_CLEANUP_INTERVAL);
    logToFile(`[initGame] Интервал очистки логов установлен. ID: ${logCleanupIntervalId}`);
    // --- Конец добавления --
 
    // --- Добавлено: Восстановление состояния при инициализации ---
    const savedState = loadStateFromFile();
    if (savedState) {
        // Восстанавливаем состояние
        this.globalRound = savedState.globalRound;
        this.gameChoices = savedState.gameChoices || {};
        this.globalChoices = savedState.globalChoices || {};
        this.activeGameBets = savedState.activeGameBets || {};
        this.globalUserChoices = savedState.globalUserChoices || {};
       
        // Восстанавливаем Set processedChats
        if (this.globalRound && Array.isArray(this.globalRound.processedChats)) {
            this.globalRound.processedChats = new Set(this.globalRound.processedChats);
        }
       
        logToFile(`[initGame] Состояние восстановлено из файла.`);
       
        // Проверяем, не истекло ли время раунда
        if (this.globalRound && Date.now() >= this.globalRound.endTime) {
            logToFile(`[initGame] Время сохраненного раунда истекло. Запуск endRound.`);
            // Если время раунда истекло, сразу запускаем завершение
            // Используем setTimeout, чтобы дать время инициализации таймеров
            setTimeout(() => {
                this.endRound(bot);
            }, 100);
        } else if (this.globalRound) {
            logToFile(`[initGame] Сохраненный раунд еще активен. Продолжаем.`);
            // Если раунд еще активен, просто продолжаем
        }
    } else {
        logToFile(`[initGame] Нет сохраненного состояния. Запуск нового раунда.`);
        this.startGlobalRound(bot);
    }
    // --- Конец добавления ---
   
    this.startRoundTimers(bot);
  };
 
  startRoundTimers(bot) {
    logToFile(`[startRoundTimers] Запуск таймеров.`);
    this.roundTimer = setInterval(async () => {
        const now = Date.now();
        // logToFile(`[Timer: roundTimer] Проверка времени окончания раунда. now=${now}, globalRound.endTime=${this.globalRound?.endTime}`); // УБРАНО
        if (this.globalRound && now >= this.globalRound.endTime) {
            logToFile(`[Timer: roundTimer] Время раунда истекло. Вызов endRound.`);
            await this.endRound(bot);
        } else {
            // logToFile(`[Timer: roundTimer] Время раунда еще не истекло или раунд отсутствует.`); // УБРАНО
        }
    }, 1000);
    logToFile(`[startRoundTimers] roundTimer установлен (интервал 1000мс). ID: ${this.roundTimer}`);
 
    this.betBlockTimer = setInterval(async () => {
        // logToFile(`[Timer: betBlockTimer] Проверка состояния уведомлений и предупреждений.`); // УБРАНО
        if (!this.globalRound) {
            // logToFile(`[Timer: betBlockTimer] globalRound отсутствует.`); // УБРАНО
            return;
        }
 
        const remainingTime = this.globalRound.endTime - Date.now();
        // logToFile(`[Timer: betBlockTimer] Оставшееся время: ${remainingTime}мс`); // УБРАНО
 
        // Предупреждение за 5 секунд до конца раунда (для обычных множителей)
        if (
          !this.globalRound.warnedAboutFiveSeconds &&
          remainingTime > 0 &&
          remainingTime < 5 * 1000 &&
          this.globalRound.result !== 'GAME'
        ) {
          try {
            // logToFile(`[Timer: betBlockTimer] Отправка предупреждения о 5 секундах.`); // УБРАНО
            const activeChats = await getActiveChatIdsByRoundHash(this.globalRound.hash);
            for (const chatId of activeChats) {
              try {
                await bot.telegram.sendMessage(
                  chatId,
                  '⏳ До конца раунда осталось менее пяти секунд, ставки не принимаются.',
                  { parse_mode: 'HTML' }
                );
                logToFile(`[Timer: betBlockTimer] Предупреждение о 5 секундах отправлено в чат ${chatId}.`);
              } catch (error) {
                console.error('Ошибка при отправке предупреждения:', error);
                logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при отправке предупреждения в чат ${chatId}: ${error.message}`);
              }
            }
 
            this.globalRound.warnedAboutFiveSeconds = true;
            logToFile(`[Timer: betBlockTimer] Флаг warnedAboutFiveSeconds установлен.`);
            // --- Добавлено: Сохраняем состояние после изменения флага ---
            saveStateToFile(this);
            // --- Конец добавления ---
          } catch (error) {
            console.error('Ошибка при получении активных чатов:', error);
            logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при получении активных чатов: ${error.message}`);
          }
        }
 
        // Предупреждение за 20 секунд до конца раунда (для множителя GAME)
        // --- Изменено: Добавлена дополнительная проверка на время ---
        if (
          this.globalRound.result === 'GAME' &&
          !this.globalRound.warnedAboutGameNotification &&
          remainingTime > 0 &&
          remainingTime < 20 * 1000 &&
          remainingTime > 1000 // Добавляем небольшой запас, чтобы избежать гонки условий
        ) {
        // --- Конец изменения ---
          try {
            // logToFile(`[Timer: betBlockTimer] Отправка уведомления о выпадении GAME.`); // УБРАНО
            const activeChats = await getActiveChatIdsByRoundHash(this.globalRound.hash);
            for (const chatId of activeChats) {
              try {
                await bot.telegram.sendPhoto(chatId, { source: fs.createReadStream('./images/GAME.jpg') }, {
                  caption: `
  🎮 Выпал множитель GAME!\n
  ⏳ Через 5 секунд бот вам даст выбрать ячейку с секретным множителем!
 
  🔒 Хеш игры: ${this.globalRound.hash}`,
                  parse_mode: 'HTML',
                });
                logToFile(`[Timer: betBlockTimer] Уведомление о GAME отправлено в чат ${chatId}.`);
              } catch (error) {
                console.error('Ошибка при отправке уведомления о GAME:', error);
                logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при отправке уведомления о GAME в чат ${chatId}: ${error.message}`);
              }
            }
 
            this.globalRound.warnedAboutGameNotification = true;
            logToFile(`[Timer: betBlockTimer] Флаг warnedAboutGameNotification установлен.`);
            // --- Добавлено: Сохраняем состояние после изменения флага ---
            saveStateToFile(this);
            // --- Конец добавления ---
          } catch (error) {
            console.error('Ошибка при получении активных чатов:', error);
            logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при получении активных чатов для GAME: ${error.message}`);
          }
        }
 
        // Уведомление о выборе ячеек за 15 секунд до конца раунда (для множителя GAME)
        // --- Изменено: Добавлена дополнительная проверка на время ---
        if (
          this.globalRound.result === 'GAME' &&
          !this.globalRound.notifiedAboutGameButtons &&
          remainingTime > 0 &&
          remainingTime < 15 * 1000 &&
          remainingTime > 1000 // Добавляем небольшой запас, чтобы избежать гонки условий
        ) {
        // --- Конец изменения ---
          try {
            // logToFile(`[Timer: betBlockTimer] Отправка уведомления о выборе ячеек GAME.`); // УБРАНО
            const activeChats = await getActiveChatIdsByRoundHash(this.globalRound.hash);
            for (const chatId of activeChats) {
              try {
                this.notifyGameResult(chatId, bot);
                logToFile(`[Timer: betBlockTimer] Уведомление о выборе ячеек отправлено в чат ${chatId}.`);
              } catch (error) {
                console.error('Ошибка при отправке уведомления о выборе ячеек:', error);
                logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при отправке уведомления о выборе ячеек в чат ${chatId}: ${error.message}`);
              }
            }
 
            this.globalRound.notifiedAboutGameButtons = true;
            logToFile(`[Timer: betBlockTimer] Флаг notifiedAboutGameButtons установлен.`);
            // --- Добавлено: Сохраняем состояние после изменения флага ---
            saveStateToFile(this);
            // --- Конец добавления ---
          } catch (error) {
            console.error('Ошибка при получении активных чатов:', error);
            logToFile(`[ERROR] [Timer: betBlockTimer] Ошибка при получении активных чатов для выбора ячеек: ${error.message}`);
          }
        }
 
        // Деактивация кнопок после окончания таймера
        if (this.globalRound.result === 'GAME' && remainingTime <= 5 * 1000) {
          this.globalRound.gameButtonActive = false;
          logToFile(`[Timer: betBlockTimer] Кнопки выбора GAME деактивированы.`);
          // --- Добавлено: Сохраняем состояние после деактивации кнопок ---
          saveStateToFile(this);
          // --- Конец добавления ---
        }
    }, 1000);
    logToFile(`[startRoundTimers] betBlockTimer установлен (интервал 1000мс). ID: ${this.betBlockTimer}`);
  }
 
  sendLogMessage(bot, message) {
    try {
      if (process.env.LOG_CHAT_ID && bot?.telegram) {
        bot.telegram.sendMessage(process.env.LOG_CHAT_ID, message, { parse_mode: 'HTML' });
      }
    } catch (error) {
      console.error('Ошибка при отправке лога в чат:', error);
      logToFile(`[ERROR] [sendLogMessage] Ошибка при отправке лога в чат: ${error.message}`);
    }
  }
}




module.exports = { doubleGame: new DoubleGame(), createUserLink };