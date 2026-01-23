//registrationSession.js
const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3(dbPath);

// Создание таблицы для хранения сессий регистрации
db.prepare(`
  CREATE TABLE IF NOT EXISTS registration_sessions (
    user_id INTEGER PRIMARY KEY,
    registration_data TEXT DEFAULT NULL,    
    last_accessed INTEGER NOT NULL
  )
`).run();

// Функция получения сессии регистрации
function getRegistrationSession(userId) {
  const stmt = db.prepare(`SELECT * FROM registration_sessions WHERE user_id = ?`);
  const row = stmt.get(userId);
  return row?.registration_data ? JSON.parse(row.registration_data) : {};
}

// Функция сохранения состояния регистрации
function saveRegistrationSession(userId, registrationData) {
  const now = Math.floor(Date.now() / 1000);
  const serializedData = JSON.stringify(registrationData);

  const existingStmt = db.prepare(`SELECT COUNT(*) AS count FROM registration_sessions WHERE user_id = ?`);
  const exists = existingStmt.get(userId).count > 0;

  if (exists) {
    db.prepare(`UPDATE registration_sessions SET registration_data = ?, last_accessed = ? WHERE user_id = ?`)
      .run(serializedData, now, userId);
  } else {
    db.prepare(`INSERT INTO registration_sessions (user_id, registration_data, last_accessed) VALUES (?, ?, ?)`)
      .run(userId, serializedData, now);
  }


}

// Функция удаления сессии регистрации
function destroyRegistrationSession(userId) {
  db.prepare(`DELETE FROM registration_sessions WHERE user_id = ?`).run(userId);
}

module.exports = {
  getRegistrationSession,
  saveRegistrationSession,
  destroyRegistrationSession,
};