// app/backend/plainApi.js — API под новый фронтенд (дизайн RODI.DSGN)
const express = require('express');
const path = require('path');
const sqlite3 = require('better-sqlite3');
const {
  getUserById,
  getUserStatuses, // Используем готовую функцию из db.js для получения списка имен
  updateLastBonusTime,
  updateUserBalance,
  updateUserData,
  logFinance,
  getAllStatuses // Добавим эту функцию, чтобы знать приоритеты
} = require('../../db');

const router = express.Router();

// === КОНФИГ веб-бонуса ===
const BONUS_COOLDOWN_SEC = 2 * 60 * 60;
const MEGA_EVERY = 6;
const MEGA_MULTIPLIER = 2;
const WEB_BONUS_PF_MIN = 1000;
const WEB_BONUS_PF_MAX = 5000;

// Подключаемся к БД для миграции и прямых запросов, если нужно
const dbPath = path.join(__dirname, '../../database.sqlite');
const db = sqlite3(dbPath);

// Миграция: счётчик веб-прокрутов
try {
  db.exec('ALTER TABLE users ADD COLUMN web_bonus_spins INTEGER DEFAULT 0');
} catch (e) {
  /* колонка уже есть */
}

// Функция получения статуса с максимальным приоритетом
// Мы не можем сделать это одним SQL-запросом легко из-за JSON в status_ids,
// поэтому делаем это в JS, используя данные из db.js
function getTopStatusName(userId) {
  try {
    // 1. Получаем список имен статусов пользователя (уже реализовано в db.js)
    // getUserStatuses - асинхронная в db.js? Нет, в db.js она async, но здесь нам нужна синхронность или await.
    // В db.js getUserStatuses объявлена как async function.
    // Но plainApi роут тоже async.
    return null; // Заглушка, реализуем ниже в роуте через await
  } catch (e) {
    return null;
  }
}

// Роут профиля
router.get('/user/:id', async (req, res) => {
  const userId = req.params.id.toString();
  try {
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Получаем имена статусов (async функция из db.js)
    const statusNames = await getUserStatuses(userId);

    // Получаем все статусы с приоритетами (синхронная функция из db.js)
    const allStatuses = getAllStatuses(); // Возвращает [{id, name, priority}, ...]

    // Находим пересечение и выбираем с макс приоритетом
    let topStatusName = null;
    let maxPriority = -1;

    for (const s of allStatuses) {
      if (statusNames.includes(s.name)) {
        if (s.priority > maxPriority) {
          maxPriority = s.priority;
          topStatusName = s.name;
        }
      }
    }

    res.json({
      id: user.id,
      numeric_id: user.numeric_id,
      username: user.username,
      balance: user.balance,
      df_balance: user.df_balance,
      npf_shares: user.npf_shares,
      statuses: statusNames,
      topStatus: topStatusName, // Вот он, статус с макс приоритетом
    });
  } catch (e) {
    console.error('[plainApi] Error /user/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Остальные роуты бонуса остаются без изменений ---

router.get('/bonus/status/:userId', (req, res) => {
  const user = getUserById(req.params.userId.toString());
  if (!user) return res.status(404).json({ error: 'User not found' });
  const now = Math.floor(Date.now() / 1000);
  const last = user.last_private_bonus_time || 0;
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
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  updateLastBonusTime(userId, now, true);
  updateUserData(userId, { web_bonus_spins: spins });
  logFinance({
    type: 'web_bonus',
    actorUserId: userId,
    targetUserId: null,
    amount,
    currency: 'PF',
    ref: null,
    chatId: null,
    chatTitle: null,
    chatType: null,
    reason: null,
    action: `${user.username} забрал веб-бонус → +${amount.toLocaleString('ru-RU')} PF${isMega ? ' (MEGA)' : ''}`,
    payload: { spins, isMega },
    success: 1,
  });
  res.json({ amount, isMega, progress: spins % MEGA_EVERY, availableIn: BONUS_COOLDOWN_SEC });
});

module.exports = router;