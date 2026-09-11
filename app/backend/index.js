//app\backend\index.js

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const sqlite3 = require('better-sqlite3');

// === 1. Импорт функций из базы данных (объединено в одном месте) ===
const { 
  getTickets, 
  takeTickets, 
  getUserById, 
  awardPrizeToUser,
  getAdminLogsFinance, 
  getAdminLogsDouble, 
  resolveLogSearchIds 
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

const frontendOutPath = path.join(__dirname, '../frontend/out');
if (!fs.existsSync(frontendOutPath)) {
  console.warn(`[BACKEND] Папка фронтенда не найдена: ${frontendOutPath}`);
}

// === 3. Инициализация Express ===
const app = express();
const PORT = process.env.PORT || 25071;

app.use(cors());
app.use(express.json());

// === 4. API маршруты ===

// Получить данные пользователя по Telegram ID
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

// Здоровье сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Счётчик онлайна (демо-формула)
app.get('/api/online', (req, res) => {
  const hour = new Date().getHours();
  const base = 40 + Math.round(60 * Math.pow(Math.sin(((hour - 6) / 24) * Math.PI * 2), 2));
  const jitter = Math.floor(Math.random() * 15);
  res.json({ online: base + jitter });
});

// === Мониторинг туннеля ===
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
  if (diffSeconds > 180) status = '🔴 OFFLINE (Нет запросов > 3 мин)';

  res.json({
    status: status,
    lastActivitySecondsAgo: diffSeconds,
    serverTime: new Date().toISOString()
  });
});

// Белый список админов из .env
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// Проверка админа (ВРЕМЕННО ДОСТУПНО ВСЕМ)
app.get('/api/admin/check/:userId', (req, res) => {
  res.json({ isAdmin: true }); 
});

// Количество билетов
app.get('/api/fortune/tickets/:userId', (req, res) => {
  try {
    const user = getUserById(req.params.userId.toString());
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ tickets: getTickets(req.params.userId.toString()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Вращение колеса фортуны
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

// === Админские логи (перенесено из "хвоста") ===
const LOG_RANGE_MS = { day: 86400000, week: 604800000, month: 2592000000, all: 0 };
const LOGS_PAGE_SIZE = 30;

function parseLogsQuery(req) {
    const rangeMs = LOG_RANGE_MS[req.query.range] ?? LOG_RANGE_MS.day;
    return {
        sinceTs: Date.now() - rangeMs,
        searchIds: resolveLogSearchIds(req.query.search || ''),
        page: Math.max(1, parseInt(req.query.page, 10) || 1),
    };
}

app.get('/api/admin/logs/finance', (req, res) => {
    try {
        const { sinceTs, searchIds, page } = parseLogsQuery(req);
        const types = req.query.types ? String(req.query.types).split(',').filter(Boolean) : null;
        const { rows, total } = getAdminLogsFinance({ sinceTs, types, searchIds, limit: LOGS_PAGE_SIZE, offset: (page - 1) * LOGS_PAGE_SIZE });
        res.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE)) });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/admin/logs/double', (req, res) => {
    try {
        const { sinceTs, searchIds, page } = parseLogsQuery(req);
        const { rows, total } = getAdminLogsDouble({ sinceTs, searchIds, limit: LOGS_PAGE_SIZE, offset: (page - 1) * LOGS_PAGE_SIZE });
        res.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE)) });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// === 5. Статика и роутинг фронтенда ===
if (fs.existsSync(frontendOutPath)) {
  app.use(express.static(frontendOutPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendOutPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`<h1>Mini App Backend</h1><p>Фронтенд не найден в ${frontendOutPath}</p>`);
  });
}

// === Запуск сервера с обработкой занятости порта ===
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKEND] Сервер запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[BACKEND] Порт ${PORT} занят! Попытка убить процесс...`);
    // На Windows можно попробовать автоматически найти и убить процесс
    const { exec } = require('child_process');
    exec(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${PORT}" ^| find "LISTENING"') do taskkill /F /PID %a`, 
      (error, stdout) => {
        if (!error && stdout.trim()) {
          console.log('[BACKEND] Процесс убит. Перезапуск сервера через 2 секунды...');
          setTimeout(() => {
            app.listen(PORT, '0.0.0.0', () => {
              console.log(`[BACKEND] Сервер перезапущен на порту ${PORT}`);
            });
          }, 2000);
        } else {
          console.error(`[BACKEND] Не удалось освободить порт. Закройте вручную процесс на порту ${PORT}.`);
        }
      }
    );
  } else {
    console.error('[BACKEND] Критическая ошибка сервера:', err);
  }
});

server.keepAliveTimeout = 60000; 
server.headersTimeout = 65000;   

// Keep-Alive пинг самого себя
setInterval(() => {
  http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
    res.on('data', () => {}); 
  }).on('error', (err) => {
    console.error('[KEEP-ALIVE] Ошибка пинга самого себя:', err.message);
  });
}, 15000);