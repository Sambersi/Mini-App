// games/doubleGame.js — финальная цельная версия
"use strict";
const crypto = require('crypto');
const fs = require('fs');
const pathModule = require('path');
const {
  getUserById,
  updateUserBalance,
  saveBetDetails,
  updateRoundStatistics,
  giveCandy,
  createDoubleRound,
  updateDoubleBetOutcome,
  logDoubleBet,
  finishDoubleRoundLog,
  getDoubleBetsByRound,
  markRoundBetsFailed,
  getDoubleRoundState,
  setDoubleRoundState,
  getDoubleNotification,
  markDoubleNotificationSent,
  refundBetsForRound,
  incrementGameWins,
  updateMaxBetIfGreater,
  updateMaxWinIfGreater,
  incrementMultiplierCount,
  updateWinStreak,
} = require('../db');

// === КОНСТАНТЫ ===
const ROUND_DURATION_MS = 60 * 1000;
const TICK_INTERVAL_MS = 500;
const BLOCK_ORDINARY_MS = 5 * 1000;     // закрытие ставок и предупреждение за 5 сек
const BLOCK_GAME_MS = 20 * 1000;        // закрытие ставок GAME и GAME-фото за 20 сек
const GAME_CHOICE_AT_MS = 15 * 1000;    // кнопки выбора за 15 сек
const GAME_DEACTIVATE_AT_MS = 5 * 1000; // деактивация кнопок за 5 сек

// Веса основного множителя. ДЛЯ ТЕСТА GAME: поставь weight 999999, для боевого режима — 4.
const MULTIPLIER_WEIGHTS = [
  { multiplier: 'x2', weight: 46 },
  { multiplier: 'x3', weight: 30 },
  { multiplier: 'x5', weight: 20 },
  { multiplier: 'GAME', weight: 4 },
];
const CELL_MULTIPLIER_WEIGHTS = {
  small: [
    { multiplier: 'x2', weight: 55 },
    { multiplier: 'x5', weight: 30 },
    { multiplier: 'x10', weight: 15 },
  ],
  big: [
    { multiplier: 'x25', weight: 67 },
    { multiplier: 'x50', weight: 25 },
    { multiplier: 'x100', weight: 8 },
  ],
};

const ROUND_STATE = {
  ACCEPTING: 'ACCEPTING',
  BLOCKED: 'BLOCKED',
  GAME_CHOICE: 'GAME_CHOICE',
  RESOLVING: 'RESOLVING',
};

const imgPath = (name) => pathModule.join(__dirname, '..', 'images', name);

function createUserLink(userId, username) {
  const displayName = username || 'Неизвестный';
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

class DoubleGame {
  constructor() {
    if (!DoubleGame.instance) {
      this.round = null;
      this.state = ROUND_STATE.ACCEPTING;
      this.gameChoices = {};      // `${chatId}_${userId}` → left|right
      this.globalChoices = {};    // `global_choice_${userId}` → left|right
      this.activeGameBets = {};   // userId → true (защита от дублей GAME)
      this.globalUserChoices = {};
      this._queue = Promise.resolve(); // единая очередь отправки сообщений
      this._tickTimer = null;
      this._resolving = false;         // мьютекс завершения раунда
      this._notifScheduled = { gameNotify: false, gameChoice: false, fiveSec: false };
      DoubleGame.instance = this;
    }
    return DoubleGame.instance;
  }

  static getInstance() {
    if (!DoubleGame.instance) DoubleGame.instance = new DoubleGame();
    return DoubleGame.instance;
  }

  // Совместимость со старыми обработчиками, которые читают globalRound
  get globalRound() { return this.round; }
  // Раунды создаёт только таймер/initGame; вызовы из обработчиков игнорируем
  startGlobalRound() { return; }

  // === ГЕНЕРАЦИЯ ===
  generateRandomMultiplier() {
    const total = MULTIPLIER_WEIGHTS.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const item of MULTIPLIER_WEIGHTS) { r -= item.weight; if (r <= 0) return item.multiplier; }
    return MULTIPLIER_WEIGHTS[0].multiplier;
  }

  generateCellContents() {
    const pick = (weights) => {
      const total = weights.reduce((s, i) => s + i.weight, 0);
      let r = Math.random() * total;
      for (const item of weights) { r -= item.weight; if (r <= 0) return item.multiplier; }
      return weights[0].multiplier;
    };
    const isLeftBig = Math.random() < 0.5;
    const left = [], right = [];
    for (let i = 0; i < 3; i++) {
      left.push(pick(isLeftBig ? CELL_MULTIPLIER_WEIGHTS.big : CELL_MULTIPLIER_WEIGHTS.small));
      right.push(pick(isLeftBig ? CELL_MULTIPLIER_WEIGHTS.small : CELL_MULTIPLIER_WEIGHTS.big));
    }
    return { left, right };
  }

  selectFinalMultipliers(cellContents) {
    const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return { left: rnd(cellContents.left), right: rnd(cellContents.right) };
  }

  generateHash(multiplier, salt) {
    const clean = multiplier.replace('x', '');
    return crypto.createHash('md5').update(`${clean}|${salt}`).digest('hex');
  }

  // === ИНИЦИАЛИЗАЦИЯ ===
  initGame(bot) {
    console.log('[DoubleGame] Инициализация...');
    if (this._tickTimer) clearInterval(this._tickTimer);

    const saved = getDoubleRoundState();
    if (saved && saved.hash && saved.state && saved.state !== 'FINISHED') {
      console.log(`[DoubleGame] Восстановление состояния: ${saved.state}, hash=${saved.hash}`);
      this.round = saved;
      this.state = saved.state;
      this.gameChoices = saved.gameChoices || {};
      this.globalChoices = saved.globalChoices || {};
      this._notifScheduled = { gameNotify: false, gameChoice: false, fiveSec: false };
      if (Date.now() >= this.round.endTime) {
        console.log('[DoubleGame] Раунд истёк при восстановлении → завершение.');
        this.state = ROUND_STATE.RESOLVING;
        this._persist();
        setTimeout(() => this._resolveRound(bot), 300);
      }
    } else {
      this._createNewRound(bot);
    }
    this._tickTimer = setInterval(() => this._tick(bot), TICK_INTERVAL_MS);
    console.log('[DoubleGame] Таймер запущен.');
  }

  // === СОЗДАНИЕ РАУНДА ===
  _createNewRound(bot) {
    const multiplier = this.generateRandomMultiplier();
    const salt = Math.random().toString(36).substring(2);
    const hash = this.generateHash(multiplier, salt);
    const endTime = Date.now() + ROUND_DURATION_MS;

    this.round = {
      hash, result: multiplier, salt, endTime,
      cellContents: multiplier === 'GAME' ? this.generateCellContents() : null,
      finalMultipliers: null,
      gameButtonActive: false,
      processedChats: [],
    };
    this.state = ROUND_STATE.ACCEPTING;
    this.gameChoices = {};
    this.globalChoices = {};
    this.activeGameBets = {};
    this.globalUserChoices = {};
    this._resolving = false;
    this._notifScheduled = { gameNotify: false, gameChoice: false, fiveSec: false };

    try { createDoubleRound(hash, Date.now()); } catch (e) { console.error('[DoubleGame] createDoubleRound:', e.message); }
    this._persist();
    console.log(`[DoubleGame] Новый раунд: ${multiplier}, hash=${hash}`);
    this._sendLogMessage(bot, `🎲 Новый глобальный раунд:\n▪️ Множитель: ${multiplier}\n▪️ Хеш: ${hash}\n▪️ Соль: ${salt}`);
  }

  // === ЕДИНЫЙ ТИК ===
  _tick(bot) {
    try {
      if (!this.round || this.state === ROUND_STATE.RESOLVING) return;
      const remaining = this.round.endTime - Date.now();
      const isGame = this.round.result === 'GAME';

      if (remaining <= 0) {
        this.state = ROUND_STATE.RESOLVING;
        this._persist();
        this._resolveRound(bot);
        return;
      }
      if (this.state === ROUND_STATE.ACCEPTING) {
        const blockTime = isGame ? BLOCK_GAME_MS : BLOCK_ORDINARY_MS;
        if (remaining <= blockTime) { this.state = ROUND_STATE.BLOCKED; this._persist(); }
      }
      if (this.state === ROUND_STATE.BLOCKED && isGame && remaining <= GAME_CHOICE_AT_MS) {
        this.state = ROUND_STATE.GAME_CHOICE; this._persist();
      }
      if (this.state === ROUND_STATE.GAME_CHOICE && remaining <= GAME_DEACTIVATE_AT_MS && this.round.gameButtonActive) {
        this.round.gameButtonActive = false; this._persist();
      }
      this._scheduleNotifications(bot, isGame);
    } catch (e) {
      console.error('[DoubleGame] tick error:', e.message);
    }
  }

  _scheduleNotifications(bot, isGame) {
    if (this.state === ROUND_STATE.BLOCKED) {
      if (isGame) {
        if (!this._notifScheduled.gameNotify) { this._notifScheduled.gameNotify = true; this._enqueueGameNotify(bot); }
      } else {
        if (!this._notifScheduled.fiveSec) { this._notifScheduled.fiveSec = true; this._enqueueFiveSec(bot); }
      }
    }
    if (this.state === ROUND_STATE.GAME_CHOICE) {
      if (!this._notifScheduled.gameChoice) { this._notifScheduled.gameChoice = true; this._enqueueGameChoice(bot); }
    }
  }

  // === ОЧЕРЕДЬ И РАССЫЛКА ===
  _enqueue(task) {
    this._queue = this._queue.then(() => task()).catch((e) => console.error('[DoubleGame] queue error:', e.message));
    return this._queue;
  }

  _chatsWithBets() {
    const bets = getDoubleBetsByRound(this.round.hash);
    return [...new Set(bets.map((b) => String(b.chat_id)))];
  }

  // Ключ дедупликации ставится ТОЛЬКО после успешной отправки
  async _sendToChats(bot, chats, makeKey, sendFn) {
    await Promise.allSettled(chats.map(async (chatId) => {
      const key = makeKey(chatId);
      if (getDoubleNotification(key)) return;
      try {
        await sendFn(chatId);
        markDoubleNotificationSent(key, this.round.hash);
      } catch (e) {
        console.error(`[DoubleGame] Отправка в ${chatId} не удалась:`, e.message);
      }
    }));
  }

  _enqueueFiveSec(bot) {
    const hash = this.round.hash;
    this._enqueue(async () => {
      const chats = this._chatsWithBets();
      await this._sendToChats(bot, chats,
        (cid) => `five_sec_${hash}_${cid}`,
        (cid) => bot.telegram.sendMessage(cid, '⏳ До конца раунда осталось менее пяти секунд, ставки не принимаются.', { parse_mode: 'HTML' })
      );
    });
  }

  _enqueueGameNotify(bot) {
    const hash = this.round.hash;
    this._enqueue(async () => {
      const chats = this._chatsWithBets();
      await this._sendToChats(bot, chats,
        (cid) => `game_notify_${hash}_${cid}`,
        (cid) => bot.telegram.sendPhoto(cid, { source: fs.createReadStream(imgPath('GAME.jpg')) }, {
          caption: `  🎮 Выпал множитель GAME!\n   ⏳ Через 5 секунд бот вам даст выбрать ячейку с секретным множителем!     🔒 Хеш игры: ${hash}`,
          parse_mode: 'HTML',
        })
      );
    });
  }

  _enqueueGameChoice(bot) {
    const hash = this.round.hash;
    this._enqueue(async () => {
      const bets = getDoubleBetsByRound(hash);
      const chats = [...new Set(bets.map((b) => String(b.chat_id)))];
      await Promise.allSettled(chats.map(async (chatId) => {
        const key = `game_choice_${hash}_${chatId}`;
        if (getDoubleNotification(key)) return;
        try {
          const chatBets = bets.filter((b) => b.chat_id === chatId && b.multiplier === 'GAME');
          if (chatBets.length) {
            const userBets = {};
            for (const bet of chatBets) {
              if (!userBets[bet.user_id]) {
                const u = getUserById(bet.user_id);
                userBets[bet.user_id] = { username: u?.username || 'Неизвестный', total: 0 };
              }
              userBets[bet.user_id].total += bet.amount;
            }
            const list = Object.entries(userBets)
              .map(([uid, d]) => `${createUserLink(uid, d.username)} (${d.total.toLocaleString('ru-RU')} PF)`);
            const keyboard = {
              inline_keyboard: [[
                { text: 'Левая ячейка', callback_data: `game_choice_${chatId}_left` },
                { text: 'Правая ячейка', callback_data: `game_choice_${chatId}_right` },
              ]],
            };
            const message = `
▫️ Выберите ячейку с секретным множителем, используя кнопки ниже, иначе бот сам откроет её, с помощью рандома!
👥 Участники GAME:
${list.join('\n') || 'Никто не сделал ставку на GAME'}
`.trim();
            await bot.telegram.sendPhoto(chatId, { source: fs.createReadStream(imgPath('choice.png')) }, {
              caption: message, reply_markup: keyboard, parse_mode: 'HTML',
            });
          }
          markDoubleNotificationSent(key, hash); // помечаем и чаты без GAME-ставок, чтобы не слать повторно
        } catch (e) {
          console.error(`[DoubleGame] Кнопки GAME в ${chatId} не удались:`, e.message);
        }
      }));
      if (this.round && this.round.hash === hash) {
        this.round.gameButtonActive = true;
        this._persist();
      }
    });
  }

  // === СТАВКИ ===
  handleBet = async (userId, username, multiplier, amount, chatId, chatTitle = null) => {
    try {
      if (!this.round) return { success: false, message: '❕ Раунд еще не начался.' };
      if (this.state !== ROUND_STATE.ACCEPTING) return { success: false, message: '⏳ Ставки больше не принимаются. Формируются итоги игры.' };
      const remaining = this.round.endTime - Date.now();
      const blockTime = this.round.result === 'GAME' ? BLOCK_GAME_MS : BLOCK_ORDINARY_MS;
      if (remaining <= blockTime) return { success: false, message: '⏳ Ставки больше не принимаются. Формируются итоги игры.' };
      if (amount < 1) return { success: false, message: '❕ Минимальная ставка — 1 PF.' };

      if (multiplier === 'GAME') {
        if (this.activeGameBets[userId]) return { success: false, message: '❌ У вас уже есть активная ставка GAME.' };
        this.activeGameBets[userId] = true;
      }
      const user = getUserById(userId);
      if (!user || user.balance < amount) {
        if (multiplier === 'GAME') delete this.activeGameBets[userId];
        return { success: false, message: '❌ Недостаточно средств для ставки.' };
      }
      try {
        updateUserBalance(userId, -amount);
        logDoubleBet({ ts: Date.now(), roundId: this.round.hash, userId, username, chatId, chatTitle, multiplier, amount, status: 'accepted', isWin: null, winAmount: null });
      } catch (txErr) {
        console.error('[DoubleGame] handleBet txErr:', txErr.message);
        try { updateUserBalance(userId, amount); } catch (refErr) { console.error('[DoubleGame] REFUND FAIL:', refErr.message); }
        if (multiplier === 'GAME') delete this.activeGameBets[userId];
        return { success: false, message: 'Произошла ошибка при обработке ставки.' };
      }
      // Максимальная ставка — по каждой одиночной ставке
      try { updateMaxBetIfGreater(userId, amount); } catch (e) {}
      if (multiplier === 'GAME') delete this.activeGameBets[userId];
      return { success: true };
    } catch (error) {
      if (multiplier === 'GAME') delete this.activeGameBets[userId];
      console.error('[DoubleGame] handleBet:', error.message);
      return { success: false, message: 'Произошла ошибка при обработке ставки.' };
    }
  };

  // === ВЫБОР ЯЧЕЙКИ ===
  isGameChoiceAllowed(userId, chatId) {
    if (!this.round) return false;
    if (this.state !== ROUND_STATE.GAME_CHOICE) return false;
    if (!this.round.gameButtonActive) return false;
    return !this.gameChoices[`${chatId}_${userId}`];
  }

  recordGameChoice(userId, chatId, choice) {
    const key = `${chatId}_${userId}`;
    const gKey = `global_choice_${userId}`;
    if (this.globalChoices[gKey]) choice = this.globalChoices[gKey];
    if (this.isGameChoiceAllowed(userId, chatId)) {
      this.gameChoices[key] = choice;
      this.globalChoices[gKey] = choice;
      this._persist();
      return true;
    }
    return false;
  }

  // === ЗАВЕРШЕНИЕ РАУНДА ===
  _resolveRound = async (bot) => {
    if (this._resolving) return;
    this._resolving = true;
    const roundHash = this.round?.hash || 'unknown';
    try {
      // 1. Дожидаемся доотправки уведомлений — итоги придут строго после них
      await this._queue;
      if (!this.round) return;

      // 2. Финальные множители GAME
      if (this.round.result === 'GAME' && !this.round.finalMultipliers) {
        this.round.finalMultipliers = this.selectFinalMultipliers(this.round.cellContents);
        this._persist();
      }
      const { hash, result, salt, finalMultipliers } = this.round;

      // 3. Паспорт раунда
      try { finishDoubleRoundLog(hash, { endTs: Date.now(), resultMultiplier: result, salt, status: 'finished' }); }
      catch (e) { console.error('[DoubleGame] finishRound:', e.message); }

      // 4. Расчёты и выплаты по чатам (сообщения), строки ставок помечаются исходом
      const allBets = getDoubleBetsByRound(hash);
      const activeChats = [...new Set(allBets.map((b) => String(b.chat_id)))];
      const deliveries = [];
      for (const chatId of activeChats) {
        if ((this.round.processedChats || []).includes(chatId)) continue;
        const d = this._buildChatResult(chatId, allBets, result, finalMultipliers, hash, salt);
        if (d) deliveries.push(d);
        this.round.processedChats.push(chatId);
        this._persist(); // чат помечен обработанным ДО отправки: повторных выплат не будет
      }

      // 5. Глобальная статистика: ОДИН раз на игрока за раунд, по всем чатам сразу
      this._applyRoundStatistics(allBets, hash);

      // 6. Отправка итогов через очередь, дедупликация по каждому чату
      await this._enqueue(async () => {
        await Promise.allSettled(deliveries.map(async (d) => {
          const key = `results_${hash}_${d.chatId}`;
          if (getDoubleNotification(key)) return;
          try {
            if (d.img && fs.existsSync(d.img)) {
              await bot.telegram.sendPhoto(d.chatId, { source: fs.createReadStream(d.img) }, { caption: d.text, parse_mode: 'HTML' });
            } else {
              await bot.telegram.sendMessage(d.chatId, d.text, { parse_mode: 'HTML' });
            }
            markDoubleNotificationSent(key, hash);
          } catch (e) {
            console.error(`[DoubleGame] Итоги в ${d.chatId} не удались:`, e.message);
          }
        }));
      });

      // 7. Страховка и новый раунд
      try { const n = markRoundBetsFailed(hash); if (n > 0) console.log(`[DoubleGame] markFailed: ${n}`); } catch (e) {}
      this.round = null;
      this._createNewRound(bot);
    } catch (error) {
      console.error('[DoubleGame] resolve critical:', error.message);
      try { const n = refundBetsForRound(roundHash); if (n > 0) console.log(`[DoubleGame] Возвращено ставок: ${n}`); } catch (e) {}
      this.round = null;
      this._createNewRound(bot);
    } finally {
      this._resolving = false;
    }
  };

  // Расчёт ОДНОГО чата: выплаты в БД + готовое сообщение. Исходы пишутся в строки ставок (и в память).
  _buildChatResult(chatId, allBets, result, finalMultipliers, hash, salt) {
    const chatBets = allBets.filter((b) => b.chat_id === chatId);
    if (!chatBets.length) return null;

    const grouped = {};
    for (const bet of chatBets) {
      if (!grouped[bet.user_id]) {
        const u = getUserById(bet.user_id);
        grouped[bet.user_id] = { username: u?.username || 'Неизвестный', bets: {} };
      }
      if (!grouped[bet.user_id].bets[bet.multiplier]) grouped[bet.user_id].bets[bet.multiplier] = { amount: 0, details: [] };
      grouped[bet.user_id].bets[bet.multiplier].amount += bet.amount;
      grouped[bet.user_id].bets[bet.multiplier].details.push(bet); // ссылки на строки allBets
    }

    let msg = `<b>Итоговые результаты:</b>\n\n`;
    for (const [userId, userData] of Object.entries(grouped)) {
      for (const [multiplier, group] of Object.entries(userData.bets)) {
        let isWin = false, winAmount = 0, selectedMult = null;
        if (result === 'GAME') {
          if (multiplier === 'GAME') {
            let choice = this.gameChoices[`${chatId}_${userId}`] || this.globalChoices[`global_choice_${userId}`];
            if (!choice) choice = Math.random() < 0.5 ? 'left' : 'right';
            this.gameChoices[`${chatId}_${userId}`] = choice;
            this.globalUserChoices[userId] = choice;
            selectedMult = choice === 'left' ? finalMultipliers.left : finalMultipliers.right;
            winAmount = group.amount * parseInt(selectedMult.replace('x', ''), 10);
            isWin = true;
          }
        } else {
          isWin = multiplier === result;
          if (isWin) winAmount = group.amount * parseInt(result.replace('x', ''), 10);
        }

        // Исход по каждой одиночной ставке (строки) + в память для глобального прохода
        for (const d of group.details) {
          const detailWin = isWin ? Math.floor(winAmount * (d.amount / group.amount)) : 0;
          d.is_win = isWin ? 1 : 0;
          d.win_amount = detailWin;
          try { updateDoubleBetOutcome(d.id, isWin, detailWin); } catch (e) {}
        }

        const userLink = createUserLink(userId, userData.username);
        if (isWin && winAmount > 0) {
          if (multiplier === 'GAME') {
            msg += `✅ ${userLink} ставка ${group.amount.toLocaleString('ru-RU')} PF на GAME [${selectedMult}] → приз ${winAmount.toLocaleString('ru-RU')} PF\n`;
          } else {
            msg += `✅ ${userLink} ставка ${group.amount.toLocaleString('ru-RU')} PF на ${multiplier} → приз ${winAmount.toLocaleString('ru-RU')} PF\n`;
          }
          for (const d of group.details) {
            if (d.amount >= 100000 && Math.random() < 0.25) {
              const candy = Math.floor(Math.random() * 6) + 1;
              try { giveCandy(userId, candy); msg += `🍬 +${candy} конфет\n`; } catch (e) {}
            }
          }
          try { updateUserBalance(userId, winAmount); } catch (e) { console.error(`[DoubleGame] Выплата ${userId}:`, e.message); }
        } else {
          msg += `❌ ${userLink} ставка ${group.amount.toLocaleString('ru-RU')} PF на ${multiplier} проиграла\n`;
        }
      }
    }

    if (result === 'GAME') msg += `\n<b>☑️ Результаты GAME:</b> L:${finalMultipliers.left} R:${finalMultipliers.right}\n`;
    msg += `\n🔒 Хеш: ${hash} | Проверка: ${result.replace('x', '')}|${salt}`;

    const img = result === 'GAME'
      ? imgPath(`${finalMultipliers.left.replace('x', '')}l_${finalMultipliers.right.replace('x', '')}p.png`)
      : imgPath(`${result}.jpg`);
    return { chatId, text: msg.trim(), img };
  }

  // Глобальная статистика раунда: игрок = 1 участие, независимо от числа чатов.
  // Группы (игрок+множитель) объединяют ставки из всех чатов: x2 в чате A и x2 в чате B = одна группа.
  _applyRoundStatistics(allBets, hash) {
    const perUser = {};
    for (const b of allBets) {
      if (b.status !== 'accepted') continue;
      if (!perUser[b.user_id]) perUser[b.user_id] = { groups: {}, rows: [], won: false };
      const u = perUser[b.user_id];
      u.rows.push(b);
      if (!u.groups[b.multiplier]) u.groups[b.multiplier] = { amount: 0, win: 0, isWin: false };
      const g = u.groups[b.multiplier];
      g.amount += b.amount;
      if (b.is_win === 1) { g.isWin = true; g.win += (b.win_amount || 0); u.won = true; }
    }

    for (const [userId, u] of Object.entries(perUser)) {
      const mults = Object.keys(u.groups);
      let totalWinnings = 0, totalLosses = 0, wins = 0, losses = 0;

      for (const m of mults) {
        const g = u.groups[m];
        if (g.isWin) { wins++; totalWinnings += g.win; } else { losses++; totalLosses += g.amount; }
        // Любимый множитель: 1 отметка на (раунд + множитель), не на каждую ставку/чат
        try { incrementMultiplierCount(userId, m); } catch (e) {}
        // bet_history: 1 строка на (раунд + множитель) с суммами по всем чатам
        try { saveBetDetails(userId, [{ roundHash: hash, multiplier: m, amount: g.amount, isWin: g.isWin ? 1 : 0, winAmount: g.win }]); } catch (e) {}
      }

      // Макс. выигрыш — по одиночной ставке (строке)
      for (const b of u.rows) {
        if (b.is_win === 1 && (b.win_amount || 0) > 0) {
          try { updateMaxWinIfGreater(userId, b.win_amount); } catch (e) {}
        }
      }

      // Выигранный GAME — один раз за раунд
      if (u.groups['GAME'] && u.groups['GAME'].isWin) {
        try { incrementGameWins(userId); } catch (e) {}
      }

      // Серия: ровно один множитель во ВСЕХ чатах раунда + победа → +1, иначе обрыв
      const wonSingle = mults.length === 1 && u.won;
      try { updateWinStreak(userId, wonSingle); } catch (e) {}

      // Раунд-статистика — один раз на игрока за раунд
      try {
        updateRoundStatistics(userId, {
          totalRounds: 1, roundWins: u.won ? 1 : 0, roundLosses: u.won ? 0 : 1,
          doubleTotalBets: mults.length,
          doubleWins: wins, doubleLosses: losses,
          doubleTotalWinnings: totalWinnings, doubleTotalLosses: totalLosses,
        });
      } catch (e) {}
    }
  }

  // === СОСТОЯНИЕ ===
  _persist() {
    if (!this.round) return;
    try {
      setDoubleRoundState({
        ...this.round,
        state: this.state,
        gameChoices: this.gameChoices,
        globalChoices: this.globalChoices,
      });
    } catch (e) { console.error('[DoubleGame] persist:', e.message); }
  }

  _sendLogMessage(bot, message) {
    try {
      if (process.env.LOG_CHAT_ID && bot?.telegram) bot.telegram.sendMessage(process.env.LOG_CHAT_ID, message, { parse_mode: 'HTML' });
    } catch (e) {}
  }
}

module.exports = { doubleGame: new DoubleGame(), createUserLink };