// app/backend/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const sqlite3 = require('better-sqlite3');

// === 1. Импорт функций из базы данных ===
const {
  getTickets,
  takeTickets,
  getUserById,
  awardPrizeToUser,
  getAdminLogsFinance,
  resolveLogSearchIds,
  getAdminDoubleRoundsView,
  getAdminDoubleBetsView,
  getDoubleRoundDetails
} = require('../../db');

// === 2. Настройка путей и инициализация БД ===
const dbPath = path.join(__dirname, '../../database.sqlite');
console.log(`[BACKEND] Путь к базе данных: ${dbPath}`);

let db;
try {
  db = new sqlite3(dbPath);
  console.log('[BACKEND] Подключение к базе данных успешно.');
} catch (err) {
  console.error('[BACKEND] Ошибка подключения к базе данных:', err.message);
  process.exit(1);
}

// === ПРАВИЛЬНЫЙ ПУТЬ К ФРОНТЕНДУ ===
const frontendBuildPath = path.join(__dirname, '../frontend/react/dist');

if (!fs.existsSync(frontendBuildPath)) {
  console.warn(`[BACKEND] ⚠️ Папка фронтенда не найдена: ${frontendBuildPath}`);
  console.warn(`[BACKEND] Выполните: cd app/frontend/react && npm run build`);
}

// === 3. Инициализация Express ===
const app = express();
const PORT = process.env.PORT || 25067;

app.use(cors());
app.use(express.json());

// === 4. API маршруты ===
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id.toString();
  try {
    const user = db.prepare('SELECT id, numeric_id, username, balance, df_balance, npf_shares FROM users WHERE id = ?').get(userId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error(`[BACKEND] Ошибка при получении пользователя ${userId}:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/online', (req, res) => {
  const hour = new Date().getHours();
  const base = 40 + Math.round(60 * Math.pow(Math.sin(((hour - 6) / 24) * Math.PI * 2), 2));
  const jitter = Math.floor(Math.random() * 15);
  res.json({ online: base + jitter });
});

let lastRequestTime = Date.now();
app.use((req, res, next) => {
  lastRequestTime = Date.now();
  next();
});

app.get('/api/tunnel-status', (req, res) => {
  const now = Date.now();
  const diffSeconds = Math.floor((now - lastRequestTime) / 1000);
  let status = '🟢 ONLINE';
  if (diffSeconds > 60) status = '🟡 IDLE (Нет запросов > 1 мин)';
  if (diffSeconds > 180) status = ' OFFLINE (Нет запросов > 3 мин)';
  res.json({
    status: status,
    lastActivitySecondsAgo: diffSeconds,
    serverTime: new Date().toISOString()
  });
});

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

app.get('/api/admin/check/:userId', (req, res) => {
  res.json({ isAdmin: true });
});

app.get('/api/fortune/tickets/:userId', (req, res) => {
  try {
    const user = getUserById(req.params.userId.toString());
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ tickets: getTickets(req.params.userId.toString()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PRIZES = [
  { title: '1 000 000 PF', weight: 50, type: 'pf', amount: 1000000 },
  { title: '50 ⭐️ звёзд', weight: 20, type: 'stars', amount: 5000 },
  { title: 'Админ статус', weight: 1, type: 'status', id: 1 },
  { title: 'DIAMOND', weight: 2, type: 'status', id: 4 },
  { title: 'Уникальная карта', weight: 5000, type: 'card' },
  { title: '20 GOLD контов', weight: 10, type: 'containers', amount: 20 },
  { title: 'Префикс 🍀', weight: 2, type: 'prefix' },
  { title: 'СЕКРЕТНЫЙ ПРИЗ', weight: 10, type: 'secret' },
];

function selectWeightedPrize() {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PRIZES[0];
}


app.post('/api/fortune/spin', (req, res) => {
  const userId = req.body.userId?.toString();
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const tickets = getTickets(userId);
    if (tickets < 1) return res.status(402).json({ error: 'No tickets' });
    const takeResult = takeTickets(userId, 1);
    if (!takeResult.success) return res.status(500).json({ error: takeResult.message });
    const prize = selectWeightedPrize();
    awardPrizeToUser(userId, prize);
    res.json({ prize: { title: prize.title, type: prize.type }, ticketsLeft: tickets - 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const LOGS_PAGE_SIZE = 42;

function parseLogsQuery(req) {
  const rawTs = parseInt(req.query.targetTs, 10);
  return {
    targetTs: Number.isNaN(rawTs) ? null : rawTs,
    searchIds: resolveLogSearchIds(String(req.query.search || '')),
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
  };
}

function clampOffset(offset, total, limit) {
  return Math.max(0, Math.min(offset, Math.max(0, total - limit)));
}

function getFinancePage({ targetTs = null, types = null, searchIds = null, limit = 50, offset = 0 }) {
  const where = [];
  const params = [];
  where.push(`((f.action IS NOT NULL AND f.action != '') OR f.amount IS NOT NULL OR f.target_user_id IS NOT NULL OR f.actor_user_id IS NOT NULL)`);
  if (types && types.length) {
    where.push(`f.type IN (${types.map(() => '?').join(',')})`);
    params.push(...types);
  }
  if (searchIds && searchIds.length) {
    const ph = searchIds.map(() => '?').join(',');
    where.push(`(CAST(f.actor_user_id AS TEXT) IN (${ph}) OR CAST(f.target_user_id AS TEXT) IN (${ph}))`);
    params.push(...searchIds, ...searchIds);
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM finance_log f ${whereSql}`).get(...params).c;
  let off = offset;
  if (targetTs != null) {
    const newer = db.prepare(`SELECT COUNT(*) AS c FROM finance_log f ${whereSql} AND f.ts > ?`).get(...params, targetTs).c;
    off = clampOffset(Math.floor(newer / limit) * limit, total, limit);
  }
  const selectCols = `f.id, f.ts, f.type, f.actor_user_id, f.target_user_id, f.amount, f.currency, f.ref, f.reason, f.action, f.payload, f.success, f.chat_id, f.chat_title, f.chat_type, a.username AS actor_name, a.numeric_id AS actor_num, t.username AS target_name, t.numeric_id AS target_num`;
  const joins = `FROM finance_log f LEFT JOIN users a ON CAST(a.id AS TEXT) = CAST(f.actor_user_id AS TEXT) LEFT JOIN users t ON CAST(t.id AS TEXT) = CAST(f.target_user_id AS TEXT)`;
  const rows = db.prepare(`SELECT ${selectCols} ${joins} ${whereSql} ORDER BY f.ts DESC LIMIT ? OFFSET ?`).all(...params, limit, off);
  return { rows, total, offset: off };
}

function getRoundsPage({ targetTs = null, hash = null, limit = 50, offset = 0 }) {
  const where = [];
  const params = [];
  if (hash) {
    const safe = String(hash).replace(/[%_]/g, '');
    if (safe) { where.push('round_id LIKE ?'); params.push('%' + safe + '%'); }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM double_rounds ${whereSql}`).get(...params).c;
  let off = offset;
  if (targetTs != null) {
    const cond = whereSql ? 'AND' : 'WHERE';
    const newer = db.prepare(`SELECT COUNT(*) AS c FROM double_rounds ${whereSql} ${cond} start_ts > ?`).get(...params, targetTs).c;
    off = clampOffset(Math.floor(newer / limit) * limit, total, limit);
  }
  const rows = db.prepare(`SELECT * FROM double_rounds ${whereSql} ORDER BY start_ts DESC LIMIT ? OFFSET ?`).all(...params, limit, off);
  return { rows, total, offset: off };
}

function getBetsPage({ targetTs = null, searchIds = null, hash = null, limit = 50, offset = 0 }) {
  let searchSql = '';
  const searchParams = [];
  const hasIds = searchIds && searchIds.length > 0;
  const safeHash = hash ? String(hash).replace(/[%_]/g, '') : '';
  const useHash = safeHash.length >= 8 && /^[0-9a-f]+$/i.test(safeHash);
  if (hasIds || useHash) {
    const parts = [];
    if (hasIds) {
      const ph = searchIds.map(() => '?').join(',');
      parts.push(`(b.user_id IN (${ph}) OR u.numeric_id IN (${ph}))`);
      searchParams.push(...searchIds, ...searchIds);
    }
    if (useHash) {
      parts.push('r.round_id LIKE ?');
      searchParams.push('%' + safeHash + '%');
    }
    searchSql = ' AND (' + parts.join(' OR ') + ')';
  }
  const baseFrom = `FROM double_bets_log b JOIN double_rounds r ON r.round_id = b.round_id LEFT JOIN users u ON u.id = b.user_id`;
  const groupCols = `b.round_id, b.user_id, b.chat_id`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM (SELECT 1 ${baseFrom} WHERE 1=1${searchSql} GROUP BY ${groupCols})`).get(...searchParams).c;
  let off = offset;
  if (targetTs != null) {
    const newer = db.prepare(`SELECT COUNT(*) AS c FROM (SELECT 1 ${baseFrom} WHERE 1=1${searchSql} GROUP BY ${groupCols} HAVING MIN(b.ts) > ?)`).get(...searchParams, targetTs).c;
    off = clampOffset(Math.floor(newer / limit) * limit, total, limit);
  }
  const selectCols = `b.round_id, b.user_id, b.chat_id, MIN(b.ts) as ts, u.username as user_name, u.numeric_id as user_num, r.start_ts as round_start_ts, r.end_ts as round_end_ts, r.result_multiplier, r.salt, r.status as round_status, MAX(b.chat_title) as chat_title`;
  const groups = db.prepare(`SELECT ${selectCols} ${baseFrom} WHERE 1=1${searchSql} GROUP BY ${groupCols} ORDER BY ts DESC LIMIT ? OFFSET ?`).all(...searchParams, limit, off);
  const betsStmt = db.prepare(`SELECT multiplier, amount, is_win, win_amount, game_choice, payout_status FROM double_bets_log WHERE round_id = ? AND user_id = ? AND chat_id = ? ORDER BY ts ASC`);
  const rows = groups.map(g => ({ ...g, bets: betsStmt.all(g.round_id, g.user_id, g.chat_id) }));
  return { rows, total, offset: off };
}

app.get('/api/admin/logs/finance', (req, res) => {
  try {
    const { targetTs, searchIds, page } = parseLogsQuery(req);
    const types = req.query.types ? String(req.query.types).split(',').filter(Boolean) : null;
    const result = getFinancePage({
      targetTs,
      types,
      searchIds,
      limit: LOGS_PAGE_SIZE,
      offset: (page - 1) * LOGS_PAGE_SIZE,
    });
    res.json({
      rows: result.rows,
      total: result.total,
      page: Math.floor(result.offset / LOGS_PAGE_SIZE) + 1,
      pages: Math.max(1, Math.ceil(result.total / LOGS_PAGE_SIZE)),
    });
  } catch (e) {
    console.error('[BACKEND] Error finance logs:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/logs/double', (req, res) => {
  try {
    const { targetTs, searchIds, page } = parseLogsQuery(req);
    const view = req.query.view === 'bets' ? 'bets' : 'rounds';
    const searchRaw = String(req.query.search || '').trim();
    let result;
    if (view === 'bets') {
      result = getBetsPage({
        targetTs,
        searchIds,
        hash: searchRaw || null,
        limit: LOGS_PAGE_SIZE,
        offset: (page - 1) * LOGS_PAGE_SIZE,
      });
    } else {
      result = getRoundsPage({
        targetTs,
        hash: searchRaw || null,
        limit: LOGS_PAGE_SIZE,
        offset: (page - 1) * LOGS_PAGE_SIZE,
      });
    }
    res.json({
      rows: result.rows,
      total: result.total,
      page: Math.floor(result.offset / LOGS_PAGE_SIZE) + 1,
      pages: Math.max(1, Math.ceil(result.total / LOGS_PAGE_SIZE)),
    });
  } catch (e) {
    console.error('[BACKEND] Error double logs:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/logs/double/round/:roundId', (req, res) => {
  try {
    const details = getDoubleRoundDetails(req.params.roundId);
    if (!details.success) return res.status(404).json({ error: details.error });
    res.json(details);
  } catch (e) {
    console.error('[BACKEND] Round details error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/physics/users', (req, res) => {
  try {
    const stmt = db.prepare(`SELECT id, numeric_id, username, balance FROM users ORDER BY balance DESC LIMIT 2000`);
    const users = stmt.all();
    res.json(users);
  } catch (err) {
    console.error('[BACKEND] Ошибка физики:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// === 4.9 API нового фронтенда (дизайн) ===
app.use('/api/v2', require('./plainApi'));
// === 4.10 Статика нового фронтенда на /v2, параллельно старому ===
const plainFrontendPath = path.join(__dirname, '../frontend/plain');
if (fs.existsSync(plainFrontendPath)) {
  app.use('/v2', express.static(plainFrontendPath));
} else {
  console.warn('[BACKEND] Новый фронтенд не найден: ' + plainFrontendPath);
}

// === 5. Статика и роутинг фронтенда ===
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`<h1>Mini App Backend</h1><p>Фронтенд не найден в ${frontendBuildPath}. Запустите npm run build в папке react.</p>`);
  });
}

// === 6. Запуск сервера ===
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKEND] Сервер запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[BACKEND] Порт ${PORT} занят!`);
  } else {
    console.error('[BACKEND] Критическая ошибка сервера:', err);
  }
});

server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

setInterval(() => {
  http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
    res.on('data', () => {});
  }).on('error', () => {});
}, 15000);

// === WebSocket для онлайна ===
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ noServer: true });

// Счетчик подключенных клиентов мини-аппа
let miniAppClients = 0;

// Обработка upgrade для WebSocket
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/ws/online') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  miniAppClients++;
  // Отправляем текущий онлайн новому клиенту
  ws.send(JSON.stringify({ type: 'online_count', count: miniAppClients }));
  
  // Рассылаем обновленный онлайн всем клиентам
  const broadcast = () => {
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify({ type: 'online_count', count: miniAppClients }));
      }
    });
  };
  
  ws.on('close', () => {
    miniAppClients--;
    broadcast();
  });
  
  ws.on('error', () => {
    miniAppClients--;
    broadcast();
  });
});