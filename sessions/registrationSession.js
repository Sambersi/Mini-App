//registrationSession.js
const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3(dbPath);

// Создание таблицы для хранения сессий регистрации (базовая схема)
db.prepare(`CREATE TABLE IF NOT EXISTS registration_sessions (
  user_id INTEGER PRIMARY KEY,
  registration_data TEXT DEFAULT NULL,
  last_accessed INTEGER NOT NULL
)`).run();

// === МИГРАЦИЯ: колонка started_at ===
// ВАЖНО: дефолт обязан быть КОНСТАНТОЙ (SQLite не позволяет выражения в ADD COLUMN)
function ensureStartedAtColumn() {
  try {
    const cols = db.prepare('PRAGMA table_info(registration_sessions)').all();
    if (!cols.some((c) => c.name === 'started_at')) {
      db.exec(`ALTER TABLE registration_sessions ADD COLUMN started_at INTEGER DEFAULT 0`);
      console.log('[SESSION] Migration: added column started_at');
    }
  } catch (e) {
    console.error('[SESSION] Migration started_at error:', e.message);
  }
}
ensureStartedAtColumn();

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 часа

// Функция получения сессии регистрации
function getRegistrationSession(userId) {
  try {
    const stmt = db.prepare(`SELECT * FROM registration_sessions WHERE user_id = ?`);
    const row = stmt.get(userId);
    if (!row?.registration_data) return {};

    // Проверка срока жизни сессии (started_at = 0 считаем свежей)
    const now = Math.floor(Date.now() / 1000);
    const startedAt = row.started_at || now;
    if (now - startedAt > SESSION_MAX_AGE_SECONDS) {
      console.log(`[SESSION] Сессия пользователя ${userId} устарела — автосброс.`);
      destroyRegistrationSession(userId);
      return {};
    }

    return JSON.parse(row.registration_data);
  } catch (e) {
    console.error('[SESSION] getRegistrationSession error:', e.message);
    return {};
  }
}

// Функция сохранения состояния регистрации
function saveRegistrationSession(userId, registrationData) {
  const now = Math.floor(Date.now() / 1000);
  const serializedData = JSON.stringify(registrationData);

  // Самолечение: если колонки нет (старая БД) — создаём перед записью
  ensureStartedAtColumn();

  const exists = db.prepare(`SELECT COUNT(*) AS count FROM registration_sessions WHERE user_id = ?`).get(userId).count > 0;

  if (exists) {
    // started_at НЕ трогаем — сохраняем время начала текущей сессии
    db.prepare(`UPDATE registration_sessions SET registration_data = ?, last_accessed = ? WHERE user_id = ?`)
      .run(serializedData, now, userId);
  } else {
    db.prepare(`INSERT INTO registration_sessions (user_id, registration_data, last_accessed, started_at) VALUES (?, ?, ?, ?)`)
      .run(userId, serializedData, now, now);
  }
}

// Функция удаления сессии регистрации
function destroyRegistrationSession(userId) {
  db.prepare(`DELETE FROM registration_sessions WHERE user_id = ?`).run(userId);
}

// Полный сброс (синоним для /start во время регистрации)
function resetRegistrationSession(userId) {
  destroyRegistrationSession(userId);
}

// Очистка устаревших сессий (вызывать из bot.js раз в час)
function cleanupExpiredSessions() {
  try {
    ensureStartedAtColumn();
    const cutoff = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SECONDS;
    const info = db.prepare(`DELETE FROM registration_sessions WHERE started_at > 0 AND started_at < ?`).run(cutoff);
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