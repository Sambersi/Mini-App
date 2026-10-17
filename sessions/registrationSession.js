//registrationSession.js
const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3(dbPath);

// 1. Создаём таблицу, если её ещё нет (старая базовая схема)
db.prepare(`
  CREATE TABLE IF NOT EXISTS registration_sessions (
    user_id INTEGER PRIMARY KEY,
    registration_data TEXT DEFAULT NULL,
    last_accessed INTEGER NOT NULL
  )
`).run();

// 2. МИГРАЦИЯ: добавляем колонку started_at для таймаута 24 часа
try {
  db.exec(`ALTER TABLE registration_sessions ADD COLUMN started_at INTEGER DEFAULT (strftime('%s', 'now'))`);
  console.log('[SESSION] Migration: added column started_at');
} catch (e) {
  // Ошибка "duplicate column name" — колонка уже есть, это нормально
  if (!e.message.includes('duplicate column')) {
    console.error('[SESSION] Migration started_at error:', e.message);
  }
}

// 3. Индекс для быстрой очистки устаревших сессий
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reg_sess_started ON registration_sessions(started_at)`);
} catch (e) {
  // индекс уже существует — игнорируем
}

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 часа

// === Получение сессии ===
function getRegistrationSession(userId) {
  try {
    const stmt = db.prepare(`SELECT * FROM registration_sessions WHERE user_id = ?`);
    const row = stmt.get(userId);
    if (!row?.registration_data) return null;

    // Проверяем актуальность сессии (таймаут 24 часа)
    const now = Math.floor(Date.now() / 1000);
    const startedAt = row.started_at || now; // на случай если миграция не успела записаться
    if (now - startedAt > SESSION_MAX_AGE_SECONDS) {
      console.log(`[SESSION] Сессия пользователя ${userId} устарела — автосброс.`);
      destroyRegistrationSession(userId);
      return null;
    }

    return JSON.parse(row.registration_data);
  } catch (e) {
    console.error('[SESSION] getRegistrationSession error:', e.message);
    return null;
  }
}

// === Сохранение сессии ===
function saveRegistrationSession(userId, registrationData) {
  const now = Math.floor(Date.now() / 1000);
  const serializedData = JSON.stringify(registrationData);
  const exists = db.prepare(`SELECT COUNT(*) AS count FROM registration_sessions WHERE user_id = ?`).get(userId).count > 0;

  if (exists) {
    // Обновляем существующую запись (started_at НЕ трогаем — сохраняем время начала)
    db.prepare(`UPDATE registration_sessions SET registration_data = ?, last_accessed = ? WHERE user_id = ?`)
      .run(serializedData, now, userId);
  } else {
    // Создаём новую запись с started_at
    db.prepare(`INSERT INTO registration_sessions (user_id, registration_data, last_accessed, started_at) VALUES (?, ?, ?, ?)`)
      .run(userId, serializedData, now, now);
  }
}

// === Полный сброс сессии (для /start во время регистрации) ===
function resetRegistrationSession(userId) {
  destroyRegistrationSession(userId);
}

// === Удаление сессии ===
function destroyRegistrationSession(userId) {
  db.prepare(`DELETE FROM registration_sessions WHERE user_id = ?`).run(userId);
}

// === Очистка всех устаревших сессий (вызывать из bot.js раз в час) ===
function cleanupExpiredSessions() {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SECONDS;
    const info = db.prepare(`DELETE FROM registration_sessions WHERE started_at < ?`).run(cutoff);
    if (info.changes > 0) {
      console.log(`[SESSION] Очищено ${info.changes} устаревших сессий регистрации.`);
    }
    return info.changes;
  } catch (e) {
    console.error('[SESSION] cleanupExpiredSessions error:', e.message);
    return 0;
  }
}

module.exports = {
  getRegistrationSession,
  saveRegistrationSession,
  destroyRegistrationSession,
  resetRegistrationSession,
  cleanupExpiredSessions,
};