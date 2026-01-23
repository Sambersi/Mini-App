//skinShopSession.js

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3(dbPath);

// Создание таблицы для хранения сессий магазина скинов
db.prepare(`
  CREATE TABLE IF NOT EXISTS skin_shop_sessions (
    user_id INTEGER PRIMARY KEY,
    skin_shop_data TEXT DEFAULT NULL,   
    last_accessed INTEGER NOT NULL
  )
`).run();

// Функция получения сессии магазина скинов
function getSkinShopSession(userId) {
  const stmt = db.prepare(`SELECT * FROM skin_shop_sessions WHERE user_id = ?`);
  const row = stmt.get(userId);
  return row?.skin_shop_data ? JSON.parse(row.skin_shop_data) : {};
}

// Функция сохранения состояния магазина скинов
function saveSkinShopSession(userId, skinShopData) {
  const now = Math.floor(Date.now() / 1000);
  const serializedData = JSON.stringify(skinShopData);

  const existingStmt = db.prepare(`SELECT COUNT(*) AS count FROM skin_shop_sessions WHERE user_id = ?`);
  const exists = existingStmt.get(userId).count > 0;

  if (exists) {
    db.prepare(`UPDATE skin_shop_sessions SET skin_shop_data = ?, last_accessed = ? WHERE user_id = ?`)
      .run(serializedData, now, userId);
  } else {
    db.prepare(`INSERT INTO skin_shop_sessions (user_id, skin_shop_data, last_accessed) VALUES (?, ?, ?)`)
      .run(userId, serializedData, now);
  }
}

// Функция удаления сессии магазина скинов
function destroySkinShopSession(userId) {
  db.prepare(`DELETE FROM skin_shop_sessions WHERE user_id = ?`).run(userId);
}

module.exports = {
  getSkinShopSession,
  saveSkinShopSession,
  destroySkinShopSession,
};