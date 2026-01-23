// app/backend/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('better-sqlite3');

// === Настройка путей ===
const dbPath = path.join(__dirname, '../../database.sqlite'); // Путь к БД
console.log(`[BACKEND] Путь к базе данных: ${dbPath}`);

// Путь к фронтенду (папка out)
const frontendOutPath = path.join(__dirname, '../frontend/out');

// Проверяем существование папки с фронтендом
const fs = require('fs');
if (!fs.existsSync(frontendOutPath)) {
  console.warn(`[BACKEND] Папка фронтенда не найдена: ${frontendOutPath}`);
}

// === Инициализация базы данных ===
let db;
try {
  db = new sqlite3(dbPath);
  console.log('[BACKEND] Подключение к базе данных успешно.');
} catch (err) {
  console.error('[BACKEND] Ошибка подключения к базе данных:', err.message);
  process.exit(1);
}

// === Инициализация Express ===
const app = express();
const PORT = process.env.PORT || 25071;

app.use(cors());
app.use(express.json());

// === API маршруты ===

/**
 * Получить данные пользователя по Telegram ID
 */
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id.toString(); // Приводим к строке
  try {
    const user = db.prepare('SELECT id, username, balance, df_balance FROM users WHERE id = ?').get(userId);
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

// === Статика и роутинг ===
if (fs.existsSync(frontendOutPath)) {
  app.use(express.static(frontendOutPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendOutPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <h1>Mini App Backend</h1>
      <p>Фронтенд не найден.</p>
      <p><a href="/api/health">Здоровье сервера</a></p>
    `);
  });
}

// === Запуск сервера ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKEND] Сервер запущен на порту ${PORT}`);
});