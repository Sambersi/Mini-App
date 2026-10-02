// app/backend/plainApi.js — API под новый фронтенд (дизайн RODI.DSGN)
const express = require('express');
const path = require('path');
const sqlite3 = require('better-sqlite3');
const {
  getUserById, getUserStatuses, updateLastBonusTime,
  updateUserBalance, updateUserData, logFinance,
} = require('../../db');

const router = express.Router();

// === КОНФИГ веб-бонуса ===
// ВНИМАНИЕ: файлы бота handlers/bonus.js мне не предоставлены, поэтому суммы ниже —
// ЗАГЛУШКИ-КОНСТАНТЫ. Выставь сюда те же значения, что в бонусе бота.
const BONUS_COOLDOWN_SEC = 2 * 60 * 60; // «каждые 2 часа» — из текста дизайна
const MEGA_EVERY = 6;                   // «каждый 6-й прокрут» — из текста дизайна
const MEGA_MULTIPLIER = 2;              // «удвоенные призы» — из текста дизайна
const WEB_BONUS_PF_MIN = 1000;          // ЗАГЛУШКА: сверь с handlers/bonus.js
const WEB_BONUS_PF_MAX = 5000;          // ЗАГЛУШКА: сверь с handlers/bonus.js

// Миграция: счётчик веб-прокрутов (прогресс 1..6), паттерн как в db.js
const db = sqlite3(path.join(__dirname, '../../database.sqlite'));
try { db.exec('ALTER TABLE users ADD COLUMN web_bonus_spins INTEGER DEFAULT 0'); } catch (e) { /* колонка уже есть */ }

// Профиль + статусы (в /api/user/:id статусов нет, дизайн их требует)
router.get('/user/:id', async (req, res) => {
  const userId = req.params.id.toString();
  try {
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const statuses = await getUserStatuses(userId); // имена статусов из db.js
    res.json({
      id: user.id, numeric_id: user.numeric_id, username: user.username,
      balance: user.balance, df_balance: user.df_balance, npf_shares: user.npf_shares,
      statuses,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/bonus/status/:userId', (req, res) => {
  const user = getUserById(req.params.userId.toString());
  if (!user) return res.status(404).json({ error: 'User not found' });
  const now = Math.floor(Date.now() / 1000);
  const last = user.last_private_bonus_time || 0; // общий кулдаун с приват-бонусом бота
  res.json({
    availableIn: Math.max(0, last + BONUS_COOLDOWN_SEC - now),
    progress: (user.web_bonus_spins || 0) % MEGA_EVERY,
    megaEvery: MEGA_EVERY,
  });
});

router.post('/bonus/spin', (req, res) => {
  const userId = req.body?.userId?.toString();
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const now = Math.floor(Date.now() / 1000);
  const last = user.last_private_bonus_time || 0;
  if (now - last < BONUS_COOLDOWN_SEC) {
    return res.status(425).json({ error: 'cooldown', availableIn: last + BONUS_COOLDOWN_SEC - now });
  }
  const spins = (user.web_bonus_spins || 0) + 1;
  const isMega = spins % MEGA_EVERY === 0;
  let amount = WEB_BONUS_PF_MIN + Math.floor(Math.random() * (WEB_BONUS_PF_MAX - WEB_BONUS_PF_MIN + 1));
  if (isMega) amount *= MEGA_MULTIPLIER;
  try {
    updateUserBalance(userId, amount);
  } catch (e) { return res.status(500).json({ error: e.message }); }
  updateLastBonusTime(userId, now, true); // приват-кулдаун (бот и веб делят один таймер)
  updateUserData(userId, { web_bonus_spins: spins });
  logFinance({
    type: 'web_bonus', actorUserId: userId, targetUserId: null, amount, currency: 'PF',
    ref: null, chatId: null, chatTitle: null, chatType: null, reason: null,
    action: `${user.username} забрал веб-бонус → +${amount.toLocaleString('ru-RU')} PF${isMega ? ' (MEGA)' : ''}`,
    payload: { spins, isMega }, success: 1,
  });
  res.json({ amount, isMega, progress: spins % MEGA_EVERY, availableIn: BONUS_COOLDOWN_SEC });
});

module.exports = router;