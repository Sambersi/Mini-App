// empire/db.js
const sqlite3 = require('better-sqlite3');
const path = require('path');
// Импортируем функции из логики, чтобы получить конфиг при обновлении
const { getBusinessConfigByTypeId, getBusinessTypeNameById } = require('./logic/businessLogic'); // Добавили getBusinessTypeNameById

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3(dbPath);

// --- Создание вспомогательных таблиц для империй ---

// Таблица бизнесов (ссылается на users.id)
db.prepare(`CREATE TABLE IF NOT EXISTS empire_businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL, -- Telegram ID владельца (ссылка на users.id)
  type TEXT NOT NULL, -- Тип бизнеса (строковое имя, например 'mine', 'factory')
  level INTEGER DEFAULT 1,
  imp_generation_rate REAL DEFAULT 0, -- IMP/час на текущем уровне
  max_daily_imp INTEGER DEFAULT 0, -- Максимальный вывод в сутки
  imp_accumulated REAL DEFAULT 0, -- Накопленные IMP
  wear_percentage INTEGER DEFAULT 0, -- Износ (0-100)
  last_income_time INTEGER DEFAULT NULL, -- Время последнего начисления дохода
  created_at INTEGER DEFAULT (unixepoch()), -- Время создания
  FOREIGN KEY (owner_id) REFERENCES users(id) -- Внешний ключ
)`).run();

// Таблица лицензий (ссылается на users.id и empire_businesses.id)
db.prepare(`CREATE TABLE IF NOT EXISTS empire_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  business_id INTEGER NOT NULL,
  daily_limit_increase INTEGER DEFAULT 0,
  expires_at INTEGER DEFAULT NULL, -- Время истечения (если временные)
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (business_id) REFERENCES empire_businesses(id)
)`).run();

// Таблица кланов
db.prepare(`CREATE TABLE IF NOT EXISTS empire_clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  leader_id TEXT NOT NULL, -- Telegram ID лидера (ссылка на users.id)
  created_at INTEGER DEFAULT (unixepoch()),
  treasury_imp REAL DEFAULT 0, -- Казна клана
  FOREIGN KEY (leader_id) REFERENCES users(id)
)`).run();

// Таблица участников кланов
db.prepare(`CREATE TABLE IF NOT EXISTS empire_clan_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, -- Telegram ID участника (ссылка на users.id)
  clan_id INTEGER NOT NULL,
  join_date INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (clan_id) REFERENCES empire_clans(id)
)`).run();

// Таблица атак (для PvP)
db.prepare(`CREATE TABLE IF NOT EXISTS empire_attacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id TEXT NOT NULL, -- Telegram ID атакующего
  defender_id TEXT NOT NULL, -- Telegram ID защищающегося
  business_id INTEGER NOT NULL, -- ID бизнеса, на который напали
  timestamp INTEGER DEFAULT (unixepoch()),
  result TEXT, -- Победа/Поражение/Ничья
  stolen_imp REAL DEFAULT 0, -- Украденные IMP
  FOREIGN KEY (attacker_id) REFERENCES users(id),
  FOREIGN KEY (defender_id) REFERENCES users(id),
  FOREIGN KEY (business_id) REFERENCES empire_businesses(id)
)`).run();

// Индексы для производительности
db.prepare(`CREATE INDEX IF NOT EXISTS idx_empire_businesses_owner ON empire_businesses(owner_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_empire_clan_members_user ON empire_clan_members(user_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_empire_attacks_defender ON empire_attacks(defender_id)`).run();

// --- Функции для работы с вспомогательными таблицами империй ---

function createBusiness(userId, typeId, level = 1) { // Принимает ID типа, а не строку
  const config = getBusinessConfigByTypeId(typeId, level); // Убедились, что передаём level
  if (!config) {
    console.error(`[empire/db] Попытка создать бизнес с неизвестным ID типа: ${typeId}`);
    return false; // Или выбросить ошибку
  }

  // --- ИСПРАВЛЕНИЕ: Получаем строковое имя типа из маппинга ---
  const typeName = getBusinessTypeNameById(typeId); // Например, 'mine', 'factory'
  if (!typeName) {
      console.error(`[empire/db] Не удалось получить строковое имя для ID типа: ${typeId}`);
      return false;
  }
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

  const stmt = db.prepare(`
    INSERT INTO empire_businesses (owner_id, type, level, imp_generation_rate, max_daily_imp, last_income_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  try {
    // Используем typeName (например, 'mine') вместо config.name (например, 'Шахта')
    stmt.run(userId.toString(), typeName, level, config.impPerHour, config.maxDailyImp || 1000, Math.floor(Date.now() / 1000));
    return true;
  } catch (error) {
    console.error(`[empire/db] Ошибка при создании бизнеса: ${error.message}`);
    return false;
  }
}

// --- НОВАЯ ФУНКЦИЯ: Обновление уровня бизнеса ---
function upgradeBusinessLevel(businessId, newLevel) {
    const business = getBusinessById(businessId);
    if (!business) {
        console.error(`[empire/db] Попытка улучшить несуществующий бизнес с ID ${businessId}.`);
        return false;
    }

    // Получаем тип бизнеса из базы (строковое имя)
    const businessTypeName = business.type;

    // Находим ID типа по строковому имени
    const typeId = getTypeIdByName(businessTypeName);
    if (!typeId) {
        console.error(`[empire/db] Не найден ID типа для строки '${businessTypeName}' у бизнеса ID ${businessId}.`);
        return false;
    }

    // Получаем конфигурацию для нового уровня
    const config = getBusinessConfigByTypeId(typeId, newLevel);
    if (!config) {
        console.error(`[empire/db] Попытка улучшить бизнес ID ${businessId} до уровня ${newLevel} с неизвестной конфигурацией.`);
        return false;
    }

    const stmt = db.prepare(`
        UPDATE empire_businesses 
        SET level = ?, imp_generation_rate = ?, max_daily_imp = ? 
        WHERE id = ?
    `);
    try {
        stmt.run(newLevel, config.impPerHour, config.maxDailyImp || 1000, businessId);
        return true;
    } catch (error) {
        console.error(`[empire/db] Ошибка при улучшении бизнеса ID ${businessId}: ${error.message}`);
        return false;
    }
}

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Получение ID типа по строковому имени (для upgradeBusinessLevel) ---
function getTypeIdByName(typeName) {
    // Импортируем локально, чтобы избежать циклической зависимости, если getTypeIdByName не экспортируется
    const { getTypeIdByName: getLogicTypeIdByName } = require('./logic/businessLogic');
    return getLogicTypeIdByName(typeName);
}

// --- Функции для работы с бизнесами ---
function getUserBusinesses(userId) {
  const stmt = db.prepare('SELECT * FROM empire_businesses WHERE owner_id = ? ORDER BY id');
  return stmt.all(userId.toString());
}

function updateAccumulatedImp(businessId, newAmount) {
  const stmt = db.prepare('UPDATE empire_businesses SET imp_accumulated = ? WHERE id = ?');
  stmt.run(newAmount, businessId);
}

function updateBusinessWear(businessId, newWear) {
  const stmt = db.prepare('UPDATE empire_businesses SET wear_percentage = ? WHERE id = ?');
  stmt.run(newWear, businessId);
}

function getBusinessById(businessId) {
  const stmt = db.prepare('SELECT * FROM empire_businesses WHERE id = ?');
  return stmt.get(businessId);
}

function hasBusinessOfType(userId, businessTypeName) {
    const stmt = db.prepare('SELECT id FROM empire_businesses WHERE owner_id = ? AND type = ? LIMIT 1');
    const existing = stmt.get(userId.toString(), businessTypeName);
    return existing !== undefined;
}

// --- Функции для работы с IMP (баланс в основной таблице users) ---
function getEmpireBalance(userId) {
  const stmt = db.prepare('SELECT empire_imp_balance FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.empire_imp_balance || 0;
}

function updateEmpireBalance(userId, amountChange) {
  const currentBalance = getEmpireBalance(userId);
  const newBalance = Math.max(0, currentBalance + amountChange); // Не может быть меньше 0
  const stmt = db.prepare('UPDATE users SET empire_imp_balance = ? WHERE id = ?');
  const info = stmt.run(newBalance, userId.toString());
  return info.changes > 0;
}

function addEmpireImpSpent(userId, amount) {
  const stmt = db.prepare('UPDATE users SET empire_total_imp_spent = empire_total_imp_spent + ? WHERE id = ?');
  stmt.run(amount, userId.toString());
}

function addEmpireImpGenerated(userId, amount) {
  const stmt = db.prepare('UPDATE users SET empire_total_imp_generated = empire_total_imp_generated + ? WHERE id = ?');
  stmt.run(amount, userId.toString());
}

// --- Функции для работы с атаками ---
function recordAttack(attackerId, defenderId, businessId, result, stolenImp = 0) {
  const stmt = db.prepare(`
    INSERT INTO empire_attacks (attacker_id, defender_id, business_id, result, stolen_imp)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(attackerId.toString(), defenderId.toString(), businessId, result, stolenImp);
}

// --- Функции для работы с кланами (если сразу) ---
// function getOrCreateClan(clanName, leaderId) { ... }
// function addMemberToClan(userId, clanId) { ... }
// function getClanMembers(clanId) { ... }

// Экспортируем нужные функции
module.exports = {
  createBusiness,
  getUserBusinesses,
  updateAccumulatedImp,
  updateBusinessWear,
  getBusinessById,
  getEmpireBalance,
  updateEmpireBalance,
  addEmpireImpSpent,
  addEmpireImpGenerated,
  // getOrCreateClan,
  // addMemberToClan,
  // getClanMembers,
  recordAttack,
  hasBusinessOfType, // Экспортируем функцию
  upgradeBusinessLevel, // Экспортируем новую функцию
  // getTypeIdByName, // Не экспортируем вспомогательную функцию, если она нужна только внутри
  // ... другие функции ...
};
