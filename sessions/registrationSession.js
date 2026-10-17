//registrationSession.js
const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3(dbPath);

// Таблица сессий с таймстампом создания
db.prepare(`
  CREATE TABLE IF NOT EXISTS registration_sessions (
    user_id INTEGER PRIMARY KEY,
    registration_data TEXT DEFAULT NULL,
    last_accessed INTEGER NOT NULL,
    started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`).run();

// Индекс для быстрой очистки старых сессий
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reg_sess_started ON registration_sessions(started_at)`).run();

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 часа

function getRegistrationSession(userId) {
  const stmt = db.prepare(`SELECT * FROM registration_sessions WHERE user_id = ?`);
  const row = stmt.get(userId);
  if (!row?.registration_data) return null;
  
  // Проверяем актуальность сессии
  const now = Math.floor(Date.now() / 1000);
  if (now - row.started_at > SESSION_MAX_AGE_SECONDS) {
    console.log(`[SESSION] Сессия пользователя ${userId} устарела — автосброс.`);
    destroyRegistrationSession(userId);
    return null;
  }
  
  try {
    return JSON.parse(row.registration_data);
  } catch (e) {
    destroyRegistrationSession(userId);
    return null;
  }
}

function saveRegistrationSession(userId, registrationData) {
  const now = Math.floor(Date.now() / 1000);
  const serializedData = JSON.stringify(registrationData);
  const exists = db.prepare(`SELECT COUNT(*) AS count FROM registration_sessions WHERE user_id = ?`).get(userId).count > 0;
  
  if (exists) {
    // Обновляем, НЕ трогая started_at (только если сессия не была сброшена)
    db.prepare(`UPDATE registration_sessions SET registration_data = ?, last_accessed = ? WHERE user_id = ?`)
      .run(serializedData, now, userId);
  } else {
    db.prepare(`INSERT INTO registration_sessions (user_id, registration_data, last_accessed, started_at) VALUES (?, ?, ?, ?)`)
      .run(userId, serializedData, now, now);
  }
}

// Полный сброс сессии (с возможностью начать заново)
function resetRegistrationSession(userId) {
  destroyRegistrationSession(userId);
}

function destroyRegistrationSession(userId) {
  db.prepare(`DELETE FROM registration_sessions WHERE user_id = ?`).run(userId);
}

// Очистка всех устаревших сессий (вызывать раз в час из bot.js)
function cleanupExpiredSessions() {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SECONDS;
    const info = db.prepare(`DELETE FROM registration_sessions WHERE started_at < ?`).run(cutoff);
    if (info.changes > 0) {
      console.log(`[SESSION] Очищено ${info.changes} устаревших сессий регистрации.`);
    }
    return info.changes;
  } catch (e) {
    console.error('[SESSION] Ошибка очистки сессий:', e.message);
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