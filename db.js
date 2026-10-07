//db.js
const sqlite3 = require('better-sqlite3');
const path = require('path');


// Путь к базе данных
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3(dbPath);

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,                  -- Уникальный ID пользователя (Telegram ID)
      numeric_id INTEGER UNIQUE,            -- Числовой ID пользователя
      username TEXT NOT NULL,               -- Имя пользователя (ограничено 16 символами)
      balance INTEGER DEFAULT 0,            -- Баланс в PF
      df_balance INTEGER DEFAULT 0,         -- Баланс в DF
      npf_shares INTEGER DEFAULT 0,         -- Количество акций NPF
      container_type_1 INTEGER DEFAULT 0,   -- Количество первого типа контейнеров
      container_type_2 INTEGER DEFAULT 0,   -- Количество второго типа контейнеров
      container_type_3 INTEGER DEFAULT 0,   -- Количество третьего типа контейнеров
      card_balance INTEGER DEFAULT 0,       -- Новый баланс карты
      last_bonus_time INTEGER DEFAULT 0,    -- Время последнего получения бонуса
      referrer_id TEXT DEFAULT NULL,        -- ID реферера
      registration_date INTEGER DEFAULT (strftime('%s', 'now')), -- Дата регистрации пользователя
      total_donated_stars INTEGER DEFAULT 0, -- Общее количество полученных звезд
      donations_history TEXT DEFAULT '[]',   -- История донатов (JSON массив)
      form_ids TEXT DEFAULT '[]',           -- Список активных form_ids (JSON массив)
      status_ids TEXT DEFAULT '[]',         -- Массив ID статусов пользователя (JSON массив)
      double_wins INTEGER DEFAULT 0,        -- Количество выигранных раундов
      double_losses INTEGER DEFAULT 0,      -- Количество проигранных раундов
      double_total_bets INTEGER DEFAULT 0,  -- Общее количество ставок
      double_total_winnings INTEGER DEFAULT 0, -- Общая сумма выигрышей
      double_total_losses INTEGER DEFAULT 0,  -- Общая сумма проигрышей
      round_wins INTEGER DEFAULT 0, -- Количество выигранных раундов
      round_losses INTEGER DEFAULT 0, -- Количество проигранных раундов
      total_rounds INTEGER DEFAULT 0, -- Общее количество сыгранных раундов
      likes_received INTEGER DEFAULT 0,     -- Количество полученных лайков
      dislikes_received INTEGER DEFAULT 0,  -- Количество полученных дизлайков
      card_number TEXT UNIQUE,              -- Уникальный 16-значный номер карты
      selected_skin_id INTEGER DEFAULT 0,    -- ID активного скина
      active_prefix_id INTEGER DEFAULT NULL, -- активный префикс
      prefix_ids TEXT DEFAULT '[]',          -- префиксы игрока
      notifications_enabled INTEGER DEFAULT 1,  --уведы
      disable_hyperlink INTEGER DEFAULT 0,
      referral_join_date INTEGER DEFAULT 0,
      referral_bonus_amount INTEGER DEFAULT 30000
      
  )
`).run();


// Добавляем новые колонки, если их ещё нет
const newColumns = [
  { name: 'transfers_blocked', type: 'BOOLEAN DEFAULT FALSE' },
  { name: 'is_hidden_in_top', type: 'INTEGER DEFAULT 0' },
  { name: 'special_prefix_ids', type: 'TEXT DEFAULT \'[]\'' },
  { name: 'is_registered', type: 'BOOLEAN DEFAULT FALSE' },
  { name: 'attack_power', type: 'INTEGER DEFAULT 1' },
  { name: 'energy', type: 'INTEGER DEFAULT 0' },
  { name: 'last_energy_restore', type: 'INTEGER DEFAULT 0' },
  { name: 'active_weapon', type: 'TEXT DEFAULT \'fist\'' },
  { name: 'owned_weapons', type: 'TEXT DEFAULT "[]"' },
  { name: 'card_level', type: 'INTEGER DEFAULT 1' },
  { name: 'last_private_bonus_time', type: 'INTEGER DEFAULT 0' },
  { name: 'candy', type: 'INTEGER DEFAULT 0' },
  // --- НОВЫЕ КОЛОНКИ ДЛЯ ИМПЕРИИ ---
  { name: 'empire_imp_balance', type: 'REAL DEFAULT 0' }, // Баланс IMP пользователя
  { name: 'empire_total_business_level', type: 'INTEGER DEFAULT 0' }, // Суммарный уровень бизнесов
  { name: 'empire_total_imp_generated', type: 'REAL DEFAULT 0' }, // Всего сгенерировано IMP
  { name: 'empire_total_imp_spent', type: 'REAL DEFAULT 0' }, // Всего потрачено IMP
  { name: 'empire_clan_id', type: 'INTEGER DEFAULT NULL' }, // ID клана (если будет)
  { name: 'empire_is_hidden', type: 'INTEGER DEFAULT 0' }, // Скрыть ли из топа империй
  { name: 'tickets', type: 'INTEGER DEFAULT 0' },  
  { name: 'secret_gifts', type: 'INTEGER DEFAULT 0' },
  
  { name: 'last_message_ts', type: 'INTEGER DEFAULT 0' }, // Время (мс) последнего сообщения в боте
  { name: 'last_app_ts', type: 'INTEGER DEFAULT 0' }, // Время (мс) последнего пинга из Mini App
  { name: 'total_messages', type: 'INTEGER DEFAULT 0' }, // Счётчик сообщений за всё время
  { name: 'game_wins', type: 'INTEGER DEFAULT 0' },
  { name: 'max_win_amount', type: 'INTEGER DEFAULT 0' },
  { name: 'max_bet_amount', type: 'INTEGER DEFAULT 0' },
  { name: 'multiplier_stats', type: "TEXT DEFAULT '{}'" },
  { name: 'current_win_streak', type: 'INTEGER DEFAULT 0' },
  { name: 'best_win_streak', type: 'INTEGER DEFAULT 0' },
  // { name: '', type: '' },
  // { name: '', type: '' }
];

try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();

  newColumns.forEach(column => {
      const columnExists = tableInfo.some(col => col.name === column.name);

      if (!columnExists) {
          db.prepare(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`).run();
          console.log(`Колонка '${column.name}' успешно добавлена.`);
      } else {
      }
  });
} catch (error) {
  console.error("Ошибка при добавлении колонок:", error);
}
// ========== МИГРАЦИИ: БАНК РЕФЕРОВОДА И БИЛЕТИКИ ФОРТУНЫ ==========
try {
  db.exec(`ALTER TABLE users ADD COLUMN referrer_bank REAL DEFAULT 0`);
  console.log('[DB] Migration: added column referrer_bank');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration referrer_bank:', e.message);
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN fortune_tickets INTEGER DEFAULT 0`);
  console.log('[DB] Migration: added column fortune_tickets');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration fortune_tickets:', e.message);
}

// ========== МИГРАЦИИ: ПАРТНЕРСКАЯ СИСТЕМА ==========
try {
  db.exec(`ALTER TABLE promos ADD COLUMN creator_id TEXT DEFAULT NULL`);
  console.log('[DB] Migration: added column creator_id to promos');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration creator_id:', e.message);
}

try {
  db.exec(`ALTER TABLE promos ADD COLUMN audience_type TEXT DEFAULT 'all'`);
  console.log('[DB] Migration: added column audience_type to promos');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration audience_type:', e.message);
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS partner_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prize_type TEXT NOT NULL,
    prize_amount INTEGER NOT NULL,
    audience_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    admin_message_id INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`).run();
// ========== КОНЕЦ МИГРАЦИЙ ПАРТНЕРСКОЙ СИСТЕМЫ ==========


// ========== МИГРАЦИИ: ШАБЛОН ПРОМОКОДА ==========
try {
  db.exec(`ALTER TABLE promos ADD COLUMN template TEXT DEFAULT 'normal'`);
  console.log('[DB] Migration: added column template to promos');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration template:', e.message);
}

try {
  db.exec(`ALTER TABLE partner_requests ADD COLUMN template TEXT DEFAULT 'normal'`);
  console.log('[DB] Migration: added column template to partner_requests');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration template:', e.message);
}
// ========== КОНЕЦ МИГРАЦИЙ ШАБЛОНА ==========
try {
  db.exec(`ALTER TABLE partner_requests ADD COLUMN request_type TEXT DEFAULT 'promo'`);
  console.log('[DB] Migration: added column request_type to partner_requests');
} catch (e) {
  if (!e.message.includes('duplicate column')) console.error('[DB] Migration request_type:', e.message);
}

// Сброс индивидуальных referral_bonus_amount — всем одинаковый из конфига
try {
  const { REFERRAL_BONUS_REFERRER_PF } = require('./config');
  db.prepare('UPDATE users SET referral_bonus_amount = ?').run(REFERRAL_BONUS_REFERRER_PF);
  console.log(`[DB] Migration: reset all referral_bonus_amount to ${REFERRAL_BONUS_REFERRER_PF}`);
} catch (e) {
  console.error('[DB] Migration reset referral_bonus_amount:', e.message);
}
// ========== КОНЕЦ МИГРАЦИЙ ==========

// Функция для обновления ника пользователя
function updateUsername(userId, newUsername) {
  try {
    const processedUsername = processUsername(newUsername); // Обработка имени пользователя
    const stmt = db.prepare('UPDATE users SET username = ? WHERE id = ?');
    const info = stmt.run(processedUsername, userId.toString());
    if (info.changes > 0) {
      console.log(`[DEBUG] Ник пользователя ${userId} успешно обновлен на "${processedUsername}"`);
      return { success: true };
    } else {
      console.error(`[DEBUG] Не удалось обновить ник пользователя ${userId}`);
      return { success: false, message: 'Пользователь не найден.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при обновлении ника пользователя:', error);
    return { success: false, message: 'Произошла ошибка при обновлении ника.' };
  }
}

// Функция для полного удаления аккаунта пользователя
function deleteUserAccount(userId) {
  try {
    // Начинаем транзакцию
    db.exec('BEGIN TRANSACTION;');

    // Удаляем связанные записи из всех таблиц
    db.prepare('DELETE FROM blacklist WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM mutes WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM promo_activations WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM dice_bets WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM reports WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM double_bets WHERE user_id = ?').run(userId.toString()); // Добавлена
    db.prepare('DELETE FROM user_skins WHERE user_id = ?').run(userId.toString()); // Добавлена
    db.prepare('DELETE FROM bet_history WHERE user_id = ?').run(userId.toString()); // Добавлена

    // Удаляем пользователя из таблицы users
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const info = stmt.run(userId.toString());

    // Завершаем транзакцию
    db.exec('COMMIT;');

    if (info.changes > 0) {
      return { success: true };
    } else {
      return { success: false, message: 'Пользователь не найден.' };
    }
  } catch (error) {
    // Откатываем транзакцию в случае ошибки
    db.exec('ROLLBACK;');
    console.error('Ошибка при удалении аккаунта:', error);
    return { success: false, message: 'Произошла ошибка при удалении аккаунта.' };
  }
}

// Функция для переключения состояния гиперссылки
function toggleHyperlink(userId) {
  const stmt = db.prepare('UPDATE users SET disable_hyperlink = NOT disable_hyperlink WHERE id = ?');
  const info = stmt.run(userId.toString());
  return info.changes > 0; // Возвращаем true, если обновление успешно
}

// Функция для проверки состояния гиперссылки
function isHyperlinkDisabled(userId) {
  const stmt = db.prepare('SELECT disable_hyperlink FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return !!result?.disable_hyperlink; // Возвращаем true, если гиперссылка выключена
}

// Функция для обновления numeric_id пользователя
function updateNumericId(oldNumericId, newNumericId) {
  try {
    // Проверяем, существует ли пользователь с oldNumericId
    const user = db.prepare('SELECT id FROM users WHERE numeric_id = ?').get(oldNumericId);
    if (!user) {
      return { success: false, message: 'Пользователь с указанным старым numeric_id не найден.' };
    }

    // Проверяем, свободен ли новый numeric_id
    const isNumericIdTaken = db.prepare('SELECT id FROM users WHERE numeric_id = ?').get(newNumericId);
    if (isNumericIdTaken) {
      return { success: false, message: 'Новый numeric_id уже занят.' };
    }

    // Начинаем транзакцию
    db.exec('BEGIN TRANSACTION;');

    // Обновляем numeric_id пользователя
    db.prepare('UPDATE users SET numeric_id = ? WHERE numeric_id = ?').run(newNumericId, oldNumericId);

    // Обновляем numeric_id в связанных таблицах
    db.prepare('UPDATE mutes SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId);
    db.prepare('UPDATE promo_activations SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId);
    db.prepare('UPDATE dice_bets SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId);
    db.prepare('UPDATE double_bets SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId); // Добавлена
    db.prepare('UPDATE reports SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId); // Добавлена
    db.prepare('UPDATE bet_history SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId); // Добавлена
    db.prepare('UPDATE blacklist SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId); // Добавлена
    db.prepare('UPDATE user_weapon_durability SET user_id = ? WHERE user_id = ?').run(newNumericId, oldNumericId); // Прочность оружия
    // Завершаем транзакцию
    db.exec('COMMIT;');

    return { success: true };
  } catch (error) {
    // Откатываем транзакцию в случае ошибки
    db.exec('ROLLBACK;');
    console.error('Ошибка при обновлении numeric_id:', error);
    return { success: false, message: 'Произошла ошибка при обновлении numeric_id.' };
  }
}

// Функция для получения данных пользователя по Telegram ID
function getUserById(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(userId.toString());
}


// Функция для получения данных карты пользователя
function getCardDetails(userId) {
  const stmt = db.prepare('SELECT card_number FROM users WHERE id = ?');
  return stmt.get(userId.toString());
}

// Функция для сохранения номера карты пользователя
function saveCardNumber(userId, cardNumber) {
  const stmt = db.prepare(`
    UPDATE users SET card_number = ? WHERE id = ?
  `);
  stmt.run(cardNumber, userId.toString());
}

// Функция для проверки уникальности номера карты
function isCardNumberUnique(cardNumber) {
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM users WHERE card_number = ?');
  const result = stmt.get(cardNumber);
  return result.count === 0;
}

// Функция для получения ID активного скина пользователя
function getSelectedSkin(userId) {
  const stmt = db.prepare('SELECT selected_skin_id FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.selected_skin_id || null;
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS prefixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID префикса
    prefix TEXT NOT NULL                  -- Сам префикс (например, "VIP", "PRO")
  )
`).run();

// Создание таблицы special_prefixes
db.prepare(`
  CREATE TABLE IF NOT EXISTS special_prefixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prefix TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL, -- ID создателя (тех админа)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
  `).run();
  
  // Установка начального значения для автоинкремента
  db.prepare(`
  INSERT OR IGNORE INTO sqlite_sequence (name, seq)
  VALUES ('special_prefixes', 999)
  `).run();

// Добавляем префиксы в базу данных
insertPrefixIfNotExists('[👑 DOUBLE KING]');
insertPrefixIfNotExists('[🃏 DOUBLE WINNER]');
insertPrefixIfNotExists('[🦠 404 NOT FOUND]');
insertPrefixIfNotExists('💲 All-In And Lost');
insertPrefixIfNotExists('🎲 Dice God');
insertPrefixIfNotExists('💀 Broke But Happy');
insertPrefixIfNotExists('🌍 Wi-Fi Hunter');
insertPrefixIfNotExists('🤖 Bot Overlord');
insertPrefixIfNotExists('💻 Ctrl+Alt+Del');
insertPrefixIfNotExists('🎯 Risk Taker');
insertPrefixIfNotExists('🔥 High Roller');
insertPrefixIfNotExists('🃏 Card Shark');
insertPrefixIfNotExists('💰 Jackpot Hunter');
insertPrefixIfNotExists('🎰 Slot Machine Addict');
insertPrefixIfNotExists('📡 Signal Booster');
insertPrefixIfNotExists('💾 Floppy Disk Fanatic');
insertPrefixIfNotExists('🔗 URL Wizard');
insertPrefixIfNotExists('😂 Meme Machine');
insertPrefixIfNotExists('😎 Cool Story Bro');
insertPrefixIfNotExists('🤪 Chaos Creator');
insertPrefixIfNotExists('🎉 Party Starter');
insertPrefixIfNotExists('✨ Unicorn Whisperer');
insertPrefixIfNotExists('🤯 Mind Blown');
insertPrefixIfNotExists('📱 Smartphone Zombie');
insertPrefixIfNotExists('🖱 Clickbait Victim');
insertPrefixIfNotExists('🎧 Music Streamer');
insertPrefixIfNotExists('🚀 Speedrunner');
insertPrefixIfNotExists('🦊 Fox Whisperer');
insertPrefixIfNotExists('🐧 Penguin Prince');
insertPrefixIfNotExists('🦿 Sloth Life');
insertPrefixIfNotExists('🍞 Bread Lover');
insertPrefixIfNotExists('💩 Poop Expert');
insertPrefixIfNotExists('🎨 Art Lover');
insertPrefixIfNotExists('📚 Bookworm');
insertPrefixIfNotExists('🎵 Music Maniac');
insertPrefixIfNotExists('👾 Pixel Invader');
insertPrefixIfNotExists('⚡️ Lag Slayer');
insertPrefixIfNotExists('🦠 Error404');
insertPrefixIfNotExists('💅 Пикми');
insertPrefixIfNotExists('👨‍🦱 Сигмабой');
insertPrefixIfNotExists('🎲 Lucky Roller');
insertPrefixIfNotExists('💳 Card Shark');
insertPrefixIfNotExists('🍀 FOTRUNA 🃏');
insertPrefixIfNotExists('🎄 SNOWMAN 🎄');


// Функция для получения списка префиксов пользователя
function listUserPrefixes(userId) {
  const stmt = db.prepare(`
    SELECT p.id, p.prefix AS name
    FROM prefixes p
    JOIN users u ON JSON_ARRAY_CONTAINS(u.prefix_ids, p.id)
    WHERE u.id = ?
  `);
  return stmt.all(userId.toString());
}

function insertPrefixIfNotExists(prefix) {
  const stmt = db.prepare('SELECT * FROM prefixes WHERE prefix = ?');
  const existingPrefix = stmt.get(prefix);

  if (!existingPrefix) {
    const insertStmt = db.prepare('INSERT INTO prefixes (prefix) VALUES (?)');
    insertStmt.run(prefix);
    console.log(`Префикс "${prefix}" успешно добавлен.`);
  } else {
  }
}

function getAllPrefixes() {
  const stmt = db.prepare('SELECT * FROM prefixes');
  return stmt.all();
}

function addPrefixToUser(userId, prefixId) {
  const userStmt = db.prepare('SELECT prefix_ids FROM users WHERE id = ?');
  const user = userStmt.get(userId);

  if (!user) {
    console.error(`Пользователь с ID ${userId} не найден.`);
    return false;
  }

  let prefixIds = JSON.parse(user.prefix_ids || '[]');
  if (!prefixIds.includes(prefixId)) {
    prefixIds.push(prefixId);
    const updateStmt = db.prepare('UPDATE users SET prefix_ids = ? WHERE id = ?');
    updateStmt.run(JSON.stringify(prefixIds), userId);
    console.log(`Префикс с ID ${prefixId} успешно добавлен пользователю ${userId}.`);
    return true;
  } else {
    console.log(`Префикс с ID ${prefixId} уже добавлен пользователю ${userId}.`);
    return false;
  }
}

function removePrefixFromUser(userId, prefixId) {
  const userStmt = db.prepare('SELECT prefix_ids FROM users WHERE id = ?');
  const user = userStmt.get(userId);

  if (!user) {
    console.error(`Пользователь с ID ${userId} не найден.`);
    return false;
  }

  let prefixIds = JSON.parse(user.prefix_ids || '[]');
  if (prefixIds.includes(prefixId)) {
    prefixIds = prefixIds.filter(id => id !== prefixId);
    const updateStmt = db.prepare('UPDATE users SET prefix_ids = ? WHERE id = ?');
    updateStmt.run(JSON.stringify(prefixIds), userId);
    console.log(`Префикс с ID ${prefixId} успешно удален у пользователя ${userId}.`);
    return true;
  } else {
    console.log(`Префикс с ID ${prefixId} не найден у пользователя ${userId}.`);
    return false;
  }
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS skins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,               -- Название скина
    file_name TEXT NOT NULL,          -- Имя файла изображения
    price INTEGER NOT NULL,           -- Цена скина
    currency_type TEXT NOT NULL,      -- Тип валюты (PF или DF)
    rarity TEXT NOT NULL,             -- Редкость скина
    glow_id INTEGER,                  -- ID для вариации скина со свечением
    glow_file_name TEXT,              -- Имя файла для вариации скина со свечением
    stock INTEGER DEFAULT 0,           -- Количество штук
    max_stock INTEGER DEFAULT 0,       -- Максимальное количество скинов
    total_serials INTEGER DEFAULT 0,   -- Серийный номер скина
    is_visible_in_shop INTEGER DEFAULT 1  -- Отображается ли скин в магазине
  )
`).run();

// Добавляем новую таблицу для хранения данных о владении скинами
db.prepare(`CREATE TABLE IF NOT EXISTS user_skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID записи
  user_id TEXT NOT NULL,                -- ID пользователя
  skin_id INTEGER NOT NULL,             -- ID скина
  serial_number TEXT NOT NULL UNIQUE    -- Серийный номер скина
)`).run();

// Функция для генерации серийного номера
function generateSerialNumber(skinId, totalSerials) {
  const prefix = skinId.toString().padStart(4, '0');
  const serial = (totalSerials + 1).toString().padStart(8, '0');
  return `${prefix}-${serial}`;
}

// Новая функция получения скинов пользователя
function getUserSkinsWithSerials(userId) {
  const stmt = db.prepare(`
      SELECT us.serial_number, s.* 
      FROM user_skins us
      JOIN skins s ON us.skin_id = s.id
      WHERE us.user_id = ?
  `);
  return stmt.all(userId.toString());
}

// Функция для добавления скина пользователю с проверкой наличия
async function addSkinToUser(userId, skinId) {
  try {
    // Проверяем, есть ли у пользователя этот скин
    const userHasSkin = getUserAvailableSkins(userId.toString()).includes(skinId);

    if (userHasSkin) {
      // Скин уже есть у пользователя — не добавляем его
      return { success: false, message: 'Скин уже принадлежит пользователю', alreadyOwned: true };
    }

    // Получаем текущее количество серийных номеров для этого скина
    const skinStmt = db.prepare('SELECT total_serials FROM skins WHERE id = ?');
    const skinResult = skinStmt.get(skinId);
    if (!skinResult) {
      return { success: false, message: 'Скин не найден.' };
    }

    // Генерируем новый серийный номер
    const newSerialNumber = generateSerialNumber(skinId, skinResult.total_serials);

    // Добавляем запись в таблицу user_skins
    const insertStmt = db.prepare(`
      INSERT INTO user_skins (user_id, skin_id, serial_number)
      VALUES (?, ?, ?)
    `);
    const info = insertStmt.run(userId.toString(), skinId, newSerialNumber);

    if (info.changes > 0) {
      // Увеличиваем счетчик серийных номеров для скина
      const updateSkinStmt = db.prepare('UPDATE skins SET total_serials = total_serials + 1 WHERE id = ?');
      updateSkinStmt.run(skinId);

      return { success: true, message: 'Скин успешно добавлен.', serial: newSerialNumber };
    } else {
      return { success: false, message: 'Не удалось добавить скин.' };
    }
  } catch (error) {
    console.error('Ошибка при добавлении скина:', error);
    return { success: false, message: 'Произошла ошибка при добавлении скина.' };
  }
}

// Функция для получения шаблона карты по ID
function getCardTemplateById(skinId) {
  const stmt = db.prepare('SELECT file_name FROM skins WHERE id = ?');
  return stmt.get(skinId);
}

// Функция для получения всех доступных скинов
function getAllSkins(filterVisibleOnly = false) {
  let query = `
    SELECT * FROM skins
    ORDER BY CASE WHEN stock > 0 THEN 0 ELSE 1 END, id
  `;
  if (filterVisibleOnly) {
    query = `SELECT * FROM skins WHERE is_visible_in_shop = 1 ORDER BY CASE WHEN stock > 0 THEN 0 ELSE 1 END, id`;
  }
  const stmt = db.prepare(query);
  return stmt.all();
}

function insertSkinIfNotExists(name, file_name, price, currency_type, rarity, glow_id = null, glow_file_name = null, stock = 0, isVisibleInShop = 1) {
  const stmt = db.prepare('SELECT * FROM skins WHERE name = ? AND file_name = ?');
  const existingSkin = stmt.get(name, file_name);
  if (!existingSkin) {
    const insertStmt = db.prepare(`
      INSERT INTO skins (name, file_name, price, currency_type, rarity, glow_id, glow_file_name, stock, max_stock, total_serials, is_visible_in_shop)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    insertStmt.run(name, file_name, price, currency_type, rarity, glow_id, glow_file_name, stock, stock, isVisibleInShop);
    console.log(`Скин "${name}" успешно добавлен.`);
  } else {

  }
}



// ORDINARY (Обычные) — видны в магазине
insertSkinIfNotExists('Голубая тян', 'blue_t.png', 15000, 'PF', 'ORDINARY', null, null, 350, 1);
insertSkinIfNotExists('Red тян', 'map_chan_red.jpg', 0, 'PF', 'ORDINARY', null, null, 999999, 0);
insertSkinIfNotExists('Паук', 'map_chan_spider.jpg', 0, 'PF', 'ORDINARY', null, null, 999999, 0);
insertSkinIfNotExists('Восточный домик', 'river.png', 42000, 'PF', 'ORDINARY', null, null, 100, 1);
insertSkinIfNotExists('Blue eyes', 'white_tian.png', 200, 'DF', 'ORDINARY', null, null, 100, 1);

// EPIC (Эпические) — видны в магазине
insertSkinIfNotExists('Кошка-девочка', 'map_chan_cat.jpg', 0, 'PF', 'EPIC', null, null, 999999, 0);
insertSkinIfNotExists('TOKYO', 'map_chan_nissan_tokyo.png', 100000, 'PF', 'EPIC', null, null, 100, 1);
insertSkinIfNotExists('Кот и майнкрафт', 'map_cat.png', 100, 'DF', 'EPIC', null, null, 70, 1);
insertSkinIfNotExists('Black card', 'default_black_card.png', 125000, 'PF', 'EPIC', null, null, 100, 1);
insertSkinIfNotExists('Style', 'map_slobber.jpg', 75000, 'PF', 'EPIC', null, null, 30, 1);

// LEGENDARY (Легендарные) — видны в магазине
insertSkinIfNotExists('Чилловый парень', 'map_chilldog.jpg', 990, 'DF', 'LEGENDARY', null, null, 30, 1);
insertSkinIfNotExists('Sakura Drift', 'tokio_car.jpg', 777, 'DF', 'LEGENDARY', null, null, 50, 1);
insertSkinIfNotExists('КЧАУ', 'map_kchau.jpg', 250000, 'PF', 'LEGENDARY', null, null, 20, 1);
insertSkinIfNotExists('Фиолетовая карта', 'purple.jpg', 100000, 'PF', 'LEGENDARY', null, null, 100, 1);
insertSkinIfNotExists('Ху тао', 'map_chan_tokyo.png', 50000, 'PF', 'LEGENDARY', null, null, 100, 1);

// EXCLUSIVE (Эксклюзивные) — НЕ видны в магазине
insertSkinIfNotExists('Admin тян card', 'map_admin.png', 0, 'PF', 'EXCLUSIVE', null, null, 9999999, 0);
insertSkinIfNotExists('DIAMOND CARD', 'map_diamond.png', 0, 'PF', 'EXCLUSIVE', null, null, 9999999, 0);
insertSkinIfNotExists('GOLD CARD', 'map_gold.png', 0, 'DF', 'EXCLUSIVE', null, null, 9999999, 0);
insertSkinIfNotExists('PLATINUM CARD', 'map_platinum.png', 0, 'DF', 'EXCLUSIVE', null, null, 9999999, 0);


//личные
insertSkinIfNotExists('Love-Girl', 'girl.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('F_bot_msk', 'f_bot_msk.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('HolyKarim', 'РАЗДАЧИ.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Сочная тян', 'juicy_tjan.png', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('xxxl woman', 'xxxl_woman.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Кай', 'kai.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Лабубу', 'labubu.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Булкин', 'bulkin.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Тыквенный спас', 'pumpkin.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);
insertSkinIfNotExists('Рождество', 'merry_christmas.jpg', 0, 'DF', 'EXCLUSIVE+', null, null, 9999999, 0);


// async function updateSkinFileNames() {
//   const db = new sqlite3('./database.sqlite');

//   try {
//     // Начинаем транзакцию
//     db.exec('BEGIN TRANSACTION;');

//     // Список скинов с новыми именами файлов
//     const skinUpdates = [
//       { oldFileName: 'ФРОНТМЕН.jpg', newFileName: 'frontmen.jpg' },
//       { oldFileName: 'ОХРАННИК_КВАДРАТ.jpg', newFileName: 'guard_square.jpg' },
//       { oldFileName: 'ОХРАННИК_ТРЕУГОЛЬНИК.jpg', newFileName: 'guard_triangle.jpg' },
//       { oldFileName: 'ОХРАННИК_КРУГ.jpg', newFileName: 'guard_circle.jpg' },
//       { oldFileName: '456.jpg', newFileName: 'player_456.jpg' },
//     ];

//     for (const { oldFileName, newFileName } of skinUpdates) {
//       const getSkinIdStmt = db.prepare('SELECT id FROM skins WHERE file_name = ?');
//       const skinResult = getSkinIdStmt.get(oldFileName);

//       if (!skinResult) {
//         console.error(`Скин с именем "${oldFileName}" не найден.`);
//         continue;
//       }

//       const updateFileNameStmt = db.prepare('UPDATE skins SET file_name = ? WHERE id = ?');
//       const updateResult = updateFileNameStmt.run(newFileName, skinResult.id);

//       if (updateResult.changes > 0) {
//         console.log(`Имя файла скина "${oldFileName}" успешно обновлено на "${newFileName}".`);
//       } else {
//         console.error(`Не удалось обновить имя файла скина "${oldFileName}".`);
//       }
//     }

//     // Фиксируем транзакцию
//     db.exec('COMMIT;');
//     console.log('Обновление имён файлов завершено.');
//   } catch (error) {
//     // Откатываем транзакцию в случае ошибки
//     db.exec('ROLLBACK;');
//     console.error('Ошибка при обновлении имён файлов:', error);
//   } finally {
//     // Закрываем соединение с базой данных
//     db.close();
//   }
// }

// // Вызов функции
// updateSkinFileNames();


// Получение ID скина по названию
function getSkinIdByName(name) {
  const stmt = db.prepare('SELECT id FROM skins WHERE name = ?');
  const result = stmt.get(name);
  return result?.id || null;
}

// Получение скина по ID
function getSkinById(id) {
  const stmt = db.prepare('SELECT * FROM skins WHERE id = ?');
  return stmt.get(id);
}

function updateSkinStock(skinId, newStock) {
  const stmt = db.prepare('UPDATE skins SET stock = ? WHERE id = ?');
  const info = stmt.run(newStock, skinId);
  return info.changes > 0;
}

function getSkinStock(skinId) {
  const stmt = db.prepare('SELECT stock, max_stock FROM skins WHERE id = ?');
  const result = stmt.get(skinId);
  return result ? { stock: result.stock, max_stock: result.max_stock } : { stock: 0, max_stock: 0 };
}

// Получение всех ID скинов
function getAllSkinIds() {
  const stmt = db.prepare('SELECT id FROM skins');
  const rows = stmt.all();
  return rows.map(row => row.id);
}

function getUserAvailableSkins(userId) {
  const stmt = db.prepare(`
      SELECT skin_id 
      FROM user_skins 
      WHERE user_id = ?
  `);
  const result = stmt.all(userId.toString());
  return result.map((row) => row.skin_id);
}


// Функция для получения имени файла активного скина пользователя
function getSelectedSkinFileName(userId) {
  const userStmt = db.prepare('SELECT selected_skin_id FROM users WHERE id = ?');
  const userResult = userStmt.get(userId.toString());

  if (!userResult || !userResult.selected_skin_id) {
      return 'card.jpg'; // Дэфолтный шаблон
  }

  const skinStmt = db.prepare('SELECT file_name FROM skins WHERE id = ?');
  const skinResult = skinStmt.get(userResult.selected_skin_id);

  return skinResult?.file_name || 'card.jpg';
}

// Обновление активного скина пользователя
function updateUserSelectedSkin(userId, skinId) {
  const query = 'UPDATE users SET selected_skin_id = ? WHERE id = ?';
  const result = db.prepare(query).run(skinId, userId.toString());
  return result.changes > 0; // Возвращаем true, если обновление прошло успешно
}

async function getSkinRarity(fileName) {
  const stmt = db.prepare('SELECT rarity FROM skins WHERE file_name = ?');
  const result = stmt.get(fileName);
  return result?.rarity || 'ORDINARY'; // По умолчанию обычная редкость
}



function deductCurrencyFromUser(userId, currencyType, amount) {
  const columnName = currencyType === 'PF' ? 'balance' : 'df_balance';
  const stmt = db.prepare(`UPDATE users SET ${columnName} = ${columnName} - ? WHERE id = ?`);
  const info = stmt.run(amount, userId.toString());
  return info.changes > 0;
}

function getUserBalance(userId, currencyType) {
  const columnName = currencyType === 'PF' ? 'balance' : 'df_balance';
  const stmt = db.prepare(`SELECT ${columnName} AS balance FROM users WHERE id = ?`);
  const result = stmt.get(userId.toString());
  return result ? result.balance : 0;
}


// Создание таблицы chats
db.prepare(`
  CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT PRIMARY KEY,             -- Уникальный ID чата
    is_double_chat INTEGER DEFAULT 0,     -- Флаг активации режима "дабл"
    is_dice_chat INTEGER DEFAULT 0        -- Флаг активации режима "дайс"
  )
`).run();

// Создание таблицы promos
db.prepare(`
  CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,        -- Уникальный ID промокода
    name TEXT UNIQUE NOT NULL,                  -- Название промокода
    activations_left INTEGER NOT NULL,          -- Оставшееся количество активаций
    prize_type TEXT NOT NULL,                  -- Тип приза (например, "balance")
    prize_amount INTEGER NOT NULL,            -- Количество приза
    created_by TEXT NOT NULL,                   -- ID администратора, создавшего промокод
    min_status_id INTEGER NOT NULL DEFAULT 0
  )
`).run();

// Проверка и добавление колонки expires_at для временных промокодов
try {
  const cols = db.prepare("PRAGMA table_info(promos)").all();
  if (!cols.some(c => c.name === 'expires_at')) {
    db.prepare("ALTER TABLE promos ADD COLUMN expires_at INTEGER DEFAULT NULL").run();
    console.log('✅ Колонка expires_at успешно добавлена в таблицу promos');
  } else {
    // Опционально: можно убрать логирование, если колонка уже есть
    // console.log('ℹ️ Колонка expires_at уже существует в таблице promos');
  }
} catch (e) { 
  console.error('❌ Ошибка при проверке/добавлении колонки expires_at:', e); 
}

// Создание таблицы promo_activations
db.prepare(`
  CREATE TABLE IF NOT EXISTS promo_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promo_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    activated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(promo_id) REFERENCES promos(id)
  )
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS blacklist (
  user_id TEXT PRIMARY KEY,         -- Telegram ID забаненного пользователя
  reason TEXT DEFAULT NULL,         -- Причина блокировки
  banned_at INTEGER DEFAULT (strftime('%s', 'now')), -- Время начала бана
  banned_until INTEGER DEFAULT NULL -- Время окончания бана
);
`).run();

// Создание новой таблицы reports с обновленной структурой
db.prepare(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID репорта
    user_id TEXT NOT NULL,               -- Telegram ID пользователя
    username TEXT NOT NULL,              -- Имя пользователя (ограничено 16 символами)
    report_text TEXT NOT NULL,          -- Текст вопроса
    status TEXT DEFAULT 'not_answered', -- Статус: "not_answered" или "answered"
    admin_response TEXT DEFAULT NULL,   -- Ответ администратора
    admin_id TEXT DEFAULT NULL,         -- Telegram ID администратора, ответившего на репорт
    admin_username TEXT DEFAULT NULL,   -- Имя администратора
    created_at INTEGER DEFAULT (strftime('%s', 'now')), -- Время создания репорта
    likes INTEGER DEFAULT 0,            -- Количество лайков
    dislikes INTEGER DEFAULT 0,         -- Количество дизлайков
    user_feedback TEXT DEFAULT NULL     -- Обратная связь пользователя (like/dislike/null)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS dice_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,         -- Уникальный ID раунда
    chat_id TEXT NOT NULL,                       -- ID чата, где проходит раунд
    start_time INTEGER NOT NULL,                -- Время начала раунда
    end_time INTEGER NOT NULL,                  -- Время окончания раунда
    total_bank INTEGER DEFAULT 0,               -- Общий банк раунда
    round_id TEXT NOT NULL UNIQUE               -- Уникальный идентификатор раунда
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS dice_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,       -- Уникальный ID ставки
    round_id TEXT NOT NULL,                     -- ID раунда (связан с round_id в dice_rounds)
    user_id TEXT NOT NULL,                      -- ID пользователя
    username TEXT NOT NULL,                     -- Имя пользователя
    amount INTEGER NOT NULL,                    -- Сумма ставки
    dice1 INTEGER DEFAULT NULL,                 -- Результат первого кубика
    dice2 INTEGER DEFAULT NULL,                 -- Результат второго кубика
    FOREIGN KEY(round_id) REFERENCES dice_rounds(round_id)
  )
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID статуса
  name TEXT UNIQUE NOT NULL,           -- Название статуса (например, "DIAMOND", "PLATINUM")
  priority INTEGER DEFAULT 0            -- Приоритет статуса (чем выше число, тем важнее статус)
);
`).run();


// Создаем таблицу mutes с добавлением chat_id
db.prepare(`
  CREATE TABLE IF NOT EXISTS mutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    muted_until INTEGER,
    reason TEXT,
    UNIQUE(user_id, chat_id)
  )
`).run();



// Функция для получения пользователя по Telegram ID
function getUserById(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(userId.toString());
}

// Функция для получения пользователя по числовому ID
function getUserByNumericId(numericId) {
  const stmt = db.prepare('SELECT * FROM users WHERE numeric_id = ?');
  return stmt.get(numericId);
}

// Функция для получения максимального numeric_id из базы данных
function getMaxNumericId() {
  const result = db.prepare('SELECT MAX(numeric_id) AS max_numeric_id FROM users').get();
  return result?.max_numeric_id || 0; // Возвращаем 0, если таблица пуста
}

// Функция для создания или обновления пользователя с учетом новых полей
function createUserOrUpdate(user) {
  const existingUser = getUserById(user.id);
  // Обработка имени пользователя
  let processedUsername = processUsername(user.first_name);
  if (existingUser) {
    // Если пользователь уже существует, обновляем его данные
    db.prepare('UPDATE users SET username = ?, referrer_id = ?, referral_join_date = ? WHERE id = ?')
      .run(processedUsername, user.referrer_id || null, user.referral_join_date || Math.floor(Date.now() / 1000), user.id);
  } else {
    // Ищем первый доступный numeric_id из списка удалённых пользователей
    const availableNumericId = getFirstAvailableNumericId();
    // Создаём нового пользователя с новыми полями
    db.prepare(
      'INSERT INTO users (id, numeric_id, username, balance, df_balance, npf_shares, container_type_1, container_type_2, container_type_3, card_balance, last_bonus_time, referrer_id, registration_date, referral_join_date, referral_bonus_amount, active_weapon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      user.id, // Telegram ID пользователя
      availableNumericId, // Уникальный числовой ID
      processedUsername, // Имя пользователя
      0, // Баланс в GB (PF)
      0, // Баланс в DF
      0, // Количество акций NPF
      0, // Количество первого типа контейнеров
      0, // Количество второго типа контейнеров
      0, // Количество третьего типа контейнеров
      0, // Новый баланс карты
      0, // Время последнего получения бонуса
      user.referrer_id || null, // Реферальный ID
      Date.now() / 1000, // Дата регистрации (текущее время в Unix-формате)
      user.referral_join_date || Math.floor(Date.now() / 1000), // Дата перехода по реферальной ссылке
      user.referral_bonus_amount || 30000, // Сумма бонуса за реферала
      1 // ID кулака (по умолчанию активное оружие)
    );
  }
}

// Зарезервированные numeric_id, которые нельзя использовать
const RESERVED_NUMERIC_IDS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 33, 42, 44, 52, 55, 69, 77, 88, 99, 100, 666, 777
];

// Функция для получения первого доступного numeric_id
function getFirstAvailableNumericId() {
  // Получаем все numeric_id из базы данных
  const allNumericIds = db.prepare('SELECT numeric_id FROM users').all().map(row => row.numeric_id);

  // Начинаем проверку с 0 и идём до бесконечности
  let candidateId = 0;
  while (true) {
    // Проверяем, что candidateId не занят и не зарезервирован
    if (!allNumericIds.includes(candidateId) && !RESERVED_NUMERIC_IDS.includes(candidateId)) {
      return candidateId; // Возвращаем первый доступный ID
    }
    candidateId++;
  }
}

// Функция для обработки имени пользователя
function processUsername(name) {
  if (!name) {
    return 'Press Эфыч'; // Если имя отсутствует
  }

  // Регулярное выражение для поиска запрещенных символов
  const forbiddenSymbolsRegex = /[\[\]<>@]/g;

  // Удаляем запрещенные символы из имени
  let cleanedName = name.replace(forbiddenSymbolsRegex, '');

  // Запрещенные слова и их производные (в разных регистрах)
  const forbiddenWords = [
    'слава украине',
    'украина',
    'ukraine',
    'україна',
    'slava ukraine',
    'героям слава',
    'glory to ukraine',
    'glory to heroes'
  ];

  // Преобразуем массив запрещенных слов в регулярное выражение (с учетом регистра)
  const forbiddenWordsRegex = new RegExp(
    forbiddenWords.map(word => word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'),
    'gi'
  );

  // Удаляем запрещенные слова
  cleanedName = cleanedName.replace(forbiddenWordsRegex, '');

  // Регулярное выражение для поиска эмодзи флагов (региональные индикаторы)
  const flagEmojiRegex = /\p{RI}\p{RI}/gu;

  // Удаляем эмодзи флагов
  cleanedName = cleanedName.replace(flagEmojiRegex, '');

  // Ограничиваем длину до 16 символов (с сохранением эмодзи)
  return cleanedName.slice(0, 16).trim() || 'Press Эфыч';
}

// Функция для обновления баланса по Telegram ID с динамическим лимитом
function updateUserBalance(userId, balanceChange) {
  try {
    // 1. Получаем пользователя
    const user = getUserById(userId);

    if (user) {
      // 2. Получаем уровень карты пользователя для определения лимита основного баланса
      // Предполагается, что функция getCardLevel доступна
      const userCardLevel = getCardLevel(userId); 

      // 3. Определяем лимит основного баланса на основе уровня карты
      let mainBalanceLimit = 140000000; // Базовый лимит
      if (userCardLevel >= 10) mainBalanceLimit = 175000000; // Уровень 10
      if (userCardLevel >= 15) mainBalanceLimit = 185000000; // Уровень 15
      if (userCardLevel >= 20) mainBalanceLimit = 200000000; // Уровень 20

      // 4. Рассчитываем новый баланс
      const newBalanceRaw = user.balance + balanceChange;

      // 5. Проверяем, что новый баланс не станет меньше нуля
      if (newBalanceRaw < 0) {
        throw new Error("Недостаточно средств для выполнения операции.");
      }

      // 6. Применяем лимит
      const newBalance = Math.min(mainBalanceLimit, newBalanceRaw);

      // 7. Обновляем баланс в БД
      const stmt = db.prepare('UPDATE users SET balance = ? WHERE id = ?');
      stmt.run(newBalance, userId.toString());

    } else {
      // 8. Если пользователя нет, создаём нового только при положительном изменении баланса
      if (balanceChange < 0) {
        throw new Error("Нельзя создать пользователя с отрицательным балансом.");
      }

      // 9. При создании нового пользователя учитываем лимит (для consistency, хотя он новый)
      // Новый пользователь начинает с уровня 1, поэтому базовый лимит 140M
      const initialBalance = Math.min(balanceChange, 140000000);

      db.prepare('INSERT INTO users (id, username, balance, last_bonus_time) VALUES (?, ?, ?, ?)').run(
        userId.toString(),
        'Press Эфыч', // Или используйте processUsername, если он импортирован
        initialBalance,
        Date.now()
      );
    }
  } catch (error) {
    // 10. Логируем ошибку и пробрасываем её
    console.error('[DB] Ошибка при обновлении баланса пользователя:', error);
    // Важно: функция updateUserBalance в вашем коде выбрасывает ошибки, а не возвращает true/false
    // Поэтому мы пробрасываем ошибку, как и раньше.
    throw error; 
  }
}


// Обновление статистики после раунда
function updateDoubleStatistics(userId, bets) {
  const totalBets = bets.length;
  let totalWins = 0;
  let totalLosses = 0;
  let totalWinnings = 0;
  let totalLossesAmount = 0;

  bets.forEach(bet => {
    if (bet.isWin) {
      totalWins++;
      totalWinnings += bet.winAmount;
    } else {
      totalLosses++;
      totalLossesAmount += bet.amount;
    }
  });

  const stmt = db.prepare(`
    UPDATE users
    SET 
      double_total_bets = double_total_bets + ?,
      double_total_winnings = double_total_winnings + ?,
      double_total_losses = double_total_losses + ?,
      double_wins = double_wins + ?,
      double_losses = double_losses + ?
    WHERE id = ?
  `);

  stmt.run(totalBets, totalWinnings, totalLossesAmount, totalWins, totalLosses, userId.toString());
}

// Обновление статистики раундов
function updateRoundStatistics(userId, stats) {
  const stmt = db.prepare(`
      UPDATE users 
      SET 
          total_rounds = total_rounds + ?,
          round_wins = round_wins + ?,
          round_losses = round_losses + ?,
          double_total_bets = double_total_bets + ?,
          double_wins = double_wins + ?,
          double_losses = double_losses + ?,
          double_total_winnings = double_total_winnings + ?,
          double_total_losses = double_total_losses + ?
      WHERE id = ?
  `);

  stmt.run(
      stats.totalRounds || 0,
      stats.roundWins || 0,
      stats.roundLosses || 0,
      stats.doubleTotalBets || 0,
      stats.doubleWins || 0,
      stats.doubleLosses || 0,
      stats.doubleTotalWinnings || 0,
      stats.doubleTotalLosses || 0,
      userId.toString()
  );
}

// Запись детальной статистики по каждой ставке
function saveBetDetails(userId, bets) {
  const stmt = db.prepare(`
    INSERT INTO bet_history (
      user_id, round_hash, multiplier, amount, is_win, win_amount, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  // Проверяем, является ли входной параметр массивом
  if (!Array.isArray(bets)) {
    console.error('Ошибка: передан некорректный формат данных в saveBetDetails');
    return;
  }
  bets.forEach(bet => {
    stmt.run(
      userId.toString(),
      bet.roundHash,
      bet.multiplier,
      bet.amount,
      bet.isWin ? 1 : 0,
      bet.winAmount || 0,
      Date.now()
    );
  });
}

// Получение детальной статистики игрока
function getDetailedStats(userId) {
  const statsStmt = db.prepare(`
    SELECT 
      SUM(amount) AS total_bet_amount,
      SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) AS total_wins,
      SUM(CASE WHEN is_win = 0 THEN 1 ELSE 0 END) AS total_losses,
      SUM(win_amount) AS total_winnings
    FROM bet_history
    WHERE user_id = ?
  `);

  return statsStmt.get(userId.toString());
}

// Создание таблицы для истории ставок
db.prepare(`
  CREATE TABLE IF NOT EXISTS bet_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    round_hash TEXT NOT NULL,
    multiplier TEXT NOT NULL,
    amount INTEGER NOT NULL,
    is_win INTEGER NOT NULL,
    win_amount INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL
  )
`).run();


// Обновленная функция получения статистики
function getDoubleStats(userId) {
  const stmt = db.prepare(`
    SELECT 
      double_wins, 
      double_losses, 
      double_total_bets,
      double_total_winnings,
      double_total_losses
    FROM users 
    WHERE id = ?
  `);
  return stmt.get(userId.toString());
}



// Функция для обновления времени последнего получения бонуса
// Обновлена для поддержки обоих типов бонусов
function updateLastBonusTime(userId, timestamp, isPrivateChat = false) {
  let stmt;
  if (isPrivateChat) {
    stmt = db.prepare('UPDATE users SET last_private_bonus_time = ? WHERE id = ?');
  } else {
    stmt = db.prepare('UPDATE users SET last_bonus_time = ? WHERE id = ?');
  }
  const result = stmt.run(timestamp, userId.toString());
  if (result.changes === 0) {
    console.warn(`[DB] Не удалось обновить время бонуса для пользователя ${userId}. Пользователь не найден.`);
  }
  return result;
}


// --- Новая функция для получения времени последнего приватного бонуса ---
function getUserLastPrivateBonusTime(userId) {
  const stmt = db.prepare('SELECT last_private_bonus_time FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.last_private_bonus_time || 0;
}

// Функция для обновления баланса по числовому ID (numeric_id)
function updateUserBalanceByNumericId(numericId, balanceChange, currency = 'PF') {
  try {
    let user;
    let currentBalance;
    let updateStmt;

    if (currency === 'DF') {
      // Получаем текущий баланс DF пользователя
      user = db.prepare('SELECT df_balance FROM users WHERE numeric_id = ?').get(numericId);
      if (!user) {
        return { success: false, message: 'Пользователь с таким numeric_id не найден.' };
      }
      currentBalance = user.df_balance || 0; // Если df_balance отсутствует, считаем его равным 0
      updateStmt = db.prepare('UPDATE users SET df_balance = df_balance + ? WHERE numeric_id = ?');
    } else {
      // Получаем текущий баланс PF пользователя
      user = db.prepare('SELECT balance FROM users WHERE numeric_id = ?').get(numericId);
      if (!user) {
        return { success: false, message: 'Пользователь с таким numeric_id не найден.' };
      }
      currentBalance = user.balance;
      updateStmt = db.prepare('UPDATE users SET balance = balance + ? WHERE numeric_id = ?');
    }

    // Проверяем, что новый баланс не станет меньше нуля
    if (currentBalance + balanceChange < 0) {
      return { success: false, message: 'Недостаточно средств для выполнения операции.' };
    }

    // Обновляем баланс пользователя
    const info = updateStmt.run(balanceChange, numericId);

    if (info.changes > 0) {
      return { success: true };
    } else {
      return { success: false, message: 'Ошибка при обновлении баланса.' };
    }
  } catch (error) {
    console.error('[ERROR] Ошибка при обновлении баланса:', error);
    return { success: false, message: 'Произошла ошибка. Попробуйте позже.' };
  }
}

// Функция для получения информации о чате
function getChatByChatId(chatId) {
  const stmt = db.prepare('SELECT * FROM chats WHERE chat_id = ?');
  return stmt.get(chatId.toString());
}

// Функция для активации режима "дабл" в чате
function activateDoubleMode(chatId) {
  const stmt = db.prepare('INSERT OR REPLACE INTO chats (chat_id, is_double_chat) VALUES (?, 1)');
  const info = stmt.run(chatId.toString());
  if (info.changes > 0) {
    return { success: true };
  } else {
    return { success: false, message: 'Не удалось активировать режим "дабл".' };
  }
}

// Функция для деактивации режима "дабл" в чате
function deactivateDoubleMode(chatId) {
  const stmt = db.prepare('UPDATE chats SET is_double_chat = 0 WHERE chat_id = ?');
  const info = stmt.run(chatId.toString());
  if (info.changes > 0) {
    return { success: true };
  } else {
    return { success: false, message: 'Чат с указанным ID не найден.' };
  }
}

// Функция для проверки, является ли чат чатом "дабл"
function isDoubleChat(chatId) {
  const stmt = db.prepare('SELECT is_double_chat FROM chats WHERE chat_id = ?');
  const result = stmt.get(chatId.toString());
  return result?.is_double_chat === 1;
}

// Функция для активации режима "дайс"
function activateDiceMode(chatId) {
  const stmt = db.prepare('INSERT OR REPLACE INTO chats (chat_id, is_dice_chat) VALUES (?, 1)');
  const info = stmt.run(chatId.toString());
  if (info.changes > 0) {
    return { success: true };
  } else {
    return { success: false, message: 'Не удалось активировать режим "дайс".' };
  }
}

// Функция для деактивации режима "дайс"
function deactivateDiceMode(chatId) {
  const stmt = db.prepare('UPDATE chats SET is_dice_chat = 0 WHERE chat_id = ?');
  const info = stmt.run(chatId.toString());
  if (info.changes > 0) {
    return { success: true };
  } else {
    return { success: false, message: 'Чат с указанным ID не найден.' };
  }
}

// Функция для проверки, является ли чат чатом "дайс"
function isDiceChat(chatId) {
  const stmt = db.prepare('SELECT is_dice_chat FROM chats WHERE chat_id = ?');
  const result = stmt.get(chatId.toString());
  return result?.is_dice_chat === 1;
}

// Функция для получения активного режима в чате
function getActiveModeInChat(chatId) {
  const stmt = db.prepare('SELECT is_double_chat, is_dice_chat FROM chats WHERE chat_id = ?');
  const result = stmt.get(chatId.toString());
  if (result) {
    if (result.is_double_chat === 1) return 'double';
    if (result.is_dice_chat === 1) return 'dice';
  }
  return null; // Нет активных режимов
}

// Функция для добавления чата в базу данных
function addChat(chatId) {
  const stmt = db.prepare('INSERT OR IGNORE INTO chats (chat_id, is_double_chat) VALUES (?, 0)');
  stmt.run(chatId.toString());
}
function getReferralsByReferrerId(referrerId) {
  const stmt = db.prepare(`
    SELECT 
      id, 
      username, 
      is_registered,
      registration_date 
    FROM users 
    WHERE 
      referrer_id = ? 
      AND (
        is_registered = 1 
        OR 
        registration_date < ?
      )
  `);
  
  // Unix timestamp для 23 июня 2025 года
  const cutoffDate = new Date('2025-06-23').getTime() / 1000;
  
  return stmt.all(referrerId, cutoffDate);
}


// Функция для получения пользователя по username
function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
  return stmt.get(username.trim().toLowerCase());
}

// Функция для получения всех пользователей
function getAllUsers() {
  const stmt = db.prepare('SELECT * FROM users');
  return stmt.all();
}

// Функция для создания нового промокода
function createPromo(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt = null) {
  const stmt = db.prepare(
    'INSERT INTO promos (name, activations_left, prize_type, prize_amount, created_by, min_status_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  try {
    stmt.run(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Промокод с таким названием уже существует.' };
  }
}

// Функция для получения промокода по имени
function getPromoByName(name) {
  const stmt = db.prepare('SELECT * FROM promos WHERE name = ?');
  return stmt.get(name);
}

// Функция для получения списка всех промокодов
function getAllPromos() {
  const stmt = db.prepare('SELECT * FROM promos');
  return stmt.all();
}

// Функция для проверки, активировал ли пользователь промокод
function hasUserActivatedPromo(promoId, userId) {
  const stmt = db.prepare('SELECT * FROM promo_activations WHERE promo_id = ? AND user_id = ?');
  return !!stmt.get(promoId, userId);
}

// Функция для записи активации промокода
function recordPromoActivation(promoId, userId) {
  const stmt = db.prepare('INSERT INTO promo_activations (promo_id, user_id) VALUES (?, ?)');
  stmt.run(promoId, userId);
}

// Функция для удаления промокода по ID
function deletePromoById(id) {
  try {
    // Сначала удаляем записи из таблицы promo_activations
    const deleteActivationsStmt = db.prepare('DELETE FROM promo_activations WHERE promo_id = ?');
    deleteActivationsStmt.run(id);
    // Затем удаляем сам промокод
    const deletePromoStmt = db.prepare('DELETE FROM promos WHERE id = ?');
    const info = deletePromoStmt.run(id);
    if (info.changes > 0) {
      return { success: true };
    } else {
      return { success: false, message: 'Промокод с указанным ID не найден.' };
    }
  } catch (error) {
    console.error('Ошибка при удалении промокода:', error);
    return { success: false, message: 'Произошла ошибка при удалении промокода.' };
  }
}

// Проверка на наличие в черном списке с учетом времени бана
function isUserBanned(userId) {
  const stmt = db.prepare('SELECT * FROM blacklist WHERE user_id = ?');
  const user = stmt.get(userId.toString());
  if (!user) return false;

  // Если время бана истекло, возвращаем false (разбан обрабатывается в startAutoUnban)
  if (user.banned_until && Date.now() / 1000 > user.banned_until) {
    return false;
  }

  return true;
}

// Добавление в черный список
function addToBlacklist(userId, reason, bannedUntil = null) {
  const stmt = db.prepare('INSERT INTO blacklist (user_id, reason, banned_until) VALUES (?, ?, ?)');
  stmt.run(userId.toString(), reason, bannedUntil);
}

// Удаление из черного списка
function removeFromBlacklist(userId) {
  const stmt = db.prepare('DELETE FROM blacklist WHERE user_id = ?');
  stmt.run(userId.toString());
}

// Получение списка заблокированных пользователей
function getBlacklist() {
  const stmt = db.prepare('SELECT * FROM blacklist');
  return stmt.all();
}

// Функция для получения информации о бане пользователя
function getBlacklistEntry(userId) {
  const stmt = db.prepare('SELECT * FROM blacklist WHERE user_id = ?');
  return stmt.get(userId.toString());
}

// Функция для получения промокода по ID
function getPromoById(id) {
  const stmt = db.prepare('SELECT * FROM promos WHERE id = ?');
  return stmt.get(id);
}

function updateContainerCount(userId, containerType, countChange) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
      return { success: false, message: 'Пользователь не найден' };
  }

  // Получаем текущие количества контейнеров
  const currentCounts = {
      1: user.container_type_1 || 0,
      2: user.container_type_2 || 0,
      3: user.container_type_3 || 0
  };

  // Базовые лимиты
  let limits = { 1: 150, 2: 150, 3: 150 };
  let statusName = 'Обычный игрок';
  let higherStatusesInfo = [];

  // Асинхронное получение статусов пользователя
  const userStatuses = getUserStatusesSync(userId);

  // Лог: Выводим статусы пользователя
  console.log(`[DEBUG] Статусы пользователя ${userId}:`, userStatuses);

  // Список всех статусов с приоритетами и лимитами
  const allStatuses = [
      { name: 'DIAMOND', priority: 85, limits: { 1: 300, 2: 300, 3: 300 } },
      { name: 'PLATINUM', priority: 80, limits: { 1: 250, 2: 250, 3: 250 } },
      { name: 'GOLD', priority: 75, limits: { 1: 200, 2: 200, 3: 200 } },
      { name: 'Администратор', priority: 95, limits: { 1: 500, 2: 500, 3: 500 } },
      { name: 'Тех администратор', priority: 100, limits: { 1: 1000000, 2: 1000000, 3: 1000000 } }
  ];

  // Находим все статусы пользователя и выбираем с максимальными лимитами
  let maxPriority = -1;
  let bestStatus = null;

  // Ищем все статусы пользователя и определяем лучший
  for (const status of allStatuses) {
      if (userStatuses.includes(status.name)) {
          // Лог: Найден статус пользователя
          console.log(`[DEBUG] Найден статус пользователя ${userId}:`, status.name);
          
          // Выбираем статус с максимальным приоритетом
          if (status.priority > maxPriority) {
              maxPriority = status.priority;
              bestStatus = status;
              // Лог: Обновлен лучший статус
              console.log(`[DEBUG] Обновлен лучший статус для пользователя ${userId}:`, status.name);
          }
      }
  }

  // Если найден лучший статус, используем его лимиты
  if (bestStatus) {
      limits = bestStatus.limits;
      statusName = bestStatus.name;
      
      // Лог: Используем лучший статус
      console.log(`[DEBUG] Используем лучший статус для пользователя ${userId}:`, statusName);
  }

  // Формируем информацию о статусах выше текущего (кроме Тех администратора)
  if (statusName !== 'Тех администратор') {
      for (const status of allStatuses) {
          if (status.priority > maxPriority && status.name !== 'Тех администратор') {
              higherStatusesInfo.push(`
<b>Статус:</b> ${status.name}
• CLASSIC: ${status.limits[1]} шт
• PREMIUM: ${status.limits[2]} шт
• GOLD: ${status.limits[3]} шт`);

              // Лог: Найден доступный статус выше текущего
              console.log(`[DEBUG] Доступный статус выше текущего для пользователя ${userId}:`, status.name);
          }
      }
  }

  // Проверяем, не превысит ли новое количество лимит
  const newCount = (currentCounts[containerType] || 0) + countChange;
  if (newCount > limits[containerType]) {
      const containerNames = ['CLASSIC', 'PREMIUM', 'GOLD'];
      const remainingSlots = Math.max(0, limits[containerType] - currentCounts[containerType]);

      // Лог: Превышение лимита
      console.warn(`[WARN] Превышен лимит контейнеров типа ${containerNames[containerType - 1]} для пользователя ${userId}. Текущий лимит: ${limits[containerType]}, попытка покупки: ${newCount}`);

      return {
          success: false,
          message: `
⚠️ Лимит контейнеров типа ${containerNames[containerType - 1]} (${limits[containerType]}) превышен.
• У вас уже есть ${currentCounts[containerType]} контейнеров этого типа.
• Вы можете купить ещё ${remainingSlots} ${containerNames[containerType - 1]} контейнер${remainingSlots === 1 ? '' : 'а'}.

<b>Ваш текущий статус:</b> ${statusName}
${higherStatusesInfo.length > 0 ? `
<b>Доступные улучшения лимита контов:</b>
${higherStatusesInfo.join('\n')}
` : ''}
`.trim(),
          limits: limits
      };
  }

  // Если проверка прошла успешно, обновляем количество контейнеров
  const column = `container_type_${containerType}`;
  const stmt = db.prepare(`UPDATE users SET ${column} = ${column} + ? WHERE id = ?`);
  stmt.run(countChange, userId);

  // Лог: Успешное обновление количества контейнеров
  console.log(`[DEBUG] Успешно обновлено количество контейнеров для пользователя ${userId}. Тип: ${containerType}, Количество: ${countChange}`);

  return { success: true };
}

// Синхронная версия getUserStatuses для совместимости
function getUserStatusesSync(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.status_ids) return [];

  // Преобразуем JSON-строку в массив ID
  const statusIds = JSON.parse(user.status_ids || '[]');

  // Получаем все статусы по ID
  const statuses = statusIds.map(id => getStatusByIdSync(id));

  // Возвращаем только те статусы, которые существуют
  return statuses.filter(status => status).map(status => status.name);
}

// Синхронная версия getStatusById для совместимости
function getStatusByIdSync(id) {
  const stmt = db.prepare('SELECT * FROM statuses WHERE id = ?');
  return stmt.get(id);
}
// Функция для уменьшения количества контейнеров у пользователя
function decreaseContainerCount(userId, containerType, quantity = 1) {
  const containerField = `container_type_${containerType}`;
  
  // Сначала проверяем, достаточно ли контейнеров у пользователя
  const checkStmt = db.prepare(`
      SELECT ${containerField} as count 
      FROM users 
      WHERE id = ?
  `);
  const currentCount = checkStmt.get(userId.toString())?.count || 0;
  
  if (currentCount < quantity) {
      return { 
          success: false, 
          message: `Недостаточно контейнеров данного типа. Доступно: ${currentCount}, требуется: ${quantity}` 
      };
  }
  
  // Если достаточно, выполняем списание
  const updateStmt = db.prepare(`
      UPDATE users 
      SET ${containerField} = ${containerField} - ? 
      WHERE id = ?
  `);
  const info = updateStmt.run(quantity, userId.toString());
  
  if (info.changes > 0) {
      return { 
          success: true,
          newCount: currentCount - quantity // Возвращаем новое количество контейнеров
      };
  } else {
      return { 
          success: false, 
          message: 'Не удалось выполнить операцию списания контейнеров' 
      };
  }
}


// Сохранение нового раунда дайса в базу данных
function saveDiceRound(chatId, startTime, endTime, roundId) {
  const stmt = db.prepare(`
    INSERT INTO dice_rounds (chat_id, start_time, end_time, round_id)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(chatId, startTime, endTime, roundId);
  return roundId; // Возвращаем roundId для использования в дальнейшем
}

// Сохранение ставки пользователя для конкретного раунда дайса
async function saveDiceBet(roundId, userId, username, amount) {
  try {
    console.log(`[DEBUG] Проверка существования раунда с roundId=${roundId}`);
    const roundExists = db.prepare('SELECT 1 FROM dice_rounds WHERE round_id = ?').get(roundId);
    if (!roundExists) {
      throw new Error(`❌ Раунд с roundId=${roundId} не найден в базе данных.`);
    }

    console.log(`[DEBUG] Сохранение ставки для roundId=${roundId}, userId=${userId}, amount=${amount}`);
    const stmt = db.prepare(`
      INSERT INTO dice_bets (round_id, user_id, username, amount)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(roundId, userId, username, amount);
    console.log(`[DEBUG] Ставка успешно сохранена.`);
  } catch (error) {
    console.error(`[ERROR] Ошибка при сохранении ставки: ${error.message}`);
    throw error;
  }
}

// Получение всех ставок для указанного раунда дайса
function getDiceBetsByRoundId(roundId) {
  const stmt = db.prepare('SELECT * FROM dice_bets WHERE round_id = ?');
  return stmt.all(roundId);
}

// Обновление результатов броска кубиков для конкретной ставки
function updateDiceResults(betId, dice1, dice2) {
  const stmt = db.prepare(`
    UPDATE dice_bets
    SET dice1 = ?, dice2 = ?
    WHERE id = ?
  `);
  stmt.run(dice1, dice2, betId);
}

// Сброс всех ставок для указанного чата
function resetDiceRoundParticipants(chatId) {
  const stmt = db.prepare('DELETE FROM dice_bets WHERE chat_id = ?');
  stmt.run(chatId.toString());
}

// Проверка, активирован ли режим "дайс" в чате
function isDiceChat(chatId) {
  const stmt = db.prepare('SELECT is_dice_chat FROM chats WHERE chat_id = ?');
  const result = stmt.get(chatId.toString());
  return result?.is_dice_chat === 1;
}

// Получение всех активных чатов с режимом "дайс"
async function getAllActiveDiceChats() {
  const stmt = db.prepare('SELECT chat_id FROM chats WHERE is_dice_chat = 1');
  const rows = stmt.all();
  return rows.map(row => row.chat_id);
}

// Функция получения общего количества донатов пользователя
function getTotalDonatedStars(userId) {
  const stmt = db.prepare('SELECT total_donated_stars FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.total_donated_stars || 0;
}


// Функция для сохранения form_id
function saveFormIdToDatabase(userId, formId) {
  const stmt = db.prepare('SELECT form_ids FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  let formIds = JSON.parse(result?.form_ids || '[]');
  
  // Добавляем новый form_id
  formIds.push(formId);
  
  // Обновляем список form_ids в базе данных
  const updateStmt = db.prepare('UPDATE users SET form_ids = ? WHERE id = ?');
  updateStmt.run(JSON.stringify(formIds), userId.toString());
}


// Функция для удаления form_id
function deleteFormIdFromDatabase(userId) {
  const stmt = db.prepare('SELECT form_ids FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  let formIds = JSON.parse(result?.form_ids || '[]');
  
  // Удаляем первый form_id
  formIds.shift();
  
  // Обновляем список form_ids в базе данных
  const updateStmt = db.prepare('UPDATE users SET form_ids = ? WHERE id = ?');
  updateStmt.run(JSON.stringify(formIds), userId.toString());
}

// Функция для создания нового статуса
function createStatus(name, priority) {
  const stmt = db.prepare('INSERT INTO statuses (name, priority) VALUES (?, ?)');
  try {
    stmt.run(name, priority);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Статус с таким названием уже существует.' };
  }
}

// Функция для получения всех статусов
function getAllStatuses() {
  const stmt = db.prepare('SELECT * FROM statuses ORDER BY priority DESC');
  return stmt.all();
}

// Функция для получения статуса по ID
function getStatusById(id) {
  const stmt = db.prepare('SELECT * FROM statuses WHERE id = ?');
  return stmt.get(id);
}

// Функция для получения статуса по имени
function getStatusByName(name) {
  const stmt = db.prepare('SELECT * FROM statuses WHERE name = ? COLLATE NOCASE');
  return stmt.get(name.trim());
}

// Функция для обновления статусов пользователя
function updateUserStatus(userId, statusId) {
  const stmt = db.prepare('SELECT status_ids FROM users WHERE id = ?');
  const user = stmt.get(userId.toString());
  if (!user) {
    console.error(`[ERROR] Пользователь ${userId} не найден.`);
    return { success: false, message: 'Пользователь не найден.' };
  }

  let currentStatusIds = JSON.parse(user.status_ids || '[]');
  console.log(`[DEBUG] Текущие ID статусов пользователя ${userId}:`, currentStatusIds);

  // Проверяем, уже назначен ли этот статус
  if (currentStatusIds.includes(statusId)) {
    console.log(`[DEBUG] Статус с ID ${statusId} уже назначен пользователю ${userId}`);
    return { success: true, message: 'Статус уже назначен пользователю.' };
  }

  // Добавляем новый статус
  currentStatusIds.push(statusId);
  console.log(`[DEBUG] Обновленные ID статусов пользователя ${userId}:`, currentStatusIds);

  // Сохраняем обновленный массив статусов как JSON-строку
  const updateStmt = db.prepare('UPDATE users SET status_ids = ? WHERE id = ?');
  const info = updateStmt.run(JSON.stringify(currentStatusIds), userId.toString());
  if (info.changes > 0) {
    console.log(`[DEBUG] Статус с ID ${statusId} успешно добавлен пользователю ${userId}`);
    return { success: true };
  } else {
    console.error(`[ERROR] Не удалось обновить статусы пользователя ${userId}`);
    return { success: false, message: 'Не удалось обновить статусы.' };
  }
}

// Функция для получения всех статусов пользователя
async function getUserStatuses(userId) {
  const user = await getUserById(userId);
  if (!user || !user.status_ids) return [];

  // Преобразуем JSON-строку в массив ID
  const statusIds = JSON.parse(user.status_ids);
  console.log(`[DEBUG] Получены ID статусов для пользователя ${userId}:`, statusIds);

  // Получаем все статусы по ID
  const statuses = await Promise.all(statusIds.map(id => getStatusById(id)));
  console.log(`[DEBUG] Полные данные статусов для пользователя ${userId}:`, statuses);

  // Возвращаем только те статусы, которые существуют
  return statuses.filter(status => status).map(status => status.name);
}

// Функция для удаления статуса у пользователя
function removeUserStatus(userId, statusId) {
  const stmt = db.prepare('SELECT status_ids FROM users WHERE id = ?');
  const user = stmt.get(userId.toString());
  if (!user) {
    return { success: false, message: 'Пользователь не найден.' };
  }

  // Преобразуем текущие статусы из JSON-строки в массив
  let currentStatusIds = JSON.parse(user.status_ids || '[]');

  // Удаляем указанный статус
  const updatedStatusIds = currentStatusIds.filter(id => id !== statusId);

  // Если статус не был найден
  if (currentStatusIds.length === updatedStatusIds.length) {
    return { success: false, message: 'Указанный статус не найден у пользователя.' };
  }

  // Сохраняем обновленный массив статусов как JSON-строку
  const updateStmt = db.prepare('UPDATE users SET status_ids = ? WHERE id = ?');
  const info = updateStmt.run(JSON.stringify(updatedStatusIds), userId.toString());
  if (info.changes > 0) {
    return { success: true };
  } else {
    return { success: false, message: 'Не удалось обновить статусы.' };
  }
}


// Функция для получения номера карты пользователя
function getCardNumber(userId) {
  const stmt = db.prepare('SELECT card_number FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.card_number || null;
}

// Функция для сохранения данных карты
function saveCardDetails(userId, cardNumber, cardId) {
  const stmt = db.prepare('UPDATE users SET card_number = ?, card_id = ? WHERE id = ?');
  const info = stmt.run(cardNumber, cardId, userId.toString());
  return info.changes > 0; // Возвращаем true, если данные успешно обновлены
}




// Функция для увеличения счетчика лайков
function incrementLikesReceived(userId) {
  const stmt = db.prepare('UPDATE users SET likes_received = likes_received + 1 WHERE id = ?');
  stmt.run(userId.toString());
}

// Функция для увеличения счетчика дизлайков
function incrementDislikesReceived(userId) {
  const stmt = db.prepare('UPDATE users SET dislikes_received = dislikes_received + 1 WHERE id = ?');
  stmt.run(userId.toString());
}

// Обновление баланса DF администратора
function updateAdminDFBalance(userId, dfChange) {
  const stmt = db.prepare('UPDATE users SET df_balance = df_balance + ? WHERE id = ?');
  stmt.run(dfChange, userId.toString());
}

// Функция для получения пользователей с определенными статусами
async function getUsersByStatuses(statusNames) {
  // Получаем все статусы из базы данных
  const allStatuses = await getAllStatuses();

  // Находим ID статусов, соответствующих переданным именам
  const statusIds = allStatuses
      .filter(status => statusNames.includes(status.name))
      .map(status => status.id);

  if (statusIds.length === 0) {
      return []; // Если статусы не найдены, возвращаем пустой массив
  }

  // Получаем всех пользователей с указанными статусами
  const stmt = db.prepare(`
      SELECT u.*, GROUP_CONCAT(s.name, ', ') AS status_names
      FROM users u
      LEFT JOIN statuses s ON JSON_EXTRACT(u.status_ids, '$') LIKE '%' || s.id || '%'
      WHERE s.id IN (${statusIds.map(() => '?').join(',')})
      GROUP BY u.id
      ORDER BY MIN(s.priority) ASC
  `);

  return stmt.all(statusIds);
}

// Функция для добавления пользователя в список мутов
function addMute(userId, chatId, reason, mutedUntil) {
  const stmt = db.prepare('INSERT INTO mutes (user_id, chat_id, muted_until, reason) VALUES (?, ?, ?, ?)');
  stmt.run(userId.toString(), chatId.toString(), mutedUntil, reason);
}

// Функция для удаления пользователя из списка мутов
function removeMute(userId, chatId) {
  const stmt = db.prepare('DELETE FROM mutes WHERE user_id = ? AND chat_id = ?');
  stmt.run(userId.toString(), chatId.toString());
}

// Функция для проверки, находится ли пользователь в муте в конкретном чате
function isUserMuted(userId, chatId) {
  const stmt = db.prepare('SELECT * FROM mutes WHERE user_id = ? AND chat_id = ?');
  const result = stmt.get(userId.toString(), chatId.toString());
  if (!result) return false;
  if (result.muted_until === null || result.muted_until > Math.floor(Date.now() / 1000)) {
    return result; // Возвращаем информацию о муте
  }
  removeMute(userId, chatId); // Если мут истёк, удаляем запись
  return false;
}

function getMuteList(chatId) {
  if (chatId) {
    // Если передан chatId, выбираем муты только для этого чата
    const stmt = db.prepare('SELECT * FROM mutes WHERE chat_id = ?');
    return stmt.all(chatId.toString());
  } else {
    // Если chatId не передан, выбираем все муты
    const stmt = db.prepare('SELECT * FROM mutes');
    return stmt.all();
  }
}

function activatePromo(promoId, userId) {
  try {
    const promo = getPromoById(promoId);
    if (!promo) {
      return { success: false, message: 'Промокод не найден.' };
    }
    const now = Math.floor(Date.now() / 1000);
    // 1. ПРОВЕРКА ВРЕМЕНИ (для временных промокодов)
    if (promo.expires_at && now > promo.expires_at) {
      logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Срок действия истёк' });
      return { success: false, message: 'Срок действия промокода истек.' };
    }
    // 2. ПРОВЕРКА АКТИВАЦИЙ (только если промокод НЕ временный)
    if (promo.activations_left !== -1 && promo.activations_left <= 0) {
      logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Активации исчерпаны' });
      return { success: false, message: 'Активации промокода исчерпаны.' };
    }
    // Уменьшаем количество активаций, ТОЛЬКО если это не временный промокод
    if (promo.activations_left !== -1) {
      const updateStmt = db.prepare('UPDATE promos SET activations_left = activations_left - 1 WHERE id = ?');
      updateStmt.run(promoId);
    }
    // Начисляем приз пользователю
    const result = updateUserField(userId, promo.prize_type, promo.prize_amount);
    if (!result.success) {
      // Если начисление не удалось, возвращаем активацию обратно (если не временный)
      if (promo.activations_left !== -1) {
        const rollbackStmt = db.prepare('UPDATE promos SET activations_left = activations_left + 1 WHERE id = ?');
        rollbackStmt.run(promoId);
      }
      logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: false, reason: 'Не удалось начислить приз' });
      return { success: false, message: 'Не удалось начислить приз.' };
    }
    // УСПЕХ: пишем лог активации
    logPromoActivation({ userId, promoName: promo.name, prizeType: promo.prize_type, prizeAmount: promo.prize_amount, success: true });
    return { success: true, prizeType: promo.prize_type, prizeAmount: promo.prize_amount };
  } catch (error) {
    console.error('Ошибка при активации промокода:', error);
    return { success: false, message: 'Произошла ошибка при активации промокода.' };
  }
}


function getPromoById(id) {
  const stmt = db.prepare('SELECT * FROM promos WHERE id = ?');
  return stmt.get(id);
}

function getPromoByName(name) {
  const stmt = db.prepare('SELECT * FROM promos WHERE name = ?');
  return stmt.get(name);
}

function hasUserActivatedPromo(promoId, userId) {
  const stmt = db.prepare('SELECT * FROM promo_activations WHERE promo_id = ? AND user_id = ?');
  return !!stmt.get(promoId, userId);
}

function recordPromoActivation(promoId, userId) {
  const stmt = db.prepare('INSERT INTO promo_activations (promo_id, user_id) VALUES (?, ?)');
  stmt.run(promoId, userId);
}


function updateUserField(userId, field, valueChange) {
  try {
    const user = getUserById(userId);
    if (!user) {
      console.error(`Пользователь с ID=${userId} не найден.`);
      return { success: false, message: 'Пользователь не найден.' };
    }

    const stmt = db.prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`);
    const info = stmt.run(valueChange, userId.toString());

    if (info.changes > 0) {
      console.log(`Поле "${field}" пользователя с ID=${userId} успешно обновлено на ${valueChange}.`);
      return { success: true };
    } else {
      console.error(`Не удалось обновить поле "${field}" пользователя с ID=${userId}.`);
      return { success: false, message: `Не удалось обновить поле "${field}".` };
    }
  } catch (error) {
    console.error(`Ошибка при обновлении поля "${field}" пользователя с ID=${userId}:`, error);
    return { success: false, message: 'Произошла ошибка при обновлении данных пользователя.' };
  }
}

function getTargetUserId(ctx) {
  const replyToMessage = ctx.message.reply_to_message;
  if (replyToMessage && replyToMessage.from) {
    console.log(`[DEBUG] Команда является ответом на сообщение. Получен Telegram ID: ${replyToMessage.from.id}`);
    return { type: 'telegramId', value: replyToMessage.from.id.toString() }; // Возвращаем Telegram ID как строку
  }

  const parts = ctx.message.text.split(/\s+/);
  if (parts.length > 1) {
    const numericId = parseInt(parts[1], 10); // Используем numeric_id из текста команды
    if (!isNaN(numericId)) {
      console.log(`[DEBUG] Получен numeric_id из текста команды: ${numericId}`);
      return { type: 'numericId', value: numericId.toString() }; // Возвращаем numeric_id как строку
    }
  }

  console.log('[DEBUG] Невозможно определить ID пользователя.');
  return null; // Если ни одно условие не выполнено
}

async function updateUserDFBalance(userId, dfChange) {
  try {
      const user = getUserById(userId);
      if (!user) {
          throw new Error("Пользователь не найден");
      }
      
      const currentBalance = user.df_balance || 0; // Учитываем возможное null значение
      const newBalance = currentBalance + dfChange;
      
      if (newBalance < 0) {
          throw new Error("Недостаточно DF для выполнения операции");
      }
      
      const stmt = db.prepare('UPDATE users SET df_balance = ? WHERE id = ?');
      stmt.run(newBalance, userId.toString());
      
      return { success: true, newBalance };
  } catch (error) {
      console.error('[updateUserDFBalance] Ошибка:', error);
      return { success: false, message: error.message };
  }
}

function addDonationToHistory(userId, amount) {
  const user = getUserById(userId);
  if (!user) return;

  console.log(`[DEBUG] addDonationToHistory: Получен пользователь с ID ${userId}`);

  let history = JSON.parse(user.donations_history || '[]');

  // Сохраняем текущее время в Unix timestamp (в секундах)
  const timestamp = Math.floor(Date.now() / 1000);
  console.log(`[DEBUG] addDonationToHistory: Сохраняем timestamp=${timestamp}`);

  history.push({
      amount: amount,
      timestamp: timestamp,
  });

  db.prepare('UPDATE users SET donations_history = ? WHERE id = ?')
      .run(JSON.stringify(history), userId);

  console.log(`[DEBUG] addDonationToHistory: История донатов обновлена для пользователя ${userId}`);
}

function getDonationHistory(userId) {
  const stmt = db.prepare('SELECT donations_history FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return JSON.parse(result?.donations_history || '[]');
}

function updateTotalDonatedStars(userId, amount) {
  const stmt = db.prepare('UPDATE users SET total_donated_stars = total_donated_stars + ? WHERE id = ?');
  stmt.run(amount, userId.toString());
}

// Функция для получения топ 10 донатеров
function getTopDonatorsFromDatabase() {
  const stmt = db.prepare(`
      SELECT id, username, total_donated_stars
      FROM users
      WHERE total_donated_stars > 0
      ORDER BY total_donated_stars DESC
      LIMIT 10
  `);
  return stmt.all();
}

// Функция для получения referrer_id пользователя
function getReferrerId(userId) {
  const stmt = db.prepare('SELECT referrer_id FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.referrer_id || null;
}

// Функция для получения списка свободных зарезервированных numeric_id
function getFreeReservedNumericIds() {
  try {
    // Получаем все занятые numeric_id из базы данных
    const allNumericIds = db.prepare('SELECT numeric_id FROM users').all().map(row => row.numeric_id);

    // Фильтруем зарезервированные numeric_id, которые не заняты
    const freeReservedIds = RESERVED_NUMERIC_IDS.filter(id => !allNumericIds.includes(id));

    return freeReservedIds;
  } catch (error) {
    console.error('Ошибка при получении списка свободных зарезервированных numeric_id:', error);
    return [];
  }
}

// Проверка наличия карты у пользователя
function hasCard(userId) {
  const stmt = db.prepare('SELECT card_number FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return !!result?.card_number;
}

// Функция для получения лимита карты по уровню
function getCardLimitByLevel(level) {
  const rewards = {
    1: { limit: 10000000 },
    2: { limit: 12000000 },
    3: { limit: 14000000 },
    4: { limit: 16000000 },
    5: { limit: 18000000 },
    6: { limit: 20000000 },
    7: { limit: 22000000 },
    8: { limit: 24000000 },
    9: { limit: 26000000 },
    10: { limit: 28000000 }, // Лимит основного баланса обрабатывается отдельно на уровне 10 и 15
    11: { limit: 30000000 },
    12: { limit: 32000000 },
    13: { limit: 34000000 },
    14: { limit: 36000000 },
    15: { limit: 38000000 }, // Лимит основного баланса обрабатывается отдельно на уровне 15
    16: { limit: 40000000 },
    17: { limit: 42000000 },
    18: { limit: 44000000 },
    19: { limit: 44000000 }, // Лимит не меняется
    20: { limit: 45000000 }, // Лимит основного баланса обрабатывается отдельно на уровне 20
  };
  return rewards[level]?.limit || 10000000; // По умолчанию уровень 1
}

// Обновление баланса карты пользователя с динамическим лимитом
function updateCardBalance(userId, amountChange) {
  try {
    // 1. Получаем уровень карты пользователя
    const levelStmt = db.prepare('SELECT card_level FROM users WHERE id = ?');
    const levelResult = levelStmt.get(userId.toString());
    const userLevel = levelResult?.card_level || 1; // По умолчанию уровень 1

    // 2. Получаем лимит для этого уровня
    const cardLimit = getCardLimitByLevel(userLevel);

    // 3. Получаем текущий баланс карты
    const balanceStmt = db.prepare('SELECT card_balance FROM users WHERE id = ?');
    const balanceResult = balanceStmt.get(userId.toString());
    const currentCardBalance = balanceResult?.card_balance || 0;

    // 4. Рассчитываем новый баланс
    const newBalanceRaw = currentCardBalance + amountChange;

    // 5. Применяем лимит
    const newBalance = Math.max(0, Math.min(cardLimit, newBalanceRaw)); // Не меньше 0, не больше лимита

    // 6. Обновляем баланс в БД
    const updateStmt = db.prepare('UPDATE users SET card_balance = ? WHERE id = ?');
    const info = updateStmt.run(newBalance, userId.toString());

    // 7. Возвращаем результат
    return info.changes > 0;
  } catch (error) {
    console.error('[DB] Ошибка при обновлении баланса карты:', error);
    return false;
  }
}


// Обновление основного баланса пользователя (например, PF) с динамическим лимитом
function updateMainBalance(userId, amountChange) {
  try {
    // 1. Получаем уровень карты пользователя (для определения лимита основного баланса)
    const levelStmt = db.prepare('SELECT card_level FROM users WHERE id = ?');
    const levelResult = levelStmt.get(userId.toString());
    const userLevel = levelResult?.card_level || 1; // По умолчанию уровень 1

    // 2. Определяем лимит основного баланса на основе уровня
    let mainBalanceLimit = 140000000; // Базовый лимит
    if (userLevel >= 10) mainBalanceLimit = 175000000; // Уровень 10
    if (userLevel >= 15) mainBalanceLimit = 185000000; // Уровень 15
    if (userLevel >= 20) mainBalanceLimit = 200000000; // Уровень 20

    // 3. Получаем текущий основной баланс
    const balanceStmt = db.prepare('SELECT balance FROM users WHERE id = ?');
    const balanceResult = balanceStmt.get(userId.toString());
    const currentMainBalance = balanceResult?.balance || 0;

    // 4. Рассчитываем новый баланс
    const newBalanceRaw = currentMainBalance + amountChange;

    // 5. Применяем лимит
    const newBalance = Math.max(0, Math.min(mainBalanceLimit, newBalanceRaw)); // Не меньше 0, не больше лимита

    // 6. Обновляем баланс в БД
    const updateStmt = db.prepare('UPDATE users SET balance = ? WHERE id = ?');
    const info = updateStmt.run(newBalance, userId.toString());

    // 7. Возвращаем результат
    return info.changes > 0;
  } catch (error) {
    console.error('[DB] Ошибка при обновлении основного баланса:', error);
    return false;
  }
}



// Проверка наличия карты у пользователя
function hasCard(userId) {
  const stmt = db.prepare('SELECT card_number FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return !!result?.card_number;
}

// Получение текущего баланса карты пользователя
function getCardBalance(userId) {
  const stmt = db.prepare('SELECT card_balance FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.card_balance || 0;
}

// Функция для выполнения транзакций
function transaction(callback) {
  try {
    db.exec('BEGIN TRANSACTION;'); // Начинаем транзакцию
    const result = callback(); // Выполняем операции внутри транзакции
    db.exec('COMMIT;'); // Подтверждаем транзакцию
    return result;
  } catch (error) {
    db.exec('ROLLBACK;'); // Откатываем транзакцию в случае ошибки
    throw error; // Перебрасываем ошибку дальше
  }
}

function getUserBalances(userId) {
  const user = db.prepare('SELECT balance, card_balance, df_balance FROM users WHERE id = ?').get(userId);
  return {
    pfBalance: user ? user.balance || 0 : 0,
    cardBalance: user ? user.card_balance || 0 : 0,
    dfBalance: user ? user.df_balance || 0 : 0,
  };
}

function getPrefixById(id) {
  const stmt = db.prepare('SELECT * FROM prefixes WHERE id = ?');
  return stmt.get(id);
}

// Функция для обновления поля пользователя по numeric_id
function updateUserFieldByNumericId(numericId, field, value) {
  try {
    const stmt = db.prepare(`UPDATE users SET ${field} = ? WHERE numeric_id = ?`);
    return stmt.run(value, numericId);
  } catch (error) {
    console.error('[DB] Ошибка при обновлении поля пользователя:', error);
    throw new Error('Не удалось обновить поле пользователя.');
  }
}

// Функция для обновления количества акций NPF пользователя
function updateUserNpfShares(userId, amount) {
  const stmt = db.prepare('UPDATE users SET npf_shares = npf_shares + ? WHERE id = ?');
  stmt.run(amount, userId.toString());
}


// Функция для выдачи статуса пользователю
function awardStatusToUser(userId, statusName) {
  const status = getStatusByName(statusName); // Получаем статус по имени
  if (!status) {
    console.error(`[ERROR] Статус "${statusName}" не найден.`);
    return { success: false, message: `Статус "${statusName}" не существует.` };
  }

  const userStmt = db.prepare('SELECT status_ids FROM users WHERE id = ?');
  const user = userStmt.get(userId.toString());
  if (!user) {
    console.error(`[ERROR] Пользователь с ID ${userId} не найден.`);
    return { success: false, message: 'Пользователь не найден.' };
  }

  let currentStatusIds = JSON.parse(user.status_ids || '[]'); // Текущие статусы пользователя

  // Проверяем, уже назначен ли этот статус
  if (currentStatusIds.includes(status.id)) {
    return { success: true, message: `Статус "${status.name}" уже назначен пользователю.` };
  }

  // Добавляем новый статус
  currentStatusIds.push(status.id);

  // Обновляем массив статусов в базе данных
  const updateStmt = db.prepare('UPDATE users SET status_ids = ? WHERE id = ?');
  const info = updateStmt.run(JSON.stringify(currentStatusIds), userId.toString());

  if (info.changes > 0) {
    return { success: true, message: `Статус "${status.name}" успешно назначен.` };
  } else {
    return { success: false, message: 'Не удалось обновить статусы.' };
  }
}

// Функция для обновления настроек уведомлений пользователя
function updateUserNotifications(userId, enabled) {
  const stmt = db.prepare('UPDATE users SET notifications_enabled = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, userId.toString());
}

// Функция для получения настроек уведомлений пользователя
function getUserNotificationSettings(userId) {
  const stmt = db.prepare('SELECT notifications_enabled FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result ? { enabled: !!result.notifications_enabled } : null;
}

// Создание таблицы для ставок Double
db.prepare(`
  CREATE TABLE IF NOT EXISTS double_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,        -- ID раунда (для double_bets)
    chat_id TEXT NOT NULL,         -- ID чата
    user_id TEXT NOT NULL,         -- ID пользователя
    username TEXT NOT NULL,        -- Имя пользователя
    multiplier TEXT NOT NULL,      -- Множитель (x2, x3, x5, GAME)
    amount INTEGER NOT NULL,       -- Сумма ставки
    is_win INTEGER DEFAULT 0,      -- Флаг выигрыша (0 или 1)
    win_amount INTEGER DEFAULT 0,  -- Сумма выигрыша
    created_at INTEGER NOT NULL,   -- Время создания ставки
    game_choice TEXT DEFAULT NULL  -- Выбор ячейки для GAME ('left' или 'right')
);
`).run();

function saveBet(roundId, userId, username, multiplier, amount, chatId, gameChoice = null) {
  if (!roundId || !userId || !username || !multiplier || !amount || !chatId) {
      console.error('❌ Ошибка: Некорректные аргументы в saveBet');
      throw new Error('❌ Некорректные аргументы в saveBet');
  }
  const stmt = db.prepare(`
    INSERT INTO double_bets (round_id, chat_id, user_id, username, multiplier, amount, created_at, game_choice)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    roundId,
    chatId.toString(),
    userId.toString(),
    username,
    multiplier,
    amount,
    Date.now(),
    gameChoice
  );
}
  
function getBetsByRoundId(roundId) {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare('SELECT * FROM double_bets WHERE round_id = ?');
      const result = stmt.all(roundId);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

function getActiveChatIdsByRoundHash(roundHash) {
  return new Promise((resolve, reject) => {
    try {
      // ИСПРАВЛЕНО: читаем из double_bets_log (единственный источник ставок)
      const stmt = db.prepare(
        "SELECT DISTINCT chat_id FROM double_bets_log WHERE round_id = ? AND status = 'accepted'"
      );
      const rows = stmt.all(roundHash);
      resolve(rows.map(row => row.chat_id.toString()));
    } catch (error) {
      reject(error);
    }
  });
}

// Функция для обновления суммы бонуса рефералу
// Функция для обновления суммы бонуса рефералу (теперь использует конфиг)
function updateReferralBonusAmount(numericId, bonusAmount) {
  const { REFERRAL_BONUS_REFERRER_PF } = require('./config');
  // Игнорируем переданное значение, всегда ставим из конфига
  const finalBonus = REFERRAL_BONUS_REFERRER_PF;
  try {
      const stmt = db.prepare('UPDATE users SET referral_bonus_amount = ? WHERE numeric_id = ?');
      const info = stmt.run(finalBonus, numericId);
      if (info.changes > 0) {
          console.log(`[DEBUG] Сумма бонуса для пользователя с numeric_id=${numericId} установлена на ${finalBonus} (из конфига).`);
          return { success: true };
      } else {
          console.error(`[DEBUG] Не удалось обновить сумму бонуса для пользователя с numeric_id=${numericId}.`);
          return { success: false, message: 'Пользователь с указанным numeric_id не найден.' };
      }
  } catch (error) {
      console.error('[DB] Ошибка при обновлении суммы бонуса рефералу:', error);
      return { success: false, message: 'Произошла ошибка при обновлении суммы бонуса.' };
  }
}

// Функция для получения полного топа игроков
function getDetailedTopPlayers() {
  try {
      const stmt = db.prepare(`
          SELECT 
              numeric_id,
              id AS telegram_id,
              username,
              disable_hyperlink,
              balance,
              card_balance
          FROM users
          WHERE username IS NOT NULL
          ORDER BY (balance + card_balance) DESC -- Сортировка по общему балансу
          LIMIT 12 -- Ограничение на 12 игроков
      `);
      const topPlayers = stmt.all();

      // Формируем результат в виде массива объектов
      return topPlayers.map(player => ({
          numeric_id: player.numeric_id,
          telegram_id: player.telegram_id,
          username: player.username,
          disable_hyperlink: !!player.disable_hyperlink,
          balance: player.balance || 0, // Баланс PF
          card_balance: player.card_balance || 0 // Баланс карты
      }));
  } catch (error) {
      console.error("Ошибка при получении топа игроков:", error);
      return [];
  }
}

// Функция для получения топа игроков по количеству контейнеров
function getTopPlayersByContainers() {
  try {
    const stmt = db.prepare(`
      SELECT 
        numeric_id, 
        id AS telegram_id, 
        username, 
        disable_hyperlink,
        container_type_1 + container_type_2 + container_type_3 AS total_containers
      FROM users 
      WHERE username IS NOT NULL 
      ORDER BY total_containers DESC -- Сортировка по общему количеству контейнеров в порядке убывания
      LIMIT 10 -- Ограничение на 10 игроков
    `);
    const topPlayers = stmt.all();

    // Формируем результат в виде массива объектов
    return topPlayers.map(player => ({
      numeric_id: player.numeric_id,
      telegram_id: player.telegram_id,
      username: player.username,
      disable_hyperlink: !!player.disable_hyperlink,
      total_containers: player.total_containers || 0 // Общее количество контейнеров
    }));
  } catch (error) {
    console.error("Ошибка при получении топа игроков по контейнерам:", error);
    return [];
  }
}

// Функция для забора предмета у пользователя
function takeItemFromUser(userId, itemType, amount) {
  try {
    // Проверяем, существует ли пользователь
    const user = db.prepare('SELECT * FROM users WHERE id = ? OR numeric_id = ?').get(userId, userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Проверяем, существует ли поле для указанного типа предмета
    const validItemTypes = [
      'balance', // PF
      'df_balance', // DF
      'npf_shares', // NPF акции
      'container_type_1', // Контейнеры типа 1
      'container_type_2', // Контейнеры типа 2
      'container_type_3', // Контейнеры типа 3
      'card_balance' // Баланс карты
    ];

    if (!validItemTypes.includes(itemType)) {
      return { success: false, message: 'Неверный тип предмета.' };
    }

    // Получаем текущее значение предмета
    const currentAmount = user[itemType] || 0;

    // Проверяем, достаточно ли предметов у пользователя
    if (currentAmount < amount) {
      return { success: false, message: `Недостаточно предметов (${itemType}). Текущее количество: ${currentAmount}.` };
    }

    // Обновляем количество предметов
    const stmt = db.prepare(`UPDATE users SET ${itemType} = ${itemType} - ? WHERE id = ? OR numeric_id = ?`);
    const info = stmt.run(amount, user.id, user.numeric_id);

    if (info.changes > 0) {
      return { success: true, message: `Успешно забрано ${amount} единиц предмета (${itemType}).` };
    } else {
      return { success: false, message: 'Не удалось обновить данные пользователя.' };
    }
  } catch (error) {
    console.error('Ошибка при выполнении функции takeItemFromUser:', error);
    return { success: false, message: 'Произошла ошибка при обработке запроса.' };
  }
}

// Функция для выдачи предмета пользователю
function giveItemToUser(userId, itemType, amount) {
  try {
    // Проверяем, существует ли пользователь
    const user = db.prepare('SELECT * FROM users WHERE id = ? OR numeric_id = ?').get(userId, userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Проверяем, существует ли поле для указанного типа предмета
    const validItemTypes = [
      'balance', // PF
      'df_balance', // DF
      'npf_shares', // NPF акции
      'container_type_1', // Контейнеры типа 1
      'container_type_2', // Контейнеры типа 2
      'container_type_3', // Контейнеры типа 3
      'card_balance' // Баланс карты
    ];

    if (!validItemTypes.includes(itemType)) {
      return { success: false, message: 'Неверный тип предмета.' };
    }

    // Обновляем количество предметов
    const stmt = db.prepare(`UPDATE users SET ${itemType} = ${itemType} + ? WHERE id = ? OR numeric_id = ?`);
    const info = stmt.run(amount, user.id, user.numeric_id);

    if (info.changes > 0) {
      return { success: true, message: `Успешно выдано ${amount} единиц предмета (${itemType}).` };
    } else {
      return { success: false, message: 'Не удалось обновить данные пользователя.' };
    }
  } catch (error) {
    console.error('Ошибка при выполнении функции giveItemToUser:', error);
    return { success: false, message: 'Произошла ошибка при обработке запроса.' };
  }
}

// Функция для получения топа игроков по df_balance
function getTopPlayersByDfBalance() {
  try {
    const stmt = db.prepare(`
      SELECT 
        numeric_id, 
        id AS telegram_id, 
        username, 
        disable_hyperlink,
        df_balance
      FROM users 
      WHERE username IS NOT NULL 
      ORDER BY df_balance DESC -- Сортировка по балансу DF в порядке убывания
      LIMIT 10 -- Ограничение на 10 игроков
    `);
    const topPlayers = stmt.all();

    // Формируем результат в виде массива объектов
    return topPlayers.map(player => ({
      numeric_id: player.numeric_id,
      telegram_id: player.telegram_id,
      username: player.username,
      disable_hyperlink: !!player.disable_hyperlink,
      df_balance: player.df_balance || 0 // Баланс DF пользователя
    }));
  } catch (error) {
    console.error("Ошибка при получении топа игроков по df_balance:", error);
    return [];
  }
}

// Функция для получения топа игроков по npf_shares
function getTopPlayersByNpfShares() {
  try {
    const stmt = db.prepare(`
      SELECT 
        numeric_id, 
        id AS telegram_id, 
        username, 
        disable_hyperlink,
        npf_shares
      FROM users 
      WHERE username IS NOT NULL 
      ORDER BY npf_shares DESC -- Сортировка по количеству акций NPF в порядке убывания
      LIMIT 10 -- Ограничение на 10 игроков
    `);
    const topPlayers = stmt.all();

    // Формируем результат в виде массива объектов
    return topPlayers.map(player => ({
      numeric_id: player.numeric_id,
      telegram_id: player.telegram_id,
      username: player.username,
      disable_hyperlink: !!player.disable_hyperlink,
      npf_shares: player.npf_shares || 0 // Количество акций NPF пользователя
    }));
  } catch (error) {
    console.error("Ошибка при получении топа игроков по npf_shares:", error);
    return [];
  }
}

// Функция для получения топа игроков по card_balance
function getTopPlayersByCardBalance() {
  try {
    const stmt = db.prepare(`
      SELECT 
        numeric_id, 
        id AS telegram_id, 
        username, 
        disable_hyperlink,
        card_balance
      FROM users 
      WHERE username IS NOT NULL 
      ORDER BY card_balance DESC -- Сортировка по балансу карты в порядке убывания
      LIMIT 10 -- Ограничение на 10 игроков
    `);
    const topPlayers = stmt.all();

    // Формируем результат в виде массива объектов
    return topPlayers.map(player => ({
      numeric_id: player.numeric_id,
      telegram_id: player.telegram_id,
      username: player.username,
      disable_hyperlink: !!player.disable_hyperlink,
      card_balance: player.card_balance || 0 // Баланс карты пользователя
    }));
  } catch (error) {
    console.error("Ошибка при получении топа игроков по card_balance:", error);
    return [];
  }
}

// Функция для получения суммарного баланса пользователя (PF + карта)
function getTotalBalance(userId) {
  const stmt = db.prepare('SELECT balance, card_balance FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return (result?.balance || 0) + (result?.card_balance || 0);
}


// Функция для установки referral_bonus_amount всем пользователям (из конфига)
function setReferralBonusForAllUsers(bonusAmount) {
  const { REFERRAL_BONUS_REFERRER_PF } = require('./config');
  const finalBonus = REFERRAL_BONUS_REFERRER_PF; // всегда из конфига
  try {
      const stmt = db.prepare('UPDATE users SET referral_bonus_amount = ?');
      const info = stmt.run(finalBonus);
      if (info.changes > 0) {
          console.log(`[DEBUG] Успешно обновлено referral_bonus_amount для всех пользователей. Значение: ${finalBonus} (из конфига)`);
          return { success: true };
      } else {
          console.error(`[DEBUG] Не удалось обновить referral_bonus_amount для пользователей.`);
          return { success: false, message: 'Нет пользователей для обновления.' };
      }
  } catch (error) {
      console.error('[DB] Ошибка при массовом обновлении бонуса:', error);
      return { success: false, message: error.message };
  }
}

// Функция для получения всех скинов пользователя по numeric_id
function getUserSkinsByNumericId(numericId) {
  const stmt = db.prepare(`
    SELECT s.id, s.name, s.rarity, s.file_name, us.serial_number
    FROM user_skins us
    JOIN skins s ON us.skin_id = s.id
    JOIN users u ON us.user_id = u.id
    WHERE u.numeric_id = ?
  `);
  return stmt.all(numericId);
}

function giveSkinToUser(userId, skinId) {
  try {
    // Получаем пользователя по Telegram ID или numeric_id
    const user = getUserByAnyId(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Проверяем, есть ли у пользователя этот скин
    const userHasSkin = getUserAvailableSkins(user.id).includes(skinId);
    if (userHasSkin) {
      return { success: false, message: 'Скин уже принадлежит пользователю', alreadyOwned: true };
    }

    // Получаем текущее количество серийных номеров для этого скина
    const skinStmt = db.prepare('SELECT total_serials FROM skins WHERE id = ?');
    const skinResult = skinStmt.get(skinId);
    if (!skinResult) {
      return { success: false, message: 'Скин не найден.' };
    }

    // Генерируем новый серийный номер
    const newSerialNumber = generateSerialNumber(skinId, skinResult.total_serials);

    // Добавляем запись в таблицу user_skins
    const insertStmt = db.prepare(`
      INSERT INTO user_skins (user_id, skin_id, serial_number)
      VALUES (?, ?, ?)
    `);
    const info = insertStmt.run(user.id, skinId, newSerialNumber);
    if (info.changes > 0) {
      // Увеличиваем счетчик серийных номеров для скина
      const updateSkinStmt = db.prepare('UPDATE skins SET total_serials = total_serials + 1 WHERE id = ?');
      updateSkinStmt.run(skinId);
      return { success: true, message: 'Скин успешно добавлен.', serial: newSerialNumber };
    } else {
      return { success: false, message: 'Не удалось добавить скин.' };
    }
  } catch (error) {
    console.error('Ошибка при добавлении скина:', error);
    return { success: false, message: 'Произошла ошибка при добавлении скина.' };
  }
}

function takeSkinFromUser(userId, skinId) {
  try {
    // Получаем пользователя по Telegram ID или numeric_id
    const user = getUserByAnyId(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Проверяем, есть ли у пользователя этот скин
    const userHasSkin = getUserAvailableSkins(user.id).includes(skinId);
    if (!userHasSkin) {
      return { success: false, message: 'У пользователя нет такого скина.' };
    }

    // Удаляем скин из таблицы user_skins
    const deleteStmt = db.prepare('DELETE FROM user_skins WHERE user_id = ? AND skin_id = ?');
    const info = deleteStmt.run(user.id, skinId);
    if (info.changes > 0) {
      return { success: true, message: 'Скин успешно забран.' };
    } else {
      return { success: false, message: 'Не удалось забрать скин.' };
    }
  } catch (error) {
    console.error('Ошибка при забирании скина:', error);
    return { success: false, message: 'Произошла ошибка при забирании скина.' };
  }
}

function getUserByAnyId(identifier) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ? OR numeric_id = ?');
  return stmt.get(identifier.toString(), parseInt(identifier, 10));
}


// Вспомогательная функция для получения numeric_id по Telegram ID
async function getNumericIdByUserId(userId) {
  const stmt = db.prepare('SELECT numeric_id FROM users WHERE id = ?');
  const result = stmt.get(userId);
  return result?.numeric_id || null;
}

// Блокировка переводов для пользователя по numeric_id
function blockTransfersByNumericId(numericId) {
  const stmt = db.prepare('UPDATE users SET transfers_blocked = 1 WHERE numeric_id = ?');
  stmt.run(numericId);
}

// Разблокировка переводов для пользователя по numeric_id
function unblockTransfersByNumericId(numericId) {
  const stmt = db.prepare('UPDATE users SET transfers_blocked = 0 WHERE numeric_id = ?');
  stmt.run(numericId);
}

// Проверка, заблокированы ли переводы у пользователя по numeric_id
function areTransfersBlockedByNumericId(numericId) {
  const stmt = db.prepare('SELECT transfers_blocked FROM users WHERE numeric_id = ?');
  const result = stmt.get(numericId);
  return result ? !!result.transfers_blocked : false;
}

// Функция для обнуления аккаунта пользователя
function resetAccount(userId) {
  try {
    // Начинаем транзакцию
    db.exec('BEGIN TRANSACTION;');

    const user = getUserById(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    const numericId = user.numeric_id;

    // Сбрасываем все данные пользователя, сохраняя только numeric_id
    const stmt = db.prepare(`
      UPDATE users SET
          username = 'Press Эфыч',
          balance = 0,
          df_balance = 0,
          card_balance = 0,
          npf_shares = 0,
          container_type_1 = 0,
          container_type_2 = 0,
          container_type_3 = 0,
          last_bonus_time = 0,
          referrer_id = NULL,
          referral_join_date = NULL,
          referral_bonus_amount = 0,
          likes_received = 0,
          dislikes_received = 0,
          status_ids = '[]',
          form_ids = '[]',
          transfers_blocked = FALSE,
          is_hidden_in_top = 0,
          special_prefix_ids = '[]',
          is_registered = FALSE,
          attack_power = 1,
          energy = 0,
          last_energy_restore = 0,
          active_weapon = 'fist',
          owned_weapons = '[]'
      WHERE id = ?
    `);
    stmt.run(userId.toString());

    // Очищаем связанные записи в других таблицах
    db.prepare('DELETE FROM user_skins WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM promo_activations WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM mutes WHERE user_id = ?').run(userId.toString());
    db.prepare('DELETE FROM user_weapon_durability WHERE user_id = ?').run(userId.toString()); // Добавляем очистку прочности оружия

    // Завершаем транзакцию
    db.exec('COMMIT;');

    return { success: true, message: 'Аккаунт успешно обнулен.' };
  } catch (error) {
    // Откатываем транзакцию в случае ошибки
    db.exec('ROLLBACK;');
    console.error('Ошибка при обнулении аккаунта:', error);
    return { success: false, message: 'Произошла ошибка при обнулении аккаунта.' };
  }
}
// Функция для вычитания рефералов у пользователя
function subtractReferrals(userId, count) {
  try {
      // Получаем текущих рефералов пользователя
      const referrals = getReferralsByReferrerId(userId);
      if (referrals.length < count) {
          return { success: false, message: 'Недостаточно рефералов для вычитания.' };
      }
      
      // Получаем ID последних N рефералов для удаления связи
      const referralIdsToRemove = referrals.slice(-count).map(r => r.id);
      
      // Удаляем связь с реферером у выбранных рефералов
      const removeStmt = db.prepare(`
          UPDATE users 
          SET referrer_id = NULL 
          WHERE id IN (${referralIdsToRemove.map(() => '?').join(',')})
      `);
      removeStmt.run(...referralIdsToRemove);
      
      return { success: true };
  } catch (error) {
      console.error('[DB] Ошибка при вычитании рефералов:', error);
      return { success: false, message: 'Произошла ошибка при обновлении данных.' };
  }
}
 
// Функция для проверки, скрыт ли пользователь в топе
function isUserHiddenInTop(userId) {
  const stmt = db.prepare('SELECT is_hidden_in_top FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return !!result?.is_hidden_in_top;
}

// Функция для обновления состояния видимости в топе
function toggleUserVisibilityInTop(userId, hide = true) {
  const stmt = db.prepare('UPDATE users SET is_hidden_in_top = ? WHERE id = ?');
  const info = stmt.run(hide ? 1 : 0, userId.toString());
  return info.changes > 0; // Возвращаем true, если обновление прошло успешно
}

function createSpecialPrefix(prefix, createdBy) {
  const insertStmt = db.prepare('INSERT INTO special_prefixes (prefix, created_by) VALUES (?, ?)');
  const selectStmt = db.prepare('SELECT * FROM special_prefixes WHERE prefix = ?');
  try {
    // Проверяем, что префикс уникален
    const existingPrefix = selectStmt.get(prefix);
    if (existingPrefix) {
      return { success: false, message: '❌ Префикс уже существует.' };
    }

    // Убедимся, что createdBy является строкой
    const createdByString = String(createdBy);

    // Создаём новый префикс
    insertStmt.run(prefix, createdByString);

    // Получаем только что созданный префикс
    const newPrefix = selectStmt.get(prefix);
    if (!newPrefix) {
      throw new Error('Не удалось получить созданный префикс.');
    }

    console.log(`[SPECIAL_PREFIX] Префикс "${prefix}" успешно создан с ID ${newPrefix.id}.`);
    return { success: true, message: `✅ Специальный префикс "${prefix}" успешно создан с ID ${newPrefix.id}.` };
  } catch (error) {
    console.error('[SPECIAL_PREFIX] Ошибка при создании префикса:', error);
    return { success: false, message: '❌ Произошла ошибка при создании префикса.' };
  }
}

// Функция для получения всех специальных префиксов
function getAllSpecialPrefixes() {
  const stmt = db.prepare('SELECT * FROM special_prefixes');
  return stmt.all();
}

// Функция для удаления специального префикса
function deleteSpecialPrefix(prefixId) {
  const stmt = db.prepare('DELETE FROM special_prefixes WHERE id = ?');
  try {
    const info = stmt.run(prefixId);
    if (info.changes > 0) {
      console.log(`[SPECIAL_PREFIX] Префикс с ID ${prefixId} успешно удален.`);
      return { success: true, message: 'Префикс успешно удален.' };
    } else {
      return { success: false, message: 'Префикс не найден.' };
    }
  } catch (error) {
    console.error('[SPECIAL_PREFIX] Ошибка при удалении префикса:', error);
    return { success: false, message: 'Ошибка при удалении префикса.' };
  }
}

async function assignSpecialPrefixToUser(numericId, prefixId) {
  try {
    // Получаем пользователя по numeric_id
    const user = await getUserByNumericId(numericId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Получаем текущие специальные префиксы пользователя
    let specialPrefixIds = JSON.parse(user.special_prefix_ids || '[]');

    // Проверяем, есть ли уже такой префикс у пользователя
    if (specialPrefixIds.includes(prefixId)) {
      return { success: false, message: 'У пользователя уже есть этот префикс.' };
    }

    // Добавляем префикс в массив
    specialPrefixIds.push(prefixId);

    // Обновляем поле special_prefix_ids в базе данных
    await updateUserFieldByNumericId(numericId, 'special_prefix_ids', JSON.stringify(specialPrefixIds));

    return { success: true, message: 'Префикс успешно выдан.' };
  } catch (error) {
    console.error('[ASSIGN_SPECIAL_PREFIX] Ошибка:', error);
    return { success: false, message: 'Произошла ошибка при выдаче префикса.' };
  }
}

async function removeSpecialPrefixFromUser(numericId, prefixId) {
  try {
    // Получаем пользователя по numeric_id
    const user = await getUserByNumericId(numericId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    // Получаем текущие специальные префиксы пользователя
    let specialPrefixIds = JSON.parse(user.special_prefix_ids || '[]');

    // Проверяем, есть ли такой префикс у пользователя
    if (!specialPrefixIds.includes(prefixId)) {
      return { success: false, message: 'У пользователя нет этого префикса.' };
    }

    // Удаляем префикс из массива
    specialPrefixIds = specialPrefixIds.filter(id => id !== prefixId);

    // Обновляем поле special_prefix_ids в базе данных
    await updateUserFieldByNumericId(numericId, 'special_prefix_ids', JSON.stringify(specialPrefixIds));

    return { success: true, message: 'Префикс успешно забран.' };
  } catch (error) {
    console.error('[REMOVE_SPECIAL_PREFIX] Ошибка:', error);
    return { success: false, message: 'Произошла ошибка при забирании префикса.' };
  }
}

// Функция для получения специального префикса по ID
function getSpecialPrefixById(id) {
  try {
    // Подготовленный SQL-запрос для получения префикса по ID
    const stmt = db.prepare('SELECT * FROM special_prefixes WHERE id = ?');
    const result = stmt.get(id);

    // Если префикс найден, возвращаем его
    if (result) {
      return result;
    }

    // Если префикс не найден, возвращаем null
    console.log(`[GET_SPECIAL_PREFIX] Префикс с ID ${id} не найден.`);
    return null;
  } catch (error) {
    console.error('[GET_SPECIAL_PREFIX] Ошибка при получении префикса:', error);
    return null;
  }
}

// Функция для получения топа рефереров
function getTopReferrers() {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.id AS telegram_id,
        u.numeric_id,
        u.username,
        u.disable_hyperlink,
        COUNT(r.id) AS referrals_count
      FROM users u
      LEFT JOIN users r ON r.referrer_id = u.id
      WHERE u.username IS NOT NULL
      GROUP BY u.id
      ORDER BY referrals_count DESC
      LIMIT 12
    `);
    const topReferrers = stmt.all();

    // Формируем результат в виде массива объектов
    return topReferrers.map(referrer => ({
      numeric_id: referrer.numeric_id,
      telegram_id: referrer.telegram_id,
      username: referrer.username,
      disable_hyperlink: !!referrer.disable_hyperlink,
      referrals_count: referrer.referrals_count || 0, // Количество рефералов
    }));
  } catch (error) {
    console.error("Ошибка при получении топа рефереров:", error);
    return [];
  }
}

function hasUnansweredReports(userId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM reports WHERE user_id = ? AND status = ?');
  const result = stmt.get(userId.toString(), 'not_answered');
  return result.count > 0;
}


function getUsersByStatus(statusName) {
  const stmt = db.prepare(`
    SELECT 
      u.id AS telegram_id,
      u.numeric_id,
      u.username
    FROM users u
    JOIN statuses s ON s.id IN (SELECT value FROM json_each(u.status_ids))
    WHERE s.name = ?
  `);
  return stmt.all(statusName);
}

function beginTransaction() {
  db.prepare('BEGIN TRANSACTION').run();
}

function commitTransaction() {
  db.prepare('COMMIT').run();
}

function rollbackTransaction() {
  db.prepare('ROLLBACK').run();
}

function updateUserData(userId, updates) {
  try {
    const keys = Object.keys(updates);
    const values = Object.values(updates);

    // Преобразуем значения в допустимые для SQLite типы
    const processedValues = values.map((value) => {
      if (typeof value === 'boolean') {
        return value ? 1 : 0; // Преобразуем boolean в число (true -> 1, false -> 0)
      }
      return value;
    });

    // Проверяем, что все значения допустимы для SQLite
    processedValues.forEach((value, index) => {
      if (
        typeof value !== 'number' &&
        typeof value !== 'string' &&
        typeof value !== 'bigint' &&
        value !== null &&
        !(value instanceof Buffer)
      ) {
        throw new TypeError(
          `SQLite3 can only bind numbers, strings, bigints, buffers, and null. Invalid value at index ${index}: ${value}`
        );
      }
    });

    // Формируем SQL-запрос
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const query = `UPDATE users SET ${setClause} WHERE id = ?`;
    return db.prepare(query).run(...processedValues, userId);
  } catch (error) {
    console.error('[DB] Ошибка при обновлении данных пользователя:', error);
    throw error;
  }
}

function getSeasonalReferralsByReferrerId(referrerId) {
  const stmt = db.prepare(`
    SELECT 
      id, 
      username, 
      is_registered,
      registration_date 
    FROM users 
    WHERE 
      referrer_id = ? 
      AND is_registered = 1
      AND registration_date >= ?
  `);
  
  const cutoffDate = Math.floor(new Date('2025-06-23').getTime() / 1000);
  
  const referrals = stmt.all(referrerId, cutoffDate);
  console.log(`[DEBUG] Рефералы для реферера ${referrerId} (после 23 июня):`, referrals);
  
  return referrals;
}

function getTopSeasonalReferrers() {
  try {
    const cutoffDate = Math.floor(new Date('2025-06-23').getTime() / 1000);
    const stmt = db.prepare(`
      SELECT 
        u.id AS telegram_id,
        u.numeric_id,
        u.username,
        COUNT(r.id) AS referrals_count
      FROM users u
      LEFT JOIN users r ON u.id = r.referrer_id
      WHERE 
        r.is_registered = 1
        AND r.registration_date >= ?
      GROUP BY u.id
      ORDER BY referrals_count DESC
    `);
    return stmt.all(cutoffDate);
  } catch (error) {
    console.error("Ошибка при получении сезонного топа рефереров:", error);
    return [];
  }
}

// Создание таблицы для аукциона
db.prepare(`
  CREATE TABLE IF NOT EXISTS auction (
    id INTEGER PRIMARY KEY,
    prize TEXT NOT NULL,
    minBet INTEGER NOT NULL,
    minStep INTEGER NOT NULL,
    highestBid INTEGER,
    highestBidder TEXT,
    participants TEXT,
    bids TEXT,
    isFinished BOOLEAN DEFAULT 0
  )
`).run();

function getAuctionState() {
  const stmt = db.prepare('SELECT * FROM auction LIMIT 1');
  const result = stmt.get();
  if (!result) return null;

  return {
    ...result,
    participants: JSON.parse(result.participants || '[]'),
    bids: JSON.parse(result.bids || '[]').map(bid => ({
      userId: bid.userId,
      telegramId: bid.telegramId, // Добавляем telegramId
      amount: bid.amount,
    })),
    isFinished: Boolean(result.isFinished),
  };
}

function saveAuctionState(auction) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO auction (
      id, prize, minBet, minStep, highestBid, highestBidder, participants, bids, isFinished
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    1,
    auction.prize,
    auction.minBet,
    auction.minStep,
    auction.highestBid,
    auction.highestBidder?.userId || null,
    JSON.stringify(auction.participants),
    JSON.stringify(auction.bids.map(bid => ({
      userId: bid.userId,
      telegramId: bid.telegramId, // Сохраняем telegramId
      amount: bid.amount,
    }))),
    auction.isFinished ? 1 : 0
  );
}

// Создание таблицы для боссов
db.prepare(`
  CREATE TABLE IF NOT EXISTS bosses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,          -- Название босса
    phase INTEGER DEFAULT 1,     -- Фаза босса
    start_time INTEGER,          -- Время начала боя (UNIX timestamp)
    imageFile TEXT,              -- Имя файла изображения
    phase1_hp INTEGER DEFAULT 0, -- Текущее здоровье для первой фазы
    phase2_hp INTEGER DEFAULT 0, -- Текущее здоровье для второй фазы
    phase1_max_hp INTEGER DEFAULT 0, -- Максимальное здоровье для первой фазы
    phase2_max_hp INTEGER DEFAULT 0, -- Максимальное здоровье для второй фазы
    correct_button_index INTEGER DEFAULT NULL,
    prize_type TEXT,             -- Тип приза (например, "gold", "coins")
    prize_amount REAL            -- Количество приза
  );
`).run();

function addNewBoss(name, imageFile, hp, prizeType, prizeAmount) {
  const phase1MaxHp = Math.floor(hp / 2); // Максимальное здоровье для первой фазы
  const phase2MaxHp = Math.ceil(hp / 2); // Максимальное здоровье для второй фазы

  // Проверяем, что prizeType и prizeAmount определены
  if (!prizeType || !prizeAmount) {
    console.error(`[DEBUG] addNewBoss: Некорректные данные приза: prizeType=${prizeType}, prizeAmount=${prizeAmount}`);
    throw new Error('Некорректные данные приза.');
  }

  const stmt = db.prepare(`
    INSERT INTO bosses (
      name,
      imageFile,
      phase1_hp,
      phase2_hp,
      phase1_max_hp,
      phase2_max_hp,
      prize_type,
      prize_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const result = stmt.run(
      name, // Название босса
      imageFile, // Файл изображения
      phase1MaxHp, // Текущее здоровье для первой фазы
      phase2MaxHp, // Текущее здоровье для второй фазы
      phase1MaxHp, // Максимальное здоровье для первой фазы
      phase2MaxHp, // Максимальное здоровье для второй фазы
      prizeType, // Тип приза
      prizeAmount // Количество приза
    );

    console.log(`📝 <b>Босс успешно добавлен в базу данных:</b>
    ├ Название: ${name}
    ├ Файл изображения: ${imageFile}
    ├ HP: ${hp}
    ├ Тип приза: ${prizeType}
    ├ Количество приза: ${prizeAmount}`);

    return result; // Возвращаем результат выполнения запроса
  } catch (error) {
    console.error('[ERROR] addNewBoss:', error);
    throw error;
  }
}

// Функция для создания ссылки на пользователя с учетом анонимности
function createUserLink(userId, username, disableHyperlink) {
  const escapedUsername = username
      ? username.replace(/([<>&"'])/g, (match) => {
            const escapeMap = {
                '<': '<',
                '>': '>',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;',
            };
            return escapeMap[match];
        })
      : 'Неизвестный';

  if (disableHyperlink) {
      return escapedUsername;
  }

  return `<a href="tg://user?id=${userId}">${escapedUsername}</a>`;
}

const { telegram } = require('telegraf');

async function distributePrizesToTopPlayers(ctx, boss, fixedPrizeAmount) {
  try {
      // Проверяем, что fixedPrizeAmount является числом и больше 0
      if (isNaN(fixedPrizeAmount) || fixedPrizeAmount <= 0) {
          console.error('[DEBUG] distributePrizesToTopPlayers: Некорректное значение fixedPrizeAmount:', fixedPrizeAmount);
          throw new Error('Некорректное значение fixedPrizeAmount.');
      }

      // Получаем топ-игроков по нанесенному урону (ограничиваем до 2 игроков для теста)
      const topPlayers = getTopPlayersByBossDamage();
      if (topPlayers.length === 0) {
          return 'Отчет о раздаче призов: Нет игроков для распределения призов.';
      }

      // Формируем отчет
      let report = `🏆 Отчет о раздаче призов:\n`;
      report += `Босс: <b>${boss.name}</b>\n`;
      report += `Тип приза: <b>${boss.prize_type}</b>\n`;
      report += `Количество приза на игрока: <b>${fixedPrizeAmount}</b>\n`;
      report += `Количество участников: <b>${Math.min(topPlayers.length, 25)}</b>\n`;

      // Распределяем призы только первым 2 участникам
      for (let i = 0; i < Math.min(topPlayers.length, 25); i++) {
          const player = topPlayers[i];
          try {
              // Начисляем приз игроку
              awardPrizeToPlayer(player.id, boss.prize_type, fixedPrizeAmount);

              // Создаем ссылку на пользователя
              const userLink = createUserLink(player.id, player.username);

              // Формируем строку отчета
              report += `• ${userLink}: <b>${fixedPrizeAmount} ${boss.prize_type}</b>\n`;

              // Отправляем уведомление игроку
              await ctx.telegram.sendMessage(
                  player.id,
                  `🎉 Вы заняли место в топе по урону боссу! Ваш приз: <b>${fixedPrizeAmount} PF</b>.`,
                  { parse_mode: 'HTML' }
              );
          } catch (error) {
              console.error(`Ошибка при начислении приза игроку ${player.id}:`, error);
              report += `• Ошибка при начислении приза игроку ${player.id}\n`;
          }
      }

      return report;
  } catch (error) {
      console.error('Ошибка при распределении призов:', error);
      return 'Произошла ошибка при распределении призов.';
  }
}

function awardPrizeToPlayer(userId, prizeType, amount) {
  try {
      // Проверяем корректность данных приза
      if (!prizeType || isNaN(amount) || amount <= 0) {
          console.error(`[DEBUG] awardPrizeToPlayer: Некорректные данные приза: prizeType=${prizeType}, amount=${amount}`);
          throw new Error('Некорректные данные приза.');
      }

      // Подготавливаем SQL-запрос для обновления баланса
      const stmt = db.prepare(`
          UPDATE users 
          SET ${prizeType} = ${prizeType} + ? 
          WHERE id = ?
      `);

      // Выполняем запрос
      stmt.run(amount, userId.toString());

      console.log(`[DEBUG] awardPrizeToPlayer: Приз начислен пользователю с ID=${userId}: ${amount} ${prizeType}`);
  } catch (error) {
      console.error('[ERROR] Ошибка при начислении приза:', error);
      throw new Error('Не удалось начислить приз.');
  }
}

// Получение информации о текущем боссе
function getCurrentBoss() {
  const stmt = db.prepare(`
    SELECT * FROM bosses ORDER BY id DESC LIMIT 1
  `);
  return stmt.get(); // Возвращает последнего добавленного босса
}

function updateBossState(bossId, newHp, currentPhase) {
  const stmt = db.prepare(`
    UPDATE bosses
    SET ${currentPhase === 1 ? 'phase1_hp' : 'phase2_hp'} = ?
    WHERE id = ?
  `);

  return stmt.run(newHp, bossId);
}

// Функция для перехода ко второй фазе
function transitionToPhase2(bossId) {
  const stmt = db.prepare(`
    UPDATE bosses
    SET phase = 2, phase2_hp = phase2_max_hp
    WHERE id = ?
  `);

  return stmt.run(bossId);
}

function getMaxEnergyByStatus(userId) {
  const userStatuses = getUserStatusesSync(userId); // Предполагается, что такая функция уже существует
  if (!userStatuses || userStatuses.length === 0) {
    return 10; // Базовое значение (10)
  }

  const statusEnergyMap = {
    'GOLD': 20,
    'PLATINUM': 30,
    'DIAMOND': 40,
    'Администратор': 50,
    'Тех администратор': 150, // Особый случай
  };

  let maxEnergy = 10;
  for (const status of userStatuses) {
    if (status in statusEnergyMap && statusEnergyMap[status] > maxEnergy) {
      maxEnergy = statusEnergyMap[status];
    }
  }

  console.log(`[DEBUG] getMaxEnergyByStatus: userId=${userId}, maxEnergy=${maxEnergy}`);
  return maxEnergy;
}

function restoreEnergy(userId) {
  const user = getUserById(userId);
  if (!user || user.energy === null || user.last_energy_restore === null) {
    console.error(`[DEBUG] restoreEnergy: Некорректные данные для userId=${userId}: energy=${user?.energy}, lastEnergyRestore=${user?.last_energy_restore}`);
    
    // Устанавливаем начальные значения, если данных нет
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('UPDATE users SET energy = ?, last_energy_restore = ? WHERE id = ?');
    stmt.run(0, now, userId.toString()); // Начальная энергия = 0
    return;
  }

  const now = Math.floor(Date.now() / 1000); // Текущее время в секундах
  const timeSinceLastRestore = now - user.last_energy_restore; // Время с последнего восстановления
  const energyToRestore = Math.floor(timeSinceLastRestore / 300); // 300 секунд = 5 минут

  if (energyToRestore > 0) {
    const maxEnergy = getMaxEnergyByStatus(userId); // Получаем максимальное значение энергии
    const newEnergy = Math.min(user.energy + energyToRestore, maxEnergy); // Не превышаем максимум
    const nextRestoreTime = user.last_energy_restore + Math.ceil((newEnergy - user.energy) / 1) * 300;

    // Обновляем данные в базе данных
    const stmt = db.prepare('UPDATE users SET energy = ?, last_energy_restore = ? WHERE id = ?');
    stmt.run(newEnergy, now, userId.toString());

    console.log(`[DEBUG] restoreEnergy: userId=${userId}, currentEnergy=${user.energy}, maxEnergy=${maxEnergy}, newEnergy=${newEnergy}, nextRestoreTime=${nextRestoreTime}`);
  }
}


function getCurrentEnergy(userId) {
  restoreEnergy(userId); // Сначала восстанавливаем энергию
  const user = getUserById(userId);

  if (!user || user.energy === null) {
    console.error(`[DEBUG] getCurrentEnergy: Некорректные данные для userId=${userId}: energy=${user?.energy}`);
    return 0;
  }

  console.log(`[DEBUG] getCurrentEnergy: userId=${userId}, energy=${user.energy}`);
  return user.energy;
}

function getUserAttackPower(userId) {
  const stmt = db.prepare('SELECT attack_power FROM users WHERE id = ?');
  const user = stmt.get(userId);
  return user ? user.attack_power || 1 : 1; // Если attack_power не установлено, используем значение по умолчанию (1)
}

function reduceUserEnergy(userId) {
  const stmt = db.prepare('UPDATE users SET energy = energy - 1 WHERE id = ?');
  return stmt.run(userId);
}

function getUserEnergyData(userId) {
  const stmt = db.prepare('SELECT energy, last_energy_restore FROM users WHERE id = ? OR numeric_id = ?');
  return stmt.get(userId.toString(), userId.toString());
}

function updateUserEnergy(userId, newEnergy, lastEnergyRestore) {
  const stmt = db.prepare('UPDATE users SET energy = ?, last_energy_restore = ? WHERE id = ? OR numeric_id = ?');
  return stmt.run(newEnergy, lastEnergyRestore, userId.toString(), userId.toString());
}

function updateAttackPower(userId, newAttackPower) {
  const stmt = db.prepare('UPDATE users SET attack_power = ? WHERE id = ? OR numeric_id = ?');
  stmt.run(newAttackPower, userId.toString(), userId.toString());
}

// Таблица для хранения нанесённого урона боссу
db.prepare(`
  CREATE TABLE IF NOT EXISTS boss_damage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL, -- ID пользователя
      damage INTEGER DEFAULT 0, -- Нанесённый урон
      timestamp INTEGER NOT NULL -- Время (UNIX timestamp)

  )
`).run();

function getUsersWithDamage() {
  const stmt = db.prepare('SELECT DISTINCT user_id FROM boss_damage WHERE damage > 0');
  return stmt.all();
}


// Функция для получения топа игроков по нанесённому урону боссу
function getTopPlayersByBossDamage() {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.id AS id, -- Переименовываем на id для совместимости
        u.numeric_id,
        u.username,
        SUM(bd.damage) AS total_damage
      FROM users u
      LEFT JOIN boss_damage bd ON u.id = bd.user_id
      GROUP BY u.id
      ORDER BY total_damage DESC
    `);

    // Получаем всех игроков без ограничения LIMIT
    const allPlayers = stmt.all();

    // Возвращаем всех игроков с их данными
    return allPlayers.map(player => ({
      numeric_id: player.numeric_id || 'Не найден', // Numeric ID
      id: player.id || 'Не найден', // Telegram ID (переименовано из telegram_id)
      username: player.username || 'Неизвестный', // Никнейм
      total_damage: player.total_damage || 0, // Общий нанесённый урон
    }));
  } catch (error) {
    console.error('[DB] Ошибка при получении топа игроков по урону:', error);
    return [];
  }
}

// Функция для добавления урона по боссу пользователю
function addBossDamageToUser(userId, damage) {
  try {
      // Добавляем запись о нанесённом уроне
      const insertStmt = db.prepare('INSERT INTO boss_damage (user_id, damage, timestamp) VALUES (?, ?, ?)');
      insertStmt.run(userId.toString(), damage, Math.floor(Date.now() / 1000));

      console.log(`[BOSS DAMAGE] Урон ${damage} успешно добавлен пользователю с ID=${userId}.`);
      return { success: true };
  } catch (error) {
      console.error(`[BOSS DAMAGE] Ошибка при добавлении урона пользователю с ID=${userId}:`, error);
      return { success: false, message: 'Произошла ошибка при обновлении данных.' };
  }
}

// Функция для получения активного оружия с поддержкой кулака по умолчанию
function getActiveWeapon(userId) {
  const stmt = db.prepare(`
    SELECT w.*
    FROM users u
    LEFT JOIN weapons w ON u.active_weapon = w.id
    WHERE u.id = ?
  `);
  let weapon = stmt.get(userId.toString());

  // Если активное оружие не найдено, возвращаем кулак по умолчанию
  if (!weapon || !weapon.name) {
    return db.prepare('SELECT * FROM weapons WHERE name = ?').get('Кулак');
  }

  return weapon;
}

// Создание таблицы weapons
db.prepare(`
  CREATE TABLE IF NOT EXISTS weapons (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID оружия
    name TEXT NOT NULL, -- Название оружия
    image_file TEXT NOT NULL, -- Название файла изображения оружия
    base_damage INTEGER NOT NULL, -- Базовый урон оружия
    price INTEGER NOT NULL, -- Стоимость оружия
    price_type TEXT NOT NULL, -- Тип стоимости (например, "PF" или "DF")
    is_visible_in_shop INTEGER DEFAULT 1, -- Отображается ли оружие в магазине (1 = да, 0 = нет)
    is_visible_in_case INTEGER DEFAULT 1, -- Отображается ли оружие в кейсе (1 = да, 0 = нет)
    width INTEGER NOT NULL, -- Ширина изображения оружия
    height INTEGER NOT NULL, -- Высота изображения оружия
    x_position INTEGER NOT NULL, -- Координата X (слева)
    y_position INTEGER NOT NULL, -- Координата Y (снизу)
    durability INTEGER NOT NULL -- Максимальная прочность оружия
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS user_weapon_durability (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Уникальный ID записи
    user_id TEXT NOT NULL, -- ID пользователя
    weapon_id INTEGER NOT NULL, -- ID оружия
    current_durability INTEGER NOT NULL, -- Текущая прочность оружия
    FOREIGN KEY(weapon_id) REFERENCES weapons(id),
    UNIQUE(user_id, weapon_id) -- Каждый пользователь может иметь только одну запись для каждого оружия
  )
`).run();

// Функция для добавления оружия, если его еще нет в базе данных
function insertWeaponIfNotExists(
  name,
  imageFile,
  baseDamage,
  price,
  priceType,
  isVisibleInShop = 1,
  isVisibleInCase = 1,
  width,
  height,
  xPosition,
  yPosition,
  durability // Новая позиция
) {
  const stmt = db.prepare('SELECT * FROM weapons WHERE name = ?');
  const existingWeapon = stmt.get(name);

  if (!existingWeapon) {
    const insertStmt = db.prepare(`
      INSERT INTO weapons (
        name, image_file, base_damage, price, price_type, 
        is_visible_in_shop, is_visible_in_case, 
        width, height, x_position, y_position, durability
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      name,
      imageFile,
      baseDamage,
      price,
      priceType,
      isVisibleInShop,
      isVisibleInCase,
      width,
      height,
      xPosition,
      yPosition,
      durability // Вставка значения прочности
    );
    console.log(`[WEAPONS] Оружие "${name}" успешно добавлено.`);
  } else {
  }
}

function reduceWeaponDurability(userId, weaponId, amount = 1) {
  const stmt = db.prepare(`
    INSERT INTO user_weapon_durability (user_id, weapon_id, current_durability)
    VALUES (?, ?, (SELECT durability FROM weapons WHERE id = ?))
    ON CONFLICT(user_id, weapon_id) DO UPDATE SET
      current_durability = MAX(current_durability - ?, 0)
    RETURNING current_durability
  `);

  console.log(`[DEBUG] reduceWeaponDurability: userId=${userId}, weaponId=${weaponId}, amount=${amount}`);

  const result = stmt.get(userId.toString(), weaponId, weaponId, amount);
  console.log(`[DEBUG] reduceWeaponDurability: Resulting durability=${result.current_durability}`);

  return result.current_durability === 0; // Возвращаем true, если оружие сломалось
}


function addWeaponToUser(userId, weaponId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Пользователь не найден.');
  }

  // Получаем текущий список оружий
  let ownedWeapons = [];
  try {
    ownedWeapons = JSON.parse(user.owned_weapons || '[]');
  } catch (error) {
    console.error(`[ERROR] Невозможно распарсить owned_weapons для пользователя ${userId}:`, error);
  }

  // Добавляем новое оружие, если его еще нет в списке
  if (!ownedWeapons.includes(weaponId)) {
    ownedWeapons.push(weaponId);

    // Обновляем запись в базе данных
    const stmt = db.prepare('UPDATE users SET owned_weapons = ? WHERE id = ?');
    stmt.run(JSON.stringify(ownedWeapons), userId);
    console.log(`[DEBUG] Оружие с ID ${weaponId} добавлено для пользователя ${userId}.`);
  }
}

function getOwnedWeapons(userId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Пользователь не найден.');
  }

  let ownedWeapons = [];
  try {
    ownedWeapons = JSON.parse(user.owned_weapons || '[]');
  } catch (error) {
    console.error(`[ERROR] Невозможно распарсить owned_weapons для пользователя ${userId}:`, error);
  }

  return ownedWeapons;
}


function removeBrokenWeapon(userId, weaponId) {
  console.log(`[DEBUG] removeBrokenWeapon: userId=${userId}, weaponId=${weaponId}`);

  try {
    // Удаляем оружие из списка купленных
    const ownedWeapons = getOwnedWeapons(userId);
    const updatedOwnedWeapons = ownedWeapons.filter((id) => id !== weaponId);

    const stmt = db.prepare('UPDATE users SET owned_weapons = ? WHERE id = ?');
    const result = stmt.run(JSON.stringify(updatedOwnedWeapons), userId);
    console.log(`[DEBUG] removeBrokenWeapon: Updated owned_weapons. Changes=${result.changes}`);

    // Удаляем запись о прочности
    const durabilityStmt = db.prepare('DELETE FROM user_weapon_durability WHERE user_id = ? AND weapon_id = ?');
    const durabilityResult = durabilityStmt.run(userId, weaponId);
    console.log(`[DEBUG] removeBrokenWeapon: Deleted durability record. Changes=${durabilityResult.changes}`);

    console.log(`[WEAPONS] Оружие с ID ${weaponId} удалено для пользователя ${userId}.`);
  } catch (error) {
    console.error(`[ERROR] removeBrokenWeapon: Ошибка при удалении оружия.`, error);
  }
}

function switchToDefaultWeapon(userId) {
  console.log(`[DEBUG] switchToDefaultWeapon: userId=${userId}`);

  try {
    const defaultWeapon = getWeaponByName('Кулак');
    if (!defaultWeapon) {
      throw new Error('Кулак не найден в базе данных.');
    }

    const stmt = db.prepare('UPDATE users SET active_weapon = ? WHERE id = ?');
    const result = stmt.run(defaultWeapon.id, userId);

    console.log(`[DEBUG] switchToDefaultWeapon: Active weapon set to Кулак. Changes=${result.changes}`);
  } catch (error) {
    console.error(`[ERROR] switchToDefaultWeapon: Ошибка при переключении на Кулак.`, error);
  }
}

// Добавляем начальные записи в таблицу weapons
insertWeaponIfNotExists(
  'Кулак', // Название
  'fist.png', // Изображение
  1, // Базовый урон
  0, // Цена
  'PF', // Тип цены
  0, // Видимость в магазине
  0, // Видимость в кейсе
  80, // Ширина
  80, // Высота
  170, // Координата X
  688, // Координата Y
  -1 // Прочность (бесконечная)
);

insertWeaponIfNotExists(
  'Дубинка', // Название
  'club.png', // Изображение
  50, // Базовый урон
  300000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине
  1, // Видимость в кейсе
  145, // Ширина
  145, // Высота
  140, // Координата X
  655, // Координата Y
  1 // Прочность
);

insertWeaponIfNotExists(
  'Пистолет', // Название
  'pistol.png', // Изображение
  120, // Базовый урон
  900000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине
  1, // Видимость в кейсе
  100, // Ширина
  110, // Высота
  168, // Координата X
  680, // Координата Y
  200 // Прочность
);

insertWeaponIfNotExists(
  'АК-47', // Название
  'ak47.png', // Изображение
  240, // Базовый урон
  2700000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине
  1, // Видимость в кейсе
  198, // Ширина
  148, // Высота
  118, // Координата X
  660, // Координата Y
  300 // Прочность
);

insertWeaponIfNotExists(
  'Деревянный меч', // Название
  'exclusive_sword.png', // Изображение
  500, // Базовый урон
  18500000, // Цена
  'PF', // Тип цены
  0, // Видимость в магазине
  1, // Видимость в кейсе
  130, // Ширина
  130, // Высота
  150, // Координата X
  660, // Координата Y
  500 // Прочность
);

// Добавление нового оружия: Бумажка
insertWeaponIfNotExists('Бумажка', // Название
  'list.png', // Изображение (файл должен быть в папке с изображениями)
  25, // Базовый урон
  42000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине (1 = да, 0 = нет)
  1, // Видимость в кейсе (1 = да, 0 = нет)
  200, // Ширина изображения
  200, // Высота изображения
  175, // Координата X (слева)
  688, // Координата Y (снизу)
  3 // Прочность (максимальная прочность оружия)
);

// Добавление нового оружия: Ручка
insertWeaponIfNotExists('Ручка', // Название
  'ruchka.png', // Изображение (файл должен быть в папке с изображениями)
  100, // Базовый урон
  750000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине (1 = да, 0 = нет)
  1, // Видимость в кейсе (1 = да, 0 = нет)
  200, // Ширина изображения
  200, // Высота изображения
  145, // Координата X (слева)
  637, // Координата Y (сверху)
  30 // Прочность (максимальная прочность оружия)
);

// Добавление нового оружия: Указка
insertWeaponIfNotExists('Указка', // Название
  'ukazka.png', // Изображение (файл должен быть в папке с изображениями)
  150, // Базовый урон
  1600000, // Цена
  'PF', // Тип цены
  1, // Видимость в магазине (1 = да, 0 = нет)
  1, // Видимость в кейсе (1 = да, 0 = нет)
  270, // Ширина изображения
  200, // Высота изображения
  139, // Координата X (слева)
  649, // Координата Y (сверху)
  100 // Прочность (максимальная прочность оружия)
);


// Функция для получения оружия по ID
function getWeaponById(weaponId) {
  const stmt = db.prepare('SELECT * FROM weapons WHERE id = ?');
  return stmt.get(weaponId);
}

// Функция для получения оружия по имени
function getWeaponByName(weaponName) {
  const stmt = db.prepare('SELECT * FROM weapons WHERE name = ?');
  return stmt.get(weaponName);
}

// Функция для установки активного оружия
function setActiveWeapon(userId, weaponId) {
  const stmt = db.prepare('UPDATE users SET active_weapon = ? WHERE id = ?');
  stmt.run(weaponId, userId.toString());
}

// Функция для получения всех видов оружия
function getAllWeapons() {
  const stmt = db.prepare(`
    SELECT 
      id, name, base_damage, price, price_type, 
      width, height, x_position, y_position, durability 
    FROM weapons
  `);
  return stmt.all();
}

// Функция для обнуления нанесенного урона боссу
function resetBossDamage() {
  const stmt = db.prepare('DELETE FROM boss_damage');
  stmt.run();
}

// Функция для уменьшения прокачки силы урона кулаков на 90%
function reduceAttackPowerBy90Percent() {
  const stmt = db.prepare('UPDATE users SET attack_power = CAST(attack_power * 0.1 AS INTEGER)');
  stmt.run();
}

function updateBossCorrectButtonIndex(bossId, correctButtonIndex) {
  const stmt = db.prepare('UPDATE bosses SET correct_button_index = ? WHERE id = ?');
  stmt.run(correctButtonIndex, bossId);
}

// Создание таблицы boss_state
db.prepare(`
  CREATE TABLE IF NOT EXISTS boss_state (
    id TEXT PRIMARY KEY, -- ID пользователя (уникальный)
    last_attack_time INTEGER DEFAULT 0, -- Время последней атаки (UNIX timestamp)
    boss_caller_id TEXT DEFAULT NULL -- ID вызвавшего босса
  )
`).run();

// Проверка наличия записи с id = 1
const checkBossStateRecord = db.prepare('SELECT COUNT(*) AS count FROM boss_state WHERE id = 1');
const recordExists = checkBossStateRecord.get().count > 0;

if (!recordExists) {
  // Если записи нет, создаем её
  const stmt = db.prepare('INSERT INTO boss_state (id, last_attack_time, boss_caller_id) VALUES (?, ?, ?)');
  stmt.run('1', 0, null);
  console.log('[DEBUG] Создана новая запись в boss_state с id = 1');
}

// Функция для получения времени последней атаки
function getLastAttackTime(userId) {
  const stmt = db.prepare('SELECT last_attack_time FROM boss_state WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result ? result.last_attack_time : null;
}

// Функция для обновления времени последней атаки
function updateLastAttackTime(userId, timestamp) {
  const stmt = db.prepare(`
    INSERT INTO boss_state (id, last_attack_time)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET last_attack_time = excluded.last_attack_time
  `);
  stmt.run(userId.toString(), timestamp);
}

function setBossCallerId(userId) {
  const stmt = db.prepare(`
    INSERT INTO boss_state (id, boss_caller_id)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET boss_caller_id = excluded.boss_caller_id
  `);
  stmt.run(userId.toString(), userId.toString()); // Сохраняем вызвавшего босса для конкретного пользователя

  // Логируем установку вызвавшего босса
  console.log(`[DEBUG] Установлен новый вызывающий босса для пользователя ID=${userId}`);
}


function getBossCallerId(userId) {
  if (!userId) {
    console.error('[DEBUG] getBossCallerId: userId не передан.');
    return null;
  }

  const stmt = db.prepare('SELECT boss_caller_id FROM boss_state WHERE id = ?');
  const result = stmt.get(userId.toString());
  const bossCallerId = result ? result.boss_caller_id : null;

  // Логируем получение вызвавшего босса
  console.log(`[DEBUG] Получен вызывающий босса для пользователя ID=${userId}: ${bossCallerId}`);
  return bossCallerId;
}

// Функция для получения текущей прочности оружия
function getCurrentWeaponDurability(userId, weaponId) {
  try {
    // Логируем входные параметры
    console.log(`[DEBUG] getCurrentWeaponDurability: userId=${userId}, weaponId=${weaponId}`);

    // Извлекаем текущую прочность из базы данных
    const stmt = db.prepare(`
      SELECT current_durability
      FROM user_weapon_durability
      WHERE user_id = ? AND weapon_id = ?
    `);
    const result = stmt.get(userId, weaponId);

    // Логируем результат запроса
    if (result) {
      console.log(`[DEBUG] getCurrentWeaponDurability: Found record - current_durability=${result.current_durability}`);
    } else {
      console.log(`[DEBUG] getCurrentWeaponDurability: No record found for userId=${userId}, weaponId=${weaponId}`);
    }

    // Если запись не найдена, возвращаем максимальную прочность оружия
    if (!result) {
      const weapon = getWeaponById(weaponId);
      if (weapon) {
        console.log(`[DEBUG] getCurrentWeaponDurability: Returning max durability=${weapon.durability}`);
        return weapon.durability;
      } else {
        console.log(`[DEBUG] getCurrentWeaponDurability: Weapon not found in database`);
        return 0; // Если оружие не найдено, возвращаем 0
      }
    }

    // Логируем возвращаемое значение
    console.log(`[DEBUG] getCurrentWeaponDurability: Returning current durability=${result.current_durability}`);
    return result.current_durability;
  } catch (error) {
    console.error('[ERROR] getCurrentWeaponDurability:', error);
    return 0; // Возвращаем 0 в случае ошибки
  }
}

// Создание таблицы для состояния атаки пользователей
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_attack_states (
      user_id TEXT PRIMARY KEY, -- Уникальный ID пользователя
      correct_button_index INTEGER, -- Индекс правильной кнопки
      message_id INTEGER, -- ID сообщения с кнопками
      created_at INTEGER NOT NULL -- Время создания состояния (UNIX timestamp)
  )
  `).run();
  
  function saveAttackState(userId, correctButtonIndex, messageId) {
    const stmt = db.prepare(`
        INSERT INTO user_attack_states (user_id, correct_button_index, message_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            correct_button_index = excluded.correct_button_index,
            message_id = excluded.message_id,
            created_at = excluded.created_at
    `);
    stmt.run(userId.toString(), correctButtonIndex, messageId, Math.floor(Date.now() / 1000));
}

function getAttackState(userId) {
  const stmt = db.prepare(`
      SELECT correct_button_index, message_id, created_at
      FROM user_attack_states
      WHERE user_id = ?
  `);
  return stmt.get(userId.toString());
}

function deleteAttackState(userId) {
  const stmt = db.prepare(`
      DELETE FROM user_attack_states
      WHERE user_id = ?
  `);
  stmt.run(userId.toString());
}

function cleanupOldAttackStates(maxAgeInSeconds = 600) {
  const cutoffTime = Math.floor(Date.now() / 1000) - maxAgeInSeconds;
  const stmt = db.prepare(`
      DELETE FROM user_attack_states
      WHERE created_at < ?
  `);
  stmt.run(cutoffTime);
}

function updateAttackMessageId(userId, messageId) {
  const stmt = db.prepare(`
    UPDATE user_attack_states
    SET message_id = ?
    WHERE user_id = ?
  `);
  stmt.run(messageId, userId.toString());
}

// Функция для получения нанесенного урона пользователем
function getBossDamageByUserId(userId) {
  try {
    // Запрос к базе данных для получения суммы нанесённого урона
    const stmt = db.prepare(`
      SELECT SUM(damage) AS total_damage
      FROM boss_damage
      WHERE user_id = ?
    `);

    const result = stmt.get(userId.toString());
    return result ? result.total_damage || 0 : 0; // Возвращаем 0, если данных нет
  } catch (error) {
    console.error(`[getBossDamageByUserId] Ошибка при получении урона для пользователя ID=${userId}:`, error);
    return 0; // Возвращаем 0 в случае ошибки
  }
}

// Функция для получения нанесенного урона пользователем
function getBossDamageByUserId(userId) {
  try {
    // Запрос к базе данных для получения суммы нанесённого урона
    const stmt = db.prepare(`
      SELECT SUM(damage) AS total_damage
      FROM boss_damage
      WHERE user_id = ?
    `);

    const result = stmt.get(userId.toString());
    return result ? result.total_damage || 0 : 0; // Возвращаем 0, если данных нет
  } catch (error) {
    console.error(`[getBossDamageByUserId] Ошибка при получении урона для пользователя ID=${userId}:`, error);
    return 0; // Возвращаем 0 в случае ошибки
  }
}

/// Функция для получения всех оружий пользователя
function getUserWeapons(userId) {
  try {
    // Получаем список ID оружий пользователя из базы данных
    const user = getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден.');
    }

    // Преобразуем owned_weapons в массив чисел
    let ownedWeaponsIds = [];
    try {
      ownedWeaponsIds = JSON.parse(user.owned_weapons || '[]').map(Number);
    } catch (error) {
      console.error(`[ERROR] Невозможно распарсить owned_weapons для пользователя ${userId}:`, error);
    }

    // Получаем все виды оружия из базы данных
    const allWeapons = getAllWeapons();

    // Фильтруем оружия, которые есть у игрока
    const ownedWeapons = allWeapons.filter((weapon) => ownedWeaponsIds.includes(weapon.id));

    // Добавляем "Кулак" в список доступных оружий
    const defaultWeapon = getWeaponByName('Кулак'); // Получаем кулак из базы данных
    if (!defaultWeapon) {
      throw new Error('Кулак не найден.');
    }

    // Если у игрока нет других оружий, список будет содержать только "Кулак"
    return [defaultWeapon, ...ownedWeapons];
  } catch (error) {
    console.error('[getUserWeapons] Ошибка:', error);
    return [];
  }
}

// Функция для получения топа игроков по силе урона кулаков
function getTopPlayersByAttackPower() {
  try {
    const stmt = db.prepare(`
      SELECT 
        numeric_id,
        id AS telegram_id,
        username,
        disable_hyperlink,
        attack_power
      FROM users
      WHERE username IS NOT NULL
      ORDER BY attack_power DESC -- Сортировка по силе урона в порядке убывания
      LIMIT 10 -- Ограничение на 10 игроков
    `);

    const topPlayers = stmt.all();

    // Формируем результат в виде массива объектов
    return topPlayers.map(player => ({
      numeric_id: player.numeric_id || 'Не найден',
      telegram_id: player.telegram_id || 'Не найден',
      username: player.username || 'Неизвестный',
      disable_hyperlink: !!player.disable_hyperlink,
      attack_power: player.attack_power || 0, // Сила урона кулаков
    }));
  } catch (error) {
    console.error("Ошибка при получении топа игроков по силе урона:", error);
    return [];
  }
}


function updateSkinPrice(skinId, newPrice) {
  try {
      const stmt = db.prepare('UPDATE skins SET price = ? WHERE id = ?');
      const info = stmt.run(newPrice, skinId);
      return info.changes > 0; // Возвращает true, если строка была обновлена
  } catch (error) {
      console.error(`[DB] Ошибка при обновлении цены скина ID=${skinId}:`, error);
      return false; // В случае ошибки возвращаем false
  }
}

// Функция для получения уровня карты пользователя
function getCardLevel(userId) {
  const stmt = db.prepare('SELECT card_level FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  // Возвращаем уровень или 1 по умолчанию, если поле отсутствует или NULL
  return result?.card_level !== undefined ? result.card_level : 1;
}

// Функция для обновления уровня карты пользователя
async function updateCardLevel(userId, newLevel) {
  try {
    const stmt = db.prepare('UPDATE users SET card_level = ? WHERE id = ?');
    const info = stmt.run(newLevel, userId.toString());
    return info.changes > 0; // Возвращаем true, если строка была обновлена
  } catch (error) {
    console.error('[DB] Ошибка при обновлении уровня карты:', error);
    return false; // Возвращаем false в случае ошибки
  }
}

// Функция для установки уровня карты пользователя по numeric_id
function setCardLevelByNumericId(numericId, newLevel) {
  try {
    // Проверяем, что newLevel - допустимое число (например, от 1 до 20)
    const level = parseInt(newLevel, 10);
    if (isNaN(level) || level < 1 || level > 20) {
      console.error(`[DB] setCardLevelByNumericId: Некорректный уровень ${newLevel} для numeric_id ${numericId}`);
      return { success: false, message: 'Некорректный уровень. Допустимые значения: 1-20.' };
    }

    const stmt = db.prepare('UPDATE users SET card_level = ? WHERE numeric_id = ?');
    const info = stmt.run(level, numericId);

    if (info.changes > 0) {
      console.log(`[DB] Уровень карты пользователя с numeric_id ${numericId} успешно установлен на ${level}.`);
      return { success: true, message: `Уровень карты успешно установлен на ${level}.` };
    } else {
      console.warn(`[DB] setCardLevelByNumericId: Пользователь с numeric_id ${numericId} не найден.`);
      return { success: false, message: 'Пользователь с указанным NUMERIC_ID не найден.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при установке уровня карты:', error);
    return { success: false, message: 'Произошла ошибка при обновлении уровня карты.' };
  }
}

// --- Создание таблицы для отслеживания ежедневных действий администраторов ---
db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'ban' или 'unban'
    target_user_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )
`).run();

// --- Функции для работы с daily_admin_actions ---

// Функция для записи действия администратора (бан/разбан)
function recordAdminAction(adminId, actionType, targetUserId) {
  try {
    const stmt = db.prepare(`
      INSERT INTO daily_admin_actions (admin_id, action_type, target_user_id, timestamp) 
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(adminId.toString(), actionType, targetUserId.toString(), Math.floor(Date.now() / 1000));
    console.log(`[DB] Записано действие администратора: Админ ${adminId} -> ${actionType} -> Пользователь ${targetUserId} (ID записи: ${result.lastInsertRowid})`);
    return { success: true, lastInsertRowid: result.lastInsertRowid };
  } catch (error) {
    console.error(`[DB] Ошибка при записи действия администратора ${adminId}:`, error);
    return { success: false, error: error.message };
  }
}

// Функция для очистки устаревших записей (старше 24 часов) из daily_admin_actions
function cleanupExpiredAdminActions() {
  try {
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    const stmt = db.prepare('DELETE FROM daily_admin_actions WHERE timestamp < ?');
    const info = stmt.run(oneDayAgo);
    console.log(`[DB] Очищено ${info.changes} устаревших записей из daily_admin_actions.`);
    return { success: true, deletedCount: info.changes };
  } catch (error) {
    console.error('[DB] Ошибка при очистке устаревших действий администраторов:', error);
    return { success: false, error: error.message };
  }
}

// Если fromTime не указан, получает все действия за последние 24 часа от now
function getAdminActionsInRange(adminId, fromTime = null, toTime = Math.floor(Date.now() / 1000)) {
  try {
    let stmt;
    if (fromTime !== null) {
      stmt = db.prepare(`
        SELECT * 
        FROM daily_admin_actions 
        WHERE admin_id = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(adminId.toString(), fromTime, toTime);
    } else {
      // По умолчанию за последние 24 часа
      const defaultFromTime = toTime - (24 * 60 * 60);
      stmt = db.prepare(`
        SELECT * 
        FROM daily_admin_actions 
        WHERE admin_id = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(adminId.toString(), defaultFromTime, toTime);
    }
  } catch (error) {
    console.error(`[DB] Ошибка при получении действий администратора ${adminId} в диапазоне:`, error);
    return [];
  }
}

// Функция для получения времени последнего действия администратора
function getLastAdminActionTime(adminId) {
  try {
    const stmt = db.prepare(`
      SELECT MAX(timestamp) as last_timestamp
      FROM daily_admin_actions 
      WHERE admin_id = ?
    `);
    const result = stmt.get(adminId.toString());
    return result?.last_timestamp || null; // Возвращает null, если действий не было
  } catch (error) {
    console.error(`[DB] Ошибка при получении времени последнего действия администратора ${adminId}:`, error);
    return null;
  }
}

function resetAllBonusTimes() {
  try {
    // Подготавливаем запрос для обновления обоих полей
    const stmt = db.prepare(`
      UPDATE users 
      SET last_bonus_time = 0, last_private_bonus_time = 0
    `);
    
    // Выполняем запрос
    const info = stmt.run();
    
    console.log(`[DB] Сброшены таймеры бонусов для ${info.changes} пользователей.`);
    return { 
      success: true, 
      message: `Таймеры бонусов успешно сброшены для ${info.changes} пользователей.`, 
      changes: info.changes 
    };
  } catch (error) {
    console.error('[DB] Ошибка при сбросе таймеров бонусов:', error);
    return { 
      success: false, 
      message: 'Произошла ошибка при сбросе таймеров бонусов.' 
    };
  }
}

// Функция для получения информации о балансе игрока по numeric_id
function getPlayerBalanceInfoByNumericId(numericId) {
  try {
      const stmt = db.prepare(`
          SELECT 
              numeric_id,
              username,
              balance,
              card_balance,
              df_balance,
              npf_shares,
              container_type_1,
              container_type_2,
              container_type_3
          FROM users 
          WHERE numeric_id = ?
      `);
      const playerData = stmt.get(numericId);

      if (!playerData) {
          return { success: false, message: `Игрок с numeric_id ${numericId} не найден.` };
      }

      // Рассчитываем общий баланс PF
      // Обратите внимание: здесь мы используем ?? 0 только для числовых значений, но если они null, то они будут отображаться как "null"
      const totalPFBalance = (playerData.balance || 0) + (playerData.card_balance || 0);

      // Определяем, как отображать значения: если значение undefined или null - показываем как "null", иначе как число
      const formatValue = (value) => {
          if (value === null || value === undefined) {
              return 'null';
          }
          return value;
      };

      // Применяем форматирование к каждому полю
      const formattedData = {
          numeric_id: playerData.numeric_id,
          username: playerData.username || 'Не указано',
          balance_pf: formatValue(playerData.balance),
          card_balance: formatValue(playerData.card_balance),
          total_balance_pf: totalPFBalance, // Здесь мы все равно складываем, так как null считается 0
          balance_df: formatValue(playerData.df_balance),
          shares_npf: formatValue(playerData.npf_shares),
          containers_1: formatValue(playerData.container_type_1),
          containers_2: formatValue(playerData.container_type_2),
          containers_3: formatValue(playerData.container_type_3)
      };

      return {
          success: true,
          data: formattedData
      };
  } catch (error) {
      console.error("[DB] Ошибка при получении информации о балансе игрока:", error);
      return { success: false, message: 'Произошла ошибка при получении данных.' };
  }
}

// Функция для установки конкретного значения баланса PF по numeric_id
function setPlayerBalanceByNumericId(numericId, newBalance) {
  try {
      // Проверяем, существует ли пользователь с таким numeric_id
      const userCheckStmt = db.prepare('SELECT 1 FROM users WHERE numeric_id = ?');
      const userExists = userCheckStmt.get(numericId);

      if (!userExists) {
          return { success: false, message: `Пользователь с numeric_id ${numericId} не найден.` };
      }

      // Подготавливаем запрос на обновление баланса
      // Используем прямое присваивание (=), а не изменение (+/-)
      const stmt = db.prepare('UPDATE users SET balance = ? WHERE numeric_id = ?');
      
      // Выполняем запрос
      const info = stmt.run(newBalance, numericId);

      // Проверяем, были ли внесены изменения
      if (info.changes > 0) {
          return { success: true, message: `Баланс PF для игрока с numeric_id ${numericId} успешно установлен на ${newBalance}.` };
      } else {
          // Это может произойти, если новое значение совпадает со старым (в т.ч. если и там, и там NULL)
          return { success: true, message: `Баланс PF для игрока с numeric_id ${numericId} уже был равен ${newBalance} или не изменился.` };
      }
  } catch (error) {
      console.error("[DB] Ошибка при установке баланса игрока:", error);
      return { success: false, message: 'Произошла ошибка при обновлении данных.' };
  }
}

// Создание таблицы для отслеживания действий кика администраторов (если ещё не создана)
db.prepare(`CREATE TABLE IF NOT EXISTS daily_admin_kick_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL, -- Telegram ID администратора
  target_user_id TEXT NOT NULL, -- Telegram ID кикнутого пользователя
  timestamp INTEGER NOT NULL -- Время действия (в секундах Unix)
)`).run();

// Функция для записи действия администратора (кик)
function recordAdminKickAction(adminId, targetUserId) {
  try {
    const stmt = db.prepare(`INSERT INTO daily_admin_kick_actions (admin_id, target_user_id, timestamp)
                             VALUES (?, ?, ?)`);
    const result = stmt.run(adminId.toString(), targetUserId.toString(), Math.floor(Date.now() / 1000));

    console.log(`[DB] Записано действие кика: Админ ${adminId} -> кик -> Пользователь ${targetUserId} (ID записи: ${result.lastInsertRowid})`);
    return { success: true, lastInsertRowid: result.lastInsertRowid };
  } catch (error) {
    console.error(`[DB] Ошибка при записи действия кика администратора ${adminId}:`, error);
    return { success: false, error: error.message };
  }
}

// Функция для очистки устаревших записей (старше 24 часов) из daily_admin_kick_actions
function cleanupExpiredAdminKickActions() {
  try {
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);

    const stmt = db.prepare('DELETE FROM daily_admin_kick_actions WHERE timestamp < ?');
    const info = stmt.run(oneDayAgo);
    console.log(`[DB] Очищено ${info.changes} устаревших записей из daily_admin_kick_actions.`);
    return { success: true, deletedCount: info.changes };
  } catch (error) {
    console.error('[DB] Ошибка при очистке устаревших действий кика администраторов:', error);
    return { success: false, error: error.message };
  }
}

// Если fromTime не указан, получает все действия за последние 24 часа от now
function getAdminKickActionsInRange(adminId, fromTime = null, toTime = Math.floor(Date.now() / 1000)) {
  try {
    let stmt;

    if (fromTime !== null) {
      stmt = db.prepare(`SELECT * FROM daily_admin_kick_actions
                         WHERE admin_id = ? AND timestamp >= ? AND timestamp <= ?`);
      return stmt.all(adminId.toString(), fromTime, toTime);
    } else {
      // Получаем действия за последние 24 часа
      const oneDayAgo = toTime - (24 * 60 * 60);
      stmt = db.prepare(`SELECT * FROM daily_admin_kick_actions
                         WHERE admin_id = ? AND timestamp >= ? AND timestamp <= ?`);
      return stmt.all(adminId.toString(), oneDayAgo, toTime);
    }
  } catch (error) {
    console.error(`[DB] Ошибка при получении действий кика администратора ${adminId} в диапазоне:`, error);
    return [];
  }
}

// Функция для получения времени последнего действия кика администратора
function getLastAdminKickActionTime(adminId) {
  try {
    const stmt = db.prepare(`SELECT MAX(timestamp) as last_timestamp
                             FROM daily_admin_kick_actions
                             WHERE admin_id = ?`);
    const result = stmt.get(adminId.toString());
    return result?.last_timestamp || null; // Возвращает null, если действий не было
  } catch (error) {
    console.error(`[DB] Ошибка при получении времени последнего действия кика администратора ${adminId}:`, error);
    return null;
  }
}

// Функция для получения всех пользователей с картами
function getUsersWithCards() {
  // Выбираем только тех пользователей, у которых есть заполненный card_number
  // и возвращаем нужные поля, включая card_balance
  const stmt = db.prepare(`
    SELECT id, card_balance, npf_shares
    FROM users
    WHERE card_number IS NOT NULL AND card_number != ''
  `);
  return stmt.all(); // Возвращает массив объектов
}

// Функция для получения общей статистики для расчета курса
function getNpfStats() {
  try {
    const usersWithCards = getUsersWithCards(); // Используем уже реализованную функцию
    const total_card_pf = usersWithCards.reduce((sum, user) => sum + user.card_balance, 0);
    const total_cardholders = usersWithCards.length;

    // Получаем общее количество акций NPF в обращении
    const stmt = db.prepare('SELECT SUM(npf_shares) AS total_shares FROM users');
    const result = stmt.get();
    const total_shares = result?.total_shares || 0;

    return {
      total_card_pf,
      total_cardholders,
      total_shares,
    };
  } catch (error) {
    console.error('Ошибка при получении статистики для расчета курса NPF:', error);
    return {
      total_card_pf: 0,
      total_cardholders: 0,
      total_shares: 0,
    };
  }
}

// Функция для получения количества акций у пользователя
function getUserNpfShares(userId) {
  const stmt = db.prepare('SELECT npf_shares FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result?.npf_shares || 0;
}

// Функция для обновления количества акций у пользователя (покупка/продажа)
function updateUserNpfShares(userId, sharesChange) {
  try {
    // Проверяем, что после изменения не будет отрицательного количества
    const currentShares = getUserNpfShares(userId);
    if (currentShares + sharesChange < 0) {
      return { success: false, message: 'Недостаточно акций для продажи.' };
    }

    const stmt = db.prepare('UPDATE users SET npf_shares = npf_shares + ? WHERE id = ?');
    const info = stmt.run(sharesChange, userId.toString());

    if (info.changes === 0) {
      return { success: false, message: 'Не удалось обновить количество акций.' };
    }

    return { success: true, newShares: currentShares + sharesChange };
  } catch (error) {
    console.error('Ошибка при обновлении количества акций:', error);
    return { success: false, message: 'Ошибка при обновлении акций.' };
  }
}

// Выдача билетиков пользователю
function giveTickets(userId, amount) {
  if (amount < 0) {
    return { success: false, message: 'Количество билетиков не может быть отрицательным.' };
  }
  try {
    const stmt = db.prepare('UPDATE users SET tickets = tickets + ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Выдано ${amount} 🎫 билетиков.` };
    } else {
      return { success: false, message: 'Пользователь не найден.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при выдаче билетиков:', error);
    return { success: false, message: 'Произошла ошибка при выдаче билетиков.' };
  }
}

// Функция для выдачи приза пользователю по его ID и объекту приза
async function awardPrizeToUser(userId, prize) {
  try {
    console.log(`[DB] Начинаем выдачу приза "${prize.title}" пользователю ${userId}.`);
    let result = { success: false };

    switch (prize.type) {
      case 'balance':
        // Начисляем PF
        const balanceResult = updateUserBalance(userId, prize.amount);
        if (balanceResult.changes > 0) {
          result = { success: true, message: `Начислено ${prize.amount} PF.` };
        } else {
          throw new Error('Ошибка при начислении баланса.');
        }
        break;

      case 'stars':
        // Начисляем звезды (это можно сделать через донат-логику)
        // Здесь мы просто увеличиваем total_donated_stars, чтобы отразить это в статистике
        const starsResult = updateTotalDonatedStars(userId, prize.amount);
        if (starsResult.changes > 0) {
          result = { success: true, message: `Начислено ${prize.amount} звезд.` };
        } else {
          throw new Error('Ошибка при начислении звезд.');
        }
        break;

      case 'status':
        // Выдаем статус
        const statusResult = awardStatusToUser(userId, prize.statusName);
        if (statusResult.success) {
          result = { success: true, message: `Выдан статус "${prize.statusName}".` };
        } else {
          throw new Error(statusResult.message);
        }
        break;

      case 'skin':
        // Выдаем скин
        const skinResult = giveSkinToUser(userId, prize.skinId);
        if (skinResult.success) {
          result = { success: true, message: `Выдан скин с ID ${prize.skinId}.` };
        } else {
          throw new Error(skinResult.message);
        }
        break;

      case 'container':
        // Выдаем контейнеры
        const containerResult = decreaseContainerCount(userId, prize.containerType, -prize.quantity);
        if (containerResult.success) {
          result = { success: true, message: `Выдано ${prize.quantity} контейнеров типа ${prize.containerType}.` };
        } else {
          throw new Error(containerResult.message);
        }
        break;

      case 'prefix':
        // Выдаем префикс
        const prefixResult = addPrefixToUser(userId, prize.prefixId);
        if (prefixResult) {
          result = { success: true, message: `Выдан префикс с ID ${prize.prefixId}.` };
        } else {
          throw new Error('Ошибка при выдаче префикса.');
        }
        break;

      case 'secret':
        // Реализуйте логику для секретного приза
        // Например, можно отправить сообщение администратору
        result = { success: true, message: 'Вы выиграли СЕКРЕТНЫЙ ПРИЗ! Администратор свяжется с вами.' };
        // Можно добавить логирование или отправку сообщения админу
        break;

      default:
        throw new Error(`Неизвестный тип приза: ${prize.type}`);
    }

    console.log(`[DB] Приз "${prize.title}" успешно выдан пользователю ${userId}.`);
    return result;
  } catch (error) {
    console.error(`[DB] Ошибка при выдаче приза "${prize.title}" пользователю ${userId}:`, error);
    return { success: false, message: error.message };
  }
}

// Функция для получения текущего количества билетиков пользователя
function getTickets(userId) {
  const stmt = db.prepare('SELECT tickets FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result ? result.tickets || 0 : 0;
}


// Функция для забора билетиков у пользователя
function takeTickets(userId, amount) {
  if (amount < 0) {
    return { success: false, message: 'Количество билетиков не может быть отрицательным.' };
  }
  try {
    const user = getUserById(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }
    if ((user.tickets || 0) < amount) {
      return { success: false, message: `Недостаточно билетиков. Доступно: ${user.tickets || 0}.` };
    }
    const stmt = db.prepare('UPDATE users SET tickets = tickets - ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Забрано ${amount} 🎫 билетиков.` };
    } else {
      return { success: false, message: 'Не удалось обновить данные пользователя.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при заборе билетиков:', error);
    return { success: false, message: 'Произошла ошибка при заборе билетиков.' };
  }
}

// Функция для выдачи конфет пользователю (перемещена сюда)
function giveCandy(userId, amount) {
  if (amount < 0) {
    return { success: false, message: 'Количество конфет не может быть отрицательным.' };
  }
  try {
    const stmt = db.prepare('UPDATE users SET candy = candy + ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Выдано ${amount} 🍬 конфет.` };
    } else {
      return { success: false, message: 'Пользователь не найден.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при выдаче конфет:', error);
    return { success: false, message: 'Произошла ошибка при выдаче конфет.' };
  }
}

// Функция для забора конфет у пользователя (перемещена сюда)
function takeCandy(userId, amount) {
  if (amount < 0) {
    return { success: false, message: 'Количество конфет не может быть отрицательным.' };
  }
  try {
    const user = getUserById(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }
    if ((user.candy || 0) < amount) {
      return { success: false, message: `Недостаточно конфет. Доступно: ${user.candy || 0}.` };
    }
    const stmt = db.prepare('UPDATE users SET candy = candy - ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Забрано ${amount} 🍬 конфет.` };
    } else {
      return { success: false, message: 'Не удалось обновить данные пользователя.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при заборе конфет:', error);
    return { success: false, message: 'Произошла ошибка при заборе конфет.' };
  }
}

// --- Функции для работы с секретными пакетиками ---
function getSecretGifts(userId) {
  const stmt = db.prepare('SELECT secret_gifts FROM users WHERE id = ?');
  const result = stmt.get(userId.toString());
  return result ? result.secret_gifts || 0 : 0;
}

function addSecretGift(userId, amount = 1) {
  if (amount < 0) {
    return { success: false, message: 'Количество пакетиков не может быть отрицательным.' };
  }
  try {
    const stmt = db.prepare('UPDATE users SET secret_gifts = secret_gifts + ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Выдано ${amount} 🎁 пакетиков.` };
    } else {
      return { success: false, message: 'Пользователь не найден.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при выдаче пакетиков:', error);
    return { success: false, message: 'Произошла ошибка при выдаче пакетиков.' };
  }
}

function takeSecretGift(userId, amount = 1) {
  if (amount < 0) {
    return { success: false, message: 'Количество пакетиков не может быть отрицательным.' };
  }
  try {
    const user = getUserById(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }
    if ((user.secret_gifts || 0) < amount) {
      return { success: false, message: `У вас недостаточно пакетиков. У вас есть ${user.secret_gifts}.` };
    }
    const stmt = db.prepare('UPDATE users SET secret_gifts = secret_gifts - ? WHERE id = ?');
    const info = stmt.run(amount, userId.toString());
    if (info.changes > 0) {
      return { success: true, message: `Забрано ${amount} 🎁 пакетиков.` };
    } else {
      return { success: false, message: 'Не удалось списать пакетики.' };
    }
  } catch (error) {
    console.error('[DB] Ошибка при списании пакетиков:', error);
    return { success: false, message: 'Произошла ошибка при списании пакетиков.' };
  }
}

// Функция для выдачи билетиков администратором (техническая)
function giveTicketsAdmin(numericId, amount) {
  try {
    if (amount <= 0) {
      return { success: false, message: 'Количество должно быть больше нуля.' };
    }
    
    const user = getUserByNumericId(numericId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    const stmt = db.prepare('UPDATE users SET tickets = tickets + ? WHERE id = ?');
    const info = stmt.run(amount, user.id);

    if (info.changes > 0) {
      return { 
        success: true, 
        message: `Успешно выдано ${amount} билетиков пользователю ${user.username}.`,
        newBalance: (user.tickets || 0) + amount
      };
    }
    return { success: false, message: 'Ошибка при обновлении базы данных.' };
  } catch (error) {
    console.error('[DB] Ошибка при выдаче билетиков (admin):', error);
    return { success: false, message: 'Произошла ошибка.' };
  }
}

// Функция для изъятия билетиков администратором (техническая)
function takeTicketsAdmin(numericId, amount) {
  try {
    if (amount <= 0) {
      return { success: false, message: 'Количество должно быть больше нуля.' };
    }

    const user = getUserByNumericId(numericId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден.' };
    }

    const currentTickets = user.tickets || 0;
    if (currentTickets < amount) {
      return { 
        success: false, 
        message: `Недостаточно билетиков. У пользователя сейчас ${currentTickets}.` 
      };
    }

    const stmt = db.prepare('UPDATE users SET tickets = tickets - ? WHERE id = ?');
    const info = stmt.run(amount, user.id);

    if (info.changes > 0) {
      return { 
        success: true, 
        message: `Успешно изъято ${amount} билетиков у пользователя ${user.username}.`,
        newBalance: currentTickets - amount
      };
    }
    return { success: false, message: 'Ошибка при обновлении базы данных.' };
  } catch (error) {
    console.error('[DB] Ошибка при изъятии билетиков (admin):', error);
    return { success: false, message: 'Произошла ошибка.' };
  }
}

// Получить все активные промокоды с истекшим временем
function getExpiredPromos() {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare('SELECT id, name FROM promos WHERE expires_at IS NOT NULL AND expires_at < ? AND activations_left = -1');
  return stmt.all(now);
}

// Удалить промокод по ID (уже есть, но убедимся что экспортируется)
// deletePromoById уже существует

// Функция очистки (вызывать из бота)
function cleanupExpiredPromos() {
  const expired = getExpiredPromos();
  let count = 0;
  for (const promo of expired) {
    deletePromoById(promo.id);
    count++;
    console.log(`[AUTO] Промокод "${promo.name}" удален по истечению времени.`);
  }
  return count;
}

// Создание таблицы для логирования сообщений
db.prepare(`
  CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      chat_type TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      chat_title TEXT DEFAULT NULL,
      message_text TEXT NOT NULL,
      is_command INTEGER DEFAULT 0
  )
  `).run();
  
  // Создание индексов для оптимизации выборок и очистки
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_message_log_user_ts ON message_log(user_id, ts DESC)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_message_log_ts ON message_log(ts)`).run();


/**
 * Логирует сообщение пользователя.
 * @param {string|number} userId - Telegram ID пользователя.
 * @param {string} chatType - Тип чата (private, group, supergroup).
 * @param {string|number} chatId - ID чата.
 * @param {string|null} chatTitle - Название чата (null для лички).
 * @param {string} messageText - Текст сообщения.
 * @param {boolean} isCommand - Флаг команды.
 */
function logMessage(userId, chatType, chatId, chatTitle, messageText, isCommand = false) {
  try {
      // Обрезаем текст до 1024 символов согласно ТЗ
      const truncatedText = messageText ? messageText.substring(0, 1024) : '';
      const ts = Date.now(); // Время в миллисекундах
      
      const stmt = db.prepare(`
          INSERT INTO message_log (user_id, ts, chat_type, chat_id, chat_title, message_text, is_command)
          VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
          userId.toString(), 
          ts, 
          chatType, 
          chatId.toString(), 
          chatTitle, 
          truncatedText, 
          isCommand ? 1 : 0
      );
  } catch (error) {
      console.error('[DB] Ошибка при логировании сообщения:', error);
  }
}

/**
* Получает последние N сообщений пользователя (по умолчанию 200).
* Использует индекс idx_message_log_user_ts.
*/
function getUserMessageLog(userId, limit = 200) {
  try {
      const stmt = db.prepare(`
          SELECT * FROM message_log 
          WHERE user_id = ? 
          ORDER BY ts DESC 
          LIMIT ?
      `);
      return stmt.all(userId.toString(), limit);
  } catch (error) {
      console.error('[DB] Ошибка при получении лога сообщений:', error);
      return [];
  }
}

/**
* Удаляет записи старше указанного количества дней (по умолчанию 30).
* Использует индекс idx_message_log_ts.
*/
function cleanupOldMessageLogs(days = 30) {
  try {
      const cutoffTs = Date.now() - (days * 24 * 60 * 60 * 1000);
      const stmt = db.prepare(`DELETE FROM message_log WHERE ts < ?`);
      const info = stmt.run(cutoffTs);
      console.log(`[DB] Очищено ${info.changes} старых записей из message_log.`);
      return { success: true, deletedCount: info.changes };
  } catch (error) {
      console.error('[DB] Ошибка при очистке message_log:', error);
      return { success: false, error: error.message };
  }
}
// Количество уникальных игроков, взаимодействовавших с ботом в окне windowMs
function getActivePlayersCount(windowMs = 5 * 60 * 1000) {
  try {
    const cutoff = Date.now() - windowMs;
    const row = db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM message_log WHERE ts >= ?').get(cutoff);
    return row?.c || 0;
  } catch (error) {
    console.error('[DB] getActivePlayersCount:', error.message);
    return 0;
  }
}


// === ТАБЛИЦА ФИНАНСОВЫХ И АДМИН-ОПЕРАЦИЙ ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS finance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,                -- время операции, мс
      type TEXT NOT NULL,                 -- 'transfer' | 'donation' | 'promo' |
                                          -- 'admin_give' | 'admin_take' | 'admin_set' |
                                          -- 'ban' | 'unban' | 'mute' | 'unmute' | 'kick' |
                                          -- 'block_transfers' | 'unblock_transfers'
      actor_user_id TEXT NOT NULL,        -- инициатор: игрок ИЛИ админ
      target_user_id TEXT DEFAULT NULL,   -- на кого направлено действие
      amount INTEGER DEFAULT NULL,        -- сумма (NULL для бан/мут/кик)
      currency TEXT DEFAULT NULL,         -- PF / DF / TICKET / ENERGY / CONTAINER_1... (NULL для модерации)
      ref TEXT DEFAULT NULL,              -- имя промо / charge_id / сырой itemType / комментарий
      chat_id TEXT DEFAULT NULL, 
      chat_title TEXT DEFAULT NULL,           -- чат для mute/unmute/kick
      reason TEXT DEFAULT NULL,           -- причина бан/мут/кик
      action TEXT DEFAULT NULL,           -- ГОТОВЫЙ текст действия для таблицы логов
      payload TEXT DEFAULT NULL,          -- JSON-детали (duration, banned_until и т.д.)
      success INTEGER DEFAULT 1           -- 1 успех / 0 отказ
  )
  `).run();
  
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_actor ON finance_log(actor_user_id, ts)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_target ON finance_log(target_user_id, ts)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_finance_type ON finance_log(type, ts)`).run();
 
 // Проверка и добавление колонки chat_title если её нет
try {
  const colsFin = db.prepare("PRAGMA table_info(finance_log)").all();
  if (!colsFin.some(c => c.name === 'chat_title')) {
    db.prepare("ALTER TABLE finance_log ADD COLUMN chat_title TEXT DEFAULT NULL").run();
    console.log('✅ Колонка chat_title добавлена в finance_log');
  }
  // --- МИГРАЦИЯ: гарантируем колонки chat_title и chat_type в finance_log ---
try {
  const finCols = new Set(db.prepare("PRAGMA table_info(finance_log)").all().map(c => c.name));
  if (!finCols.has('chat_title')) {
    db.prepare("ALTER TABLE finance_log ADD COLUMN chat_title TEXT DEFAULT NULL").run();
    console.log('✅ Колонка chat_title добавлена в finance_log');
  }
  if (!finCols.has('chat_type')) {
    db.prepare("ALTER TABLE finance_log ADD COLUMN chat_type TEXT DEFAULT NULL").run();
    console.log('✅ Колонка chat_type добавлена в finance_log');
  }
} catch (e) {
  console.error('❌ Ошибка миграции finance_log:', e);
}
} catch (e) {
  console.error('❌ Ошибка при добавлении колонки chat_title:', e);
}
 /**
 * Универсальная запись в finance_log.
 * amount/currency/chatId/reason/action могут быть null.
 */
 function logFinance(entry) {
  try {
    if (!entry.type || !entry.actorUserId) {
      return { success: false, error: 'type и actorUserId обязательны' };
    }
    const payload = entry.payload == null
      ? null
      : (typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload));
    const stmt = db.prepare(`INSERT INTO finance_log
      (ts, type, actor_user_id, target_user_id, amount, currency, ref, chat_id, chat_title, chat_type, reason, action, payload, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(
      Date.now(),
      entry.type,
      entry.actorUserId.toString(),
      entry.targetUserId ? entry.targetUserId.toString() : null,
      entry.amount ?? null,
      entry.currency || null,
      entry.ref || null,
      entry.chatId ? entry.chatId.toString() : null,
      entry.chatTitle || null,
      entry.chatType || null,
      entry.reason || null,
      entry.action || null,
      payload,
      entry.success === undefined ? 1 : (entry.success ? 1 : 0)
    );
    return { success: true, id: info.lastInsertRowid };
  } catch (error) {
    console.error('[DB] Ошибка при записи в finance_log:', error);
    return { success: false, error: error.message };
  }
}

// Соответствие itemType из тех-команд → единица в колонке currency
const ITEM_CURRENCY_MAP = {
  balance: 'PF',
  card_balance: 'PF_CARD',
  df_balance: 'DF',
  npf_shares: 'NPF',
  container_type_1: 'CONTAINER_1',
  container_type_2: 'CONTAINER_2',
  container_type_3: 'CONTAINER_3',
  tickets: 'TICKET',
  energy: 'ENERGY',
  candy: 'CANDY',
  secret_gifts: 'GIFT',
};

/**
* Лог выдачи / снятия / установки предметов и валют администратором.
* @param {Object} o
* @param {string|number} o.adminId - ID админа
* @param {string|number} o.targetUserId - ID игрока
* @param {'give'|'take'|'set'} o.direction
* @param {string} o.itemType - balance / df_balance / tickets / energy / container_type_N ...
* @param {number|null} o.amount - количество (для set — новое значение)
* @param {string|null} [o.comment]
* @param {boolean} [o.success]
*/
// Помощник: ник по ID для формулировок логов
function resolveUsername(userId) {
  if (!userId) return null;
  try {
    const row = db.prepare('SELECT username FROM users WHERE id = ?').get(userId.toString());
    return row?.username || null;
  } catch (e) {
    return null;
  }
}

function logAdminItem({ adminId, targetUserId, direction, itemType, amount = null, comment = null, success = true, adminName = null, targetName = null }) {
  const currency = ITEM_CURRENCY_MAP[itemType] || String(itemType).toUpperCase();
  const aName = adminName || resolveUsername(adminId) || `ID ${adminId}`;
  const tName = targetName || resolveUsername(targetUserId) || `ID ${targetUserId}`;
  const qty = amount != null ? amount.toLocaleString('ru-RU') : '';
  let action;
  if (direction === 'give') {
    action = `${aName} выдал ${qty} ${currency} игроку ${tName}`;
  } else if (direction === 'take') {
    action = `${aName} забрал ${qty} ${currency} у игрока ${tName}`;
  } else {
    action = `${aName} установил баланс ${qty} ${currency} игроку ${tName}`;
  }
  if (comment) action += ` (${comment})`;
  return logFinance({
    type: direction === 'give' ? 'admin_give' : direction === 'take' ? 'admin_take' : 'admin_set',
    actorUserId: adminId,
    targetUserId,
    amount,
    currency,
    ref: itemType,
    action,
    payload: { comment },
    success,
  });
}

/**
* Лог модераторских действий: бан/разбан/мут/размут/кик/блок переводов.
* @param {Object} o
* @param {string|number} o.adminId
* @param {string|number} o.targetUserId
* @param {'ban'|'unban'|'mute'|'unmute'|'kick'|'block_transfers'|'unblock_transfers'} o.type
* @param {string|number|null} [o.chatId] - чат (мут/кик)
* @param {string|null} [o.reason]
* @param {number|null} [o.durationHours]
* @param {boolean} [o.success]
*/
function logModeration({ adminId, targetUserId, type, chatId = null, chatTitle = null, reason = null, durationHours = null, success = true, adminName = null, targetName = null }) {
  const aName = adminName || resolveUsername(adminId) || `ID ${adminId}`;
  const tName = targetName || resolveUsername(targetUserId) || `ID ${targetUserId}`;
  const reasonSuffix = reason && reason !== 'Не указана' ? `: ${reason}` : '';
  const durationSuffix = durationHours ? ` (${durationHours} ч)` : '';
  const chatSuffix = chatTitle ? ` в чате «${chatTitle}»` : '';
  const verbs = {
    ban: `${aName} забанил ${tName}${reasonSuffix}${durationSuffix}`,
    unban: `${aName} разбанил ${tName}`,
    mute: `${aName} замутил ${tName}${reasonSuffix}${durationSuffix}${chatSuffix}`,
    unmute: `${aName} размьютил ${tName}${chatSuffix}`,
    kick: `${aName} кикнул ${tName} из чата${reasonSuffix}${chatSuffix}`,
    block_transfers: `${aName} заблокировал переводы игроку ${tName}`,
    unblock_transfers: `${aName} разблокировал переводы игроку ${tName}`,
  };
  const action = verbs[type] || `${aName}: ${type} → ${tName}`;
  return logFinance({
    type,
    actorUserId: adminId,
    targetUserId,
    amount: null,
    currency: null,
    chatId,
    reason,
    action,
    payload: { durationHours },
    success,
  });
}

// === ЛОГИРОВАНИЕ АКТИВАЦИЙ ПРОМОКОДОВ (тип 'promo' в finance_log) ===
const PROMO_PRIZE_LABEL = {
  balance: 'PF',
  df_balance: 'DF',
  npf_shares: 'NPF',
  container_type_1: 'CONTAINER_1',
  container_type_2: 'CONTAINER_2',
  container_type_3: 'CONTAINER_3',
  tickets: 'TICKETS',
};
/**
 * Пишет в finance_log факт активации промокода игроком (или отказ).
 * @param {Object} o
 * @param {string|number} o.userId - ID игрока
 * @param {string} o.promoName - название промокода
 * @param {string|null} [o.prizeType] - тип приза
 * @param {number|null} [o.prizeAmount] - сумма приза
 * @param {boolean} [o.success] - успешна ли активация
 * @param {string|null} [o.reason] - причина отказа (для success=false)
 */
function logPromoActivation({ userId, promoName, prizeType = null, prizeAmount = null, success = true, reason = null }) {
  const uName = resolveUsername(userId) || `ID ${userId}`;
  const prizeLabel = PROMO_PRIZE_LABEL[prizeType] || String(prizeType || '').toUpperCase();
  const qty = prizeAmount != null ? Number(prizeAmount).toLocaleString('ru-RU') : '';
  let action;
  if (success) {
    action = `${uName} активировал(а) промокод «${promoName}» → начислено ${qty} ${prizeLabel}`;
  } else {
    action = `${uName} — отказ активации промокода «${promoName}»: ${reason || 'причина не указана'}`;
  }
  return logFinance({
    type: 'promo',
    actorUserId: userId,
    targetUserId: null,
    amount: success ? prizeAmount : null,
    currency: success ? prizeLabel : null,
    ref: promoName,
    action,
    payload: { reason, prizeType, prizeAmount },
    success,
  });
}
/**
 * Опциональная ОДНОРАЗОВАЯ миграция: переносит СТАРЫЕ активации из promo_activations в finance_log.
 * Идемпотентна: не создаёт дубликаты (проверяет наличие успешной записи type='promo' по паре промо+игрок).
 */
function backfillPromoActivationLogs() {
  try {
    const info = db.prepare(`
      INSERT INTO finance_log (ts, type, actor_user_id, target_user_id, amount, currency, ref, chat_id, chat_title, chat_type, reason, action, payload, success)
      SELECT pa.activated_at * 1000, 'promo', pa.user_id, NULL, p.prize_amount,
             CASE p.prize_type
               WHEN 'balance' THEN 'PF'
               WHEN 'df_balance' THEN 'DF'
               WHEN 'npf_shares' THEN 'NPF'
               ELSE UPPER(COALESCE(p.prize_type, ''))
             END,
             p.name, NULL, NULL, NULL, NULL,
             COALESCE(u.username, 'ID ' || pa.user_id) || ' активировал(а) промокод «' || p.name || '» → начислено ' || COALESCE(p.prize_amount, 0) || ' ' || COALESCE(p.prize_type, ''),
             NULL, 1
      FROM promo_activations pa
      JOIN promos p ON p.id = pa.promo_id
      LEFT JOIN users u ON u.id = pa.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM finance_log f
        WHERE f.type = 'promo' AND f.success = 1 AND f.ref = p.name AND f.actor_user_id = pa.user_id
      )
    `).run();
    console.log(`[DB] Backfill промо-логов: добавлено записей: ${info.changes}`);
    return { success: true, added: info.changes };
  } catch (error) {
    console.error('[DB] Ошибка backfill промо-логов:', error);
    return { success: false, error: error.message };
  }
}


// Категории типов для удобных фильтров в админке
const FINANCE_LOG_CATEGORIES = {
  finance: ['transfer', 'donation', 'promo'],
  admin: ['admin_give', 'admin_take', 'admin_set'],
  moderation: ['ban', 'unban', 'mute', 'unmute', 'kick', 'block_transfers', 'unblock_transfers'],
};

/**
* Выборка с фильтрами: userId, role, type (строка), types (массив),
* category ('finance'|'admin'|'moderation'), chatId, limit, offset.
*/

/** Очистка finance_log старше maxAgeDays (ретеншен — 365 дней). */
function cleanupFinanceLog(maxAgeDays = 365) {
  try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const info = db.prepare('DELETE FROM finance_log WHERE ts < ?').run(cutoff);
      if (info.changes > 0) console.log(`[DB] Очищено ${info.changes} старых записей finance_log.`);
      return { success: true, deletedCount: info.changes };
  } catch (error) {
      console.error('[DB] Ошибка при очистке finance_log:', error);
      return { success: false, error: error.message };
  }
}

// =====================================================================
// === ТАБЛИЦЫ И ЛОГИКА ДЛЯ ДАБЛА (double_rounds, double_bets_log) ===
// =====================================================================

// === ТАБЛИЦА: паспорт раунда дабла (хранение 3 суток) ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS double_rounds (
      round_id TEXT PRIMARY KEY,          -- hash раунда
      start_ts INTEGER NOT NULL,          -- старт раунда, мс
      end_ts INTEGER DEFAULT NULL,        -- финиш, мс; заполняется в endRound
      result_multiplier TEXT DEFAULT NULL,-- итог: x2 / x3 / x5 / GAME
      salt TEXT DEFAULT NULL,             -- соль для проверки честности
      total_bank INTEGER DEFAULT 0,       -- сумма всех ставок раунда
      bets_count INTEGER DEFAULT 0,       -- количество ставок
      chats_count INTEGER DEFAULT 0,      -- количество чатов-участников
      participants_count INTEGER DEFAULT 0,-- количество уникальных игроков
      status TEXT DEFAULT 'active'        -- active / finished / canceled
  )
`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_double_rounds_start ON double_rounds(start_ts)`).run();

// === ТАБЛИЦА: журнал ставок дабла (хранение 30 дней) ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS double_bets_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,                -- время принятия ставки, мс
      round_id TEXT NOT NULL,             -- связь с double_rounds.round_id
      user_id TEXT NOT NULL,              -- кто ставил
      username TEXT NOT NULL,             -- снапшот ника на момент ставки
      chat_id TEXT NOT NULL,              -- чат, где сделана ставка
      chat_title TEXT DEFAULT NULL,       -- название чата
      multiplier TEXT NOT NULL,           -- x2 / x3 / x5 / GAME
      amount INTEGER NOT NULL,            -- сумма списания при принятии
      status TEXT NOT NULL DEFAULT 'accepted', -- accepted / rejected
      reject_reason TEXT DEFAULT NULL,    -- причина отказа
      game_choice TEXT DEFAULT NULL,      -- left / right для GAME
      is_win INTEGER DEFAULT NULL,        -- заполняется в endRound: 1 / 0
      win_amount INTEGER DEFAULT NULL,    -- сумма выплаты, заполняется в endRound
      payout_status TEXT DEFAULT 'pending' -- pending / paid / lost / failed
  )
`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_double_bets_user ON double_bets_log(user_id, ts DESC)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_double_bets_round ON double_bets_log(round_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_double_bets_ts ON double_bets_log(ts)`).run();

// === МИГРАЦИИ: колонки double-логов (на случай старых баз) ===
try {
  const roundCols = db.prepare("PRAGMA table_info(double_rounds)").all();
  [ { name: 'participants_count', type: 'INTEGER DEFAULT 0' },
    { name: 'status', type: "TEXT DEFAULT 'active'" } ].forEach(c => {
    if (!roundCols.some(x => x.name === c.name)) db.prepare(`ALTER TABLE double_rounds ADD COLUMN ${c.name} ${c.type}`).run();
  });
  const betCols = db.prepare("PRAGMA table_info(double_bets_log)").all();
  [ { name: 'payout_status', type: "TEXT DEFAULT 'pending'" },
    { name: 'chat_title', type: 'TEXT DEFAULT NULL' } ].forEach(c => {
    if (!betCols.some(x => x.name === c.name)) db.prepare(`ALTER TABLE double_bets_log ADD COLUMN ${c.name} ${c.type}`).run();
  });
} catch (e) { console.error('[DB] Ошибка миграции double-логов:', e); }


// --- ФУНКЦИИ: double_rounds ---

// Создание нового раунда
function createDoubleRound(roundId, startTs = Date.now()) {
  try {
    db.prepare(`INSERT OR IGNORE INTO double_rounds (round_id, start_ts, status) VALUES (?, ?, 'active')`).run(roundId, startTs);
    return { success: true };
  } catch (error) {
    console.error('[DB] Ошибка при создании раунда double_rounds:', error);
    return { success: false, error: error.message };
  }
}

// Завершение раунда (автоматически агрегирует банк, ставки и игроков из журнала)
function finishDoubleRoundLog(roundId, { endTs = Date.now(), resultMultiplier = null, salt = null, status = 'finished' } = {}) {
  try {
    const agg = db.prepare(`SELECT COUNT(*) AS bets, COUNT(DISTINCT user_id) AS players, COUNT(DISTINCT chat_id) AS chats, COALESCE(SUM(amount), 0) AS bank
                            FROM double_bets_log WHERE round_id = ? AND status = 'accepted'`).get(roundId);
    const info = db.prepare(`
      UPDATE double_rounds
      SET end_ts = ?, result_multiplier = ?, salt = ?, total_bank = ?, bets_count = ?, chats_count = ?, participants_count = ?, status = ?
      WHERE round_id = ?
    `).run(endTs, resultMultiplier, salt, agg.bank, agg.bets, agg.chats, agg.players, status, roundId);
    return { success: info.changes > 0, agg };
  } catch (error) {
    console.error('[DB] Ошибка при завершении раунда double_rounds:', error);
    return { success: false, error: error.message };
  }
}


function getDoubleRoundByHash(roundId) {
  return db.prepare('SELECT * FROM double_rounds WHERE round_id = ?').get(roundId);
}


// --- ФУНКЦИИ: double_bets_log ---

// Запись новой ставки
function logDoubleBet(entry) {
  try {
    const info = db.prepare(`
      INSERT INTO double_bets_log 
      (ts, round_id, user_id, username, chat_id, chat_title, multiplier, amount, status, reject_reason, game_choice) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.ts || Date.now(),
      entry.roundId,
      entry.userId.toString(),
      entry.username || 'Неизвестный',
      entry.chatId != null ? entry.chatId.toString() : null,
      entry.chatTitle || null,
      entry.multiplier,
      entry.amount,
      entry.status || 'accepted',
      entry.rejectReason || null,
      entry.gameChoice || null
    );
    return { success: true, id: info.lastInsertRowid };
  } catch (error) {
    console.error('[DB] Ошибка при записи в double_bets_log:', error);
    return { success: false, error: error.message };
  }
}

// Обновление исхода конкретной ставки по ID (если нужно точечно)
function updateDoubleBetOutcome(betId, isWin, winAmount = 0) {
  try {
    const info = db.prepare(`
      UPDATE double_bets_log 
      SET is_win = ?, win_amount = ?, payout_status = ? 
      WHERE id = ?
    `).run(isWin ? 1 : 0, winAmount, isWin ? 'paid' : 'lost', betId);
    return { success: info.changes > 0 };
  } catch (error) {
    console.error('[DB] Ошибка при обновлении итога ставки:', error);
    return { success: false, error: error.message };
  }
}

// Пометить ставки группы (раунд+игрок+чат+множитель) оплаченными/проигрышными
function updateDoubleBetPayoutByGroup(roundId, userId, chatId, multiplier, isWin, multiplierValue) {
  try {
    return db.prepare(`
      UPDATE double_bets_log
      SET is_win = ?, win_amount = CASE WHEN ? = 1 THEN amount * ? ELSE 0 END, payout_status = ?
      WHERE round_id = ? AND user_id = ? AND chat_id = ? AND multiplier = ? AND status = 'accepted' AND payout_status = 'pending'
    `).run(isWin ? 1 : 0, isWin ? 1 : 0, multiplierValue, isWin ? 'paid' : 'lost', roundId, userId.toString(), chatId.toString(), multiplier).changes;
  } catch (error) {
    console.error('[DB] Ошибка при групповом обновлении выплат:', error);
    return 0;
  }
}

// Пометить ставку как провальную (ошибка выплаты)
function markDoubleBetPayoutFailed(roundId, userId, chatId, multiplier) {
  try {
    return db.prepare(`
      UPDATE double_bets_log SET payout_status = 'failed'
      WHERE round_id = ? AND user_id = ? AND chat_id = ? AND multiplier = ? AND status = 'accepted' AND payout_status = 'pending'
    `).run(roundId, userId.toString(), chatId.toString(), multiplier).changes;
  } catch (error) {
    console.error('[DB] Ошибка при пометке failed:', error);
    return 0;
  }
}

// Пометить все ставки раунда как провальные (при отмене раунда)
function markRoundBetsFailed(roundId) {
  try {
    return db.prepare(`UPDATE double_bets_log SET payout_status = 'failed', status = 'rejected', reject_reason = 'Раунд отменен'
                       WHERE round_id = ? AND status = 'accepted' AND payout_status = 'pending'`).run(roundId).changes;
  } catch (error) {
    console.error('[DB] Ошибка при отмене ставок раунда:', error);
    return 0;
  }
}

function updateDoubleBetGameChoice(betId, gameChoice) {
  try {
    const info = db.prepare('UPDATE double_bets_log SET game_choice = ? WHERE id = ?').run(gameChoice, betId);
    return { success: info.changes > 0 };
  } catch (error) {
    console.error('[DB] Ошибка при обновлении game_choice:', error);
    return { success: false, error: error.message };
  }
}


// Обновить выбор ячейки (left/right) для GAME
function updateGameChoicesForRoundUser(roundId, userId, chatId, choice) {
  try {
    return db.prepare(`
      UPDATE double_bets_log SET game_choice = ?
      WHERE round_id = ? AND user_id = ? AND chat_id = ? AND multiplier = 'GAME' AND status = 'accepted'
    `).run(choice, roundId, userId.toString(), chatId.toString()).changes;
  } catch (error) {
    console.error('[DB] Ошибка при обновлении game_choice:', error);
    return 0;
  }
}

function getDoubleBetsByRound(roundId) {
  try {
    return db.prepare('SELECT * FROM double_bets_log WHERE round_id = ? ORDER BY ts ASC').all(roundId);
  } catch (error) {
    console.error('[DB] Ошибка при выборке ставок раунда:', error);
    return [];
  }
}


// --- ВЫБОРКИ ДЛЯ АДМИН-ПАНЕЛИ MINI APP (ДАБЛ) ---

// ВИД «РАУНДЫ»: фильтр по времени + поиск по подстроке хеша
function getAdminDoubleRoundsView({ targetTs = null, hash = null, limit = 50 } = {}) {
  try {
    const where = [];
    const params = [];
    if (hash) {
      const safe = String(hash).replace(/[%_]/g, '');
      if (safe) { where.push('round_id LIKE ?'); params.push('%' + safe + '%'); }
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    
    if (targetTs) {
      const half = Math.ceil(limit / 2);
      const cond = whereSql ? 'AND' : 'WHERE';
      const q1 = `SELECT * FROM double_rounds ${whereSql} ${cond} start_ts <= ? ORDER BY start_ts DESC LIMIT ?`;
      const r1 = db.prepare(q1).all(...params, targetTs, half);
      
      const q2 = `SELECT * FROM double_rounds ${whereSql} ${cond} start_ts > ? ORDER BY start_ts ASC LIMIT ?`;
      const r2 = db.prepare(q2).all(...params, targetTs, half);
      
      const rows = [...r1, ...r2].sort((a, b) => b.start_ts - a.start_ts);
      return { rows, total: rows.length };
    } else {
      const rows = db.prepare(`SELECT * FROM double_rounds ${whereSql} ORDER BY start_ts DESC LIMIT ?`).all(...params, limit);
      return { rows, total: rows.length };
    }
  } catch (e) { return { rows: [], total: 0 }; }
}

// ВИД «СТАВКИ»: строка = (раунд + игрок + чат); поиск по игроку ИЛИ по хешу раунда.
// Время: targetTs = null → последние записи; targetTs = число → окно вокруг момента.
function getAdminDoubleBetsView({ targetTs = null, searchIds = null, hash = null, limit = 30, offset = 0 } = {}) {
  try {
    // --- условие поиска: игрок (TG/numeric ID) ИЛИ хеш раунда ---
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

    const baseFrom = `FROM double_bets_log b
       JOIN double_rounds r ON r.round_id = b.round_id
       LEFT JOIN users u ON u.id = b.user_id`;
    const groupCols = `b.round_id, b.user_id, b.chat_id`;
    const selectCols = `b.round_id, b.user_id, b.chat_id, MIN(b.ts) as ts,
       u.username as user_name, u.numeric_id as user_num,
       r.start_ts as round_start_ts, r.end_ts as round_end_ts,
       r.result_multiplier, r.salt, r.status as round_status,
       MAX(b.chat_title) as chat_title`;
    const betsStmt = db.prepare(`
      SELECT multiplier, amount, is_win, win_amount, game_choice, payout_status
      FROM double_bets_log
      WHERE round_id = ? AND user_id = ? AND chat_id = ?
      ORDER BY ts ASC
    `);

    // --- РЕЖИМ ОКНА: ближайшие записи до и после выбранного момента ---
    if (typeof targetTs === 'number' && !Number.isNaN(targetTs)) {
      const half = Math.max(1, Math.ceil(limit / 2));
      const before = db.prepare(`SELECT ${selectCols} ${baseFrom}
         WHERE r.start_ts <= ?${searchSql}
         GROUP BY ${groupCols}
         ORDER BY ts DESC LIMIT ?`).all(targetTs, ...searchParams, half);
      const after = db.prepare(`SELECT ${selectCols} ${baseFrom}
         WHERE r.start_ts > ?${searchSql}
         GROUP BY ${groupCols}
         ORDER BY ts ASC LIMIT ?`).all(targetTs, ...searchParams, half);
      const rows = [...after.reverse(), ...before]
        .map(g => ({ ...g, bets: betsStmt.all(g.round_id, g.user_id, g.chat_id) }));
      return { rows, total: rows.length, window: true };
    }

    // --- ОБЫЧНЫЙ РЕЖИМ: последние записи + пагинация ---
    const query = `SELECT ${selectCols} ${baseFrom}
       WHERE 1=1${searchSql}
       GROUP BY ${groupCols}
       ORDER BY ts DESC LIMIT ? OFFSET ?`;
    const groups = db.prepare(query).all(...searchParams, limit, offset);

    const countQuery = `SELECT COUNT(*) as c FROM (
       SELECT 1 ${baseFrom}
       WHERE 1=1${searchSql}
       GROUP BY ${groupCols})`;
    const totalResult = db.prepare(countQuery).get(...searchParams);
    const total = totalResult ? totalResult.c : 0;

    const rows = groups.map(g => ({ ...g, bets: betsStmt.all(g.round_id, g.user_id, g.chat_id) }));
    return { rows, total, window: false };
  } catch (e) {
    console.error('[DB] Ошибка выборки ставок дабла:', e);
    return { rows: [], total: 0 };
  }
}


// --- ЧИСТКА ЛОГОВ ---

function cleanupDoubleRounds(maxAgeDays = 3) {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const info = db.prepare('DELETE FROM double_rounds WHERE start_ts < ?').run(cutoff);
    if (info.changes > 0) console.log(`[DB] Очищено double_rounds: ${info.changes}`);
    return info.changes;
  } catch (error) {
    console.error('[DB] Ошибка при очистке double_rounds:', error);
    return 0;
  }
}

function cleanupDoubleBetsLog(maxAgeDays = 30) {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const info = db.prepare('DELETE FROM double_bets_log WHERE ts < ?').run(cutoff);
    if (info.changes > 0) console.log(`[DB] Очищено double_bets_log: ${info.changes}`);
    return info.changes;
  } catch (error) {
    console.error('[DB] Ошибка при очистке double_bets_log:', error);
    return 0;
  }
}

// Общая джоба очистки всех логов (вызывается из bot.js по расписанию)
function runLogsCleanup() {
  try {
    if (typeof cleanupOldMessageLogs === 'function') cleanupOldMessageLogs(30);   // message_log: 30 дней
    if (typeof cleanupFinanceLog === 'function') cleanupFinanceLog(365);          // finance_log: 365 дней
    cleanupDoubleRounds(3);      // double_rounds: 3 суток
    cleanupDoubleBetsLog(30);    // double_bets_log: 30 дней
    console.log('[DB] Плановая очистка логов завершена.');
  } catch (error) {
    console.error('[DB] Ошибка при плановой очистке логов:', error);
  }
}

// === ВЫБОРКИ ЛОГОВ ДЛЯ АДМИН-ПАНЕЛИ MINI APP ===
function resolveLogSearchIds(search) {
  if (!search) return null;
  const s = String(search).trim();
  if (!s) return null;
  const ids = [s];
  const byNum = db.prepare('SELECT id FROM users WHERE numeric_id = ?').get(parseInt(s, 10) || -1);
  if (byNum && !ids.includes(byNum.id)) ids.push(byNum.id);
  return ids;
}

// Режим «общее»: finance_log + ники обеих сторон
function getAdminLogsFinance({ targetTs = null, types = null, searchIds = null, limit = 50 } = {}) {
  try {
    const where = [`((f.action IS NOT NULL AND f.action != '') OR f.amount IS NOT NULL OR f.target_user_id IS NOT NULL OR f.actor_user_id IS NOT NULL)`];
    const params = [];

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
    const selectCols = `f.id, f.ts, f.type, f.actor_user_id, f.target_user_id, f.amount, f.currency, f.ref, f.reason, f.action, f.payload, f.success, f.chat_id, f.chat_title, f.chat_type, a.username AS actor_name, a.numeric_id AS actor_num, t.username AS target_name, t.numeric_id AS target_num`;
    const joins = `FROM finance_log f LEFT JOIN users a ON CAST(a.id AS TEXT) = CAST(f.actor_user_id AS TEXT) LEFT JOIN users t ON CAST(t.id AS TEXT) = CAST(f.target_user_id AS TEXT)`;

    let rows = [];

    if (targetTs) {
      const half = Math.ceil(limit / 2);
      
      // 1. Записи ДО и включая targetTs (использует индекс ts)
      const q1 = `SELECT ${selectCols} ${joins} ${whereSql} AND f.ts <= ? ORDER BY f.ts DESC LIMIT ?`;
      const r1 = db.prepare(q1).all(...params, targetTs, half);
      
      // 2. Записи ПОСЛЕ targetTs
      const q2 = `SELECT ${selectCols} ${joins} ${whereSql} AND f.ts > ? ORDER BY f.ts ASC LIMIT ?`;
      const r2 = db.prepare(q2).all(...params, targetTs, half);
      
      // Объединяем и сортируем по убыванию
      rows = [...r1, ...r2].sort((a, b) => b.ts - a.ts);
      return { rows, total: rows.length, page: 1, pages: 1 };
    } else {
      // Обычный режим (последние записи)
      const q = `SELECT ${selectCols} ${joins} ${whereSql} ORDER BY f.ts DESC LIMIT ?`;
      rows = db.prepare(q).all(...params, limit);
      return { rows, total: rows.length, page: 1, pages: 1 };
    }
  } catch (error) {
    console.error('[DB] Ошибка выборки finance-логов:', error);
    return { rows: [], total: 0 };
  }
}


// Режим «дабл»: ставки + раунды (и активные, и завершенные)
function getAdminLogsDouble({ sinceTs = 0, searchIds = null, limit = 30, offset = 0 } = {}) {
  try {
    let bets;
    if (searchIds && searchIds.length) {
      const ph = searchIds.map(() => '?').join(',');
      bets = db.prepare(`SELECT b.*, u.numeric_id AS user_num FROM double_bets_log b LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(b.user_id AS TEXT) WHERE b.ts >= ? AND CAST(b.user_id AS TEXT) IN (${ph}) ORDER BY b.ts DESC`).all(sinceTs, ...searchIds);
    } else {
      bets = db.prepare(`SELECT b.*, u.numeric_id AS user_num FROM double_bets_log b LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(b.user_id AS TEXT) WHERE b.ts >= ? ORDER BY b.ts DESC`).all(sinceTs);
    }

    // --- ИСПРАВЛЕНИЕ: Убрали "end_ts IS NOT NULL", теперь видим и активные раунды ---
    const rounds = (searchIds && searchIds.length) ? [] : db.prepare(`SELECT * FROM double_rounds WHERE start_ts >= ? ORDER BY start_ts DESC`).all(sinceTs);

    const merged = [
      ...bets.map(b => ({
        id: b.id,
        ts: b.ts,
        userId: b.user_id,
        userName: b.username || 'Неизвестный',
        userNum: b.user_num,
        targetId: String(b.round_id).slice(0, 8),
        targetName: null,
        action: b.status === 'rejected'
          ? `Ставка отклонена: ${b.reject_reason || 'причина не указана'} (${b.amount} PF, ${b.multiplier})`
          : `Ставка ${b.amount} PF на ${b.multiplier}${b.game_choice ? ' (' + b.game_choice + ')' : ''} → ${b.is_win === 1 ? 'выигрыш ' + b.win_amount : b.is_win === 0 ? 'проигрыш' : 'в игре'}`,
      })),
      ...rounds.map(r => ({
        id: 'r' + r.round_id,
        ts: r.start_ts, // Сортируем по времени старта
        userId: null,
        userName: r.status === 'active' ? ' РАУНД ИДЕТ' : 'РАУНД',
        userNum: null,
        targetId: String(r.round_id).slice(0, 8),
        targetName: null,
        action: r.status === 'active' 
            ? `Идет игра... Банк: ${r.total_bank || 0}, ставок: ${r.bets_count || 0}`
            : `Итог: ${r.result_multiplier || '—'}, банк ${r.total_bank || 0}, ставок ${r.bets_count || 0}`,
      })),
    ].sort((a, b) => b.ts - a.ts);

    return { rows: merged.slice(offset, offset + limit), total: merged.length };
  } catch (error) {
    console.error('[DB] Ошибка выборки double-логов:', error);
    return { rows: [], total: 0 };
  }
}

// Детали раунда для Mini App: участники, чаты, список ставок
function getDoubleRoundDetails(roundId) {
  try {
    const round = db.prepare('SELECT * FROM double_rounds WHERE round_id = ?').get(roundId);
    if (!round) return { success: false, error: 'Раунд не найден' };
    const bets = db.prepare(`SELECT b.id, b.ts, b.user_id, b.username, b.chat_id, b.chat_title, b.multiplier, b.amount, b.game_choice, b.is_win, b.win_amount, b.payout_status, u.numeric_id AS user_num
                             FROM double_bets_log b LEFT JOIN users u ON u.id = b.user_id
                             WHERE b.round_id = ? AND b.status = 'accepted' ORDER BY b.ts ASC`).all(roundId);
    const pMap = new Map();
    const cMap = new Map();
    for (const b of bets) {
      if (!pMap.has(b.user_id)) pMap.set(b.user_id, { user_id: b.user_id, username: b.username, user_num: b.user_num, bets: 0, bank: 0, won: 0 });
      const p = pMap.get(b.user_id);
      p.bets += 1; p.bank += b.amount; if (b.is_win === 1) p.won += (b.win_amount || 0);
      if (!cMap.has(b.chat_id)) cMap.set(b.chat_id, { chat_id: b.chat_id, chat_title: b.chat_title, bets: 0, bank: 0 });
      const c = cMap.get(b.chat_id);
      c.bets += 1; c.bank += b.amount;
    }
    return { success: true, round, participants: [...pMap.values()], chats: [...cMap.values()], bets };
  } catch (e) {
    console.error('[DB] Ошибка деталей раунда:', e);
    return { success: false, error: e.message };
  }
}

// ============================================================
// === DOUBLE GAME STATE MACHINE ===
// ============================================================

// Таблица текущего состояния раунда (единый источник правды)
db.prepare(`CREATE TABLE IF NOT EXISTS double_round_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'ACCEPTING',
  hash TEXT,
  result TEXT,
  salt TEXT,
  end_time INTEGER,
  cell_contents TEXT,
  final_multipliers TEXT,
  game_button_active INTEGER DEFAULT 0,
  processed_chats TEXT DEFAULT '[]',
  game_choices TEXT DEFAULT '{}',
  global_choices TEXT DEFAULT '{}',
  notifications TEXT DEFAULT '{}',
  updated_at INTEGER NOT NULL
)`).run();

// Таблица дедупликации уведомлений
db.prepare(`CREATE TABLE IF NOT EXISTS double_notifications (
  notification_key TEXT PRIMARY KEY,
  round_hash TEXT NOT NULL,
  sent_at INTEGER NOT NULL
)`).run();

function getDoubleRoundState() {
  try {
    const row = db.prepare('SELECT * FROM double_round_state WHERE id = 1').get();
    if (!row) return null;
    return {
      state: row.state,
      hash: row.hash,
      result: row.result,
      salt: row.salt,
      endTime: row.end_time,
      cellContents: row.cell_contents ? JSON.parse(row.cell_contents) : null,
      finalMultipliers: row.final_multipliers ? JSON.parse(row.final_multipliers) : null,
      gameButtonActive: !!row.game_button_active,
      processedChats: JSON.parse(row.processed_chats || '[]'),
      gameChoices: JSON.parse(row.game_choices || '{}'),
      globalChoices: JSON.parse(row.global_choices || '{}'),
      notifications: JSON.parse(row.notifications || '{}'),
    };
  } catch (e) { return null; }
}

function setDoubleRoundState(state) {
  try {
    db.prepare(`INSERT OR REPLACE INTO double_round_state
      (id, state, hash, result, salt, end_time, cell_contents, final_multipliers,
       game_button_active, processed_chats, game_choices, global_choices, notifications, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      state.state || 'ACCEPTING',
      state.hash || null,
      state.result || null,
      state.salt || null,
      state.endTime || null,
      state.cellContents ? JSON.stringify(state.cellContents) : null,
      state.finalMultipliers ? JSON.stringify(state.finalMultipliers) : null,
      state.gameButtonActive ? 1 : 0,
      JSON.stringify(state.processedChats || []),
      JSON.stringify(state.gameChoices || {}),
      JSON.stringify(state.globalChoices || {}),
      JSON.stringify(state.notifications || {}),
      Date.now()
    );
  } catch (e) { console.error('[DB] setDoubleRoundState:', e.message); }
}

function getDoubleNotification(key) {
  try { return !!db.prepare('SELECT 1 FROM double_notifications WHERE notification_key = ?').get(key); }
  catch (e) { return false; }
}

function markDoubleNotificationSent(key, roundHash = '') {
  try { db.prepare('INSERT OR IGNORE INTO double_notifications (notification_key, round_hash, sent_at) VALUES (?, ?, ?)').run(key, roundHash, Date.now()); }
  catch (e) {}
}

function refundBetsForRound(roundHash) {
  try {
    const refunds = db.prepare(`
      SELECT user_id, SUM(amount) as total FROM double_bets_log
      WHERE round_id = ? AND status = 'accepted' AND payout_status = 'pending'
      GROUP BY user_id
    `).all(roundHash);
    let count = 0;
    for (const r of refunds) {
      try { updateUserBalance(r.user_id, r.total); count++; } catch (e) {}
    }
    db.prepare(`UPDATE double_bets_log SET payout_status = 'refunded', status = 'rejected'
      WHERE round_id = ? AND status = 'accepted' AND payout_status = 'pending'`).run(roundHash);
    return count;
  } catch (e) { return 0; }
}

function cleanupDoubleNotifications(maxAgeDays = 7) {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM double_notifications WHERE sent_at < ?').run(cutoff);
  } catch (e) {}
}

// +1 к счётчику выигранных GAME
function incrementGameWins(userId, amount = 1) {
  try {
    return db.prepare('UPDATE users SET game_wins = game_wins + ? WHERE id = ?').run(amount, userId.toString()).changes;
  } catch (e) {
    console.error('[DB] incrementGameWins:', e.message);
    return 0;
  }
}

// Полное обнуление игровой статистики всех игроков
function resetAllDoubleStatistics() {
  try {
    db.exec('BEGIN TRANSACTION;');
    db.prepare(`UPDATE users SET
      total_rounds = 0, round_wins = 0, round_losses = 0,
      double_total_bets = 0, double_wins = 0, double_losses = 0,
      double_total_winnings = 0, double_total_losses = 0,
      game_wins = 0, max_win_amount = 0, max_bet_amount = 0,
      multiplier_stats = '{}', current_win_streak = 0, best_win_streak = 0`).run();
    db.prepare('DELETE FROM bet_history').run();
    db.exec('COMMIT;');
    return { success: true };
  } catch (e) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[DB] resetAllDoubleStatistics:', e.message);
    return { success: false, error: e.message };
  }
}

// === РАСШИРЕННАЯ СТАТИСТИКА ДАБЛА ===
function updateMaxBetIfGreater(userId, amount) {
  try {
    return db.prepare('UPDATE users SET max_bet_amount = ? WHERE id = ? AND (? > max_bet_amount)').run(amount, userId.toString(), amount).changes;
  } catch (e) { console.error('[DB] updateMaxBetIfGreater:', e.message); return 0; }
}

function updateMaxWinIfGreater(userId, winAmount) {
  try {
    return db.prepare('UPDATE users SET max_win_amount = ? WHERE id = ? AND (? > max_win_amount)').run(winAmount, userId.toString(), winAmount).changes;
  } catch (e) { console.error('[DB] updateMaxWinIfGreater:', e.message); return 0; }
}

function incrementMultiplierCount(userId, multiplier) {
  try {
    const user = db.prepare('SELECT multiplier_stats FROM users WHERE id = ?').get(userId.toString());
    if (!user) return 0;
    const stats = JSON.parse(user.multiplier_stats || '{}');
    stats[multiplier] = (stats[multiplier] || 0) + 1;
    return db.prepare('UPDATE users SET multiplier_stats = ? WHERE id = ?').run(JSON.stringify(stats), userId.toString()).changes;
  } catch (e) { console.error('[DB] incrementMultiplierCount:', e.message); return 0; }
}

function getMultiplierStats(userId) {
  try {
    const user = db.prepare('SELECT multiplier_stats FROM users WHERE id = ?').get(userId.toString());
    return JSON.parse(user?.multiplier_stats || '{}');
  } catch (e) { return {}; }
}

// Серия: true — победа в раунде одиночной ставкой (+1), false — серия обрывается (0)
function updateWinStreak(userId, wonSingle) {
  try {
    if (wonSingle) {
      return db.prepare(`UPDATE users SET current_win_streak = current_win_streak + 1,
        best_win_streak = MAX(best_win_streak, current_win_streak + 1) WHERE id = ?`).run(userId.toString()).changes;
    }
    return db.prepare('UPDATE users SET current_win_streak = 0 WHERE id = ? AND current_win_streak > 0').run(userId.toString()).changes;
  } catch (e) { console.error('[DB] updateWinStreak:', e.message); return 0; }
}

// Таблица алиасов для промо-ссылок (транслитерация кириллицы)
db.prepare(`CREATE TABLE IF NOT EXISTS promo_link_aliases (
  alias TEXT PRIMARY KEY,
  promo_name TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
)`).run();

// Транслитерация кириллицы в латиницу
function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return text.toLowerCase().split('').map(char => map[char] || char).join('')
    .replace(/[^a-z0-9_-]/g, '').toUpperCase();
}

// Генерация уникального алиаса для промокода
function generatePromoAlias(promoName) {
  const baseAlias = transliterate(promoName);
  if (!baseAlias) return null; // Если после транслитерации пусто (например, только эмодзи)
  
  // Проверяем, занят ли базовый алиас
  const existing = db.prepare('SELECT promo_name FROM promo_link_aliases WHERE alias = ?').get(baseAlias);
  if (!existing) return baseAlias;
  if (existing.promo_name === promoName) return baseAlias; // Уже наш
  
  // Ищем свободный с суффиксом
  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseAlias}_${i}`;
    const check = db.prepare('SELECT promo_name FROM promo_link_aliases WHERE alias = ?').get(candidate);
    if (!check) return candidate;
    if (check.promo_name === promoName) return candidate;
  }
  return `${baseAlias}_${Date.now()}`; // Fallback с timestamp
}

// Сохранение алиаса
function savePromoAlias(alias, promoName) {
  try {
    db.prepare('INSERT OR REPLACE INTO promo_link_aliases (alias, promo_name) VALUES (?, ?)').run(alias, promoName);
    return { success: true, alias };
  } catch (e) {
    console.error('[DB] savePromoAlias:', e.message);
    return { success: false };
  }
}

// Получение оригинального имени промокода по алиасу
function getPromoNameByAlias(alias) {
  try {
    const row = db.prepare('SELECT promo_name FROM promo_link_aliases WHERE alias = ?').get(alias.toUpperCase());
    return row?.promo_name || null;
  } catch (e) {
    return null;
  }
}

// Удаление алиаса при удалении промокода
function deletePromoAlias(promoName) {
  try {
    db.prepare('DELETE FROM promo_link_aliases WHERE promo_name = ?').run(promoName);
  } catch (e) {}
}

// ============================================================
// === БАНК РЕФЕРОВОДА И ФОРТУНА-ТИКЕТЫ ===
// ============================================================

/**
 * Получить ID реферера (пригласившего) для пользователя.
 * @param {string|number} userId
 * @returns {string|null} ID реферера или null
 */
function getReferrerId(userId) {
  try {
      const row = db.prepare('SELECT referrer_id FROM users WHERE id = ?').get(userId.toString());
      return row?.referrer_id || null;
  } catch (e) {
      console.error('[DB] getReferrerId:', e.message);
      return null;
  }
}

/**
* Получить количество рефералов у пользователя.
* @param {string|number} referrerId
* @returns {number}
*/
function getReferralCount(referrerId) {
  try {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?').get(referrerId.toString());
      return row?.cnt || 0;
  } catch (e) {
      console.error('[DB] getReferralCount:', e.message);
      return 0;
  }
}

/**
* Получить процент для банка реферовода на основе количества рефералов.
* Возвращает число в процентах (например, 0.1 = 0.1%).
* @param {number} referralCount
* @returns {number}
*/
function getReferrerBankPercent(referralCount) {
  const { REFERRER_BANK_TIERS } = require('./config');
  for (const tier of REFERRER_BANK_TIERS) {
      if (referralCount >= tier.minRefs && referralCount <= tier.maxRefs) {
          return tier.percent;
      }
  }
  return REFERRER_BANK_TIERS[0].percent; // fallback на минимальный
}

/**
* Добавить сумму в банк реферовода (с учётом лимита).
* Если банк полон — бонус сгорает.
* @param {string|number} referrerId — ID реферовода
* @param {number} winAmount — сумма победы реферала
* @returns {{ added: number, burned: number, newBank: number }}
*/
function addToReferrerBank(referrerId, winAmount) {
  const { REFERRER_BANK_LIMIT } = require('./config');
  try {
      if (!referrerId || winAmount <= 0) return { added: 0, burned: 0, newBank: 0 };

      const referralCount = getReferralCount(referrerId);
      const percent = getReferrerBankPercent(referralCount);
      const bonusAmount = Math.floor(winAmount * (percent / 100));

      if (bonusAmount <= 0) return { added: 0, burned: 0, newBank: 0 };

      const user = db.prepare('SELECT referrer_bank FROM users WHERE id = ?').get(referrerId.toString());
      const currentBank = user?.referrer_bank || 0;

      const newBank = Math.min(currentBank + bonusAmount, REFERRER_BANK_LIMIT);
      const added = newBank - currentBank;
      const burned = bonusAmount - added;

      if (added > 0) {
          db.prepare('UPDATE users SET referrer_bank = ? WHERE id = ?').run(newBank, referrerId.toString());
      }

      return { added, burned, newBank };
  } catch (e) {
      console.error('[DB] addToReferrerBank:', e.message);
      return { added: 0, burned: 0, newBank: 0 };
  }
}

/**
* Получить текущий баланс банка реферовода.
* @param {string|number} userId
* @returns {number}
*/
function getReferrerBank(userId) {
  try {
      const row = db.prepare('SELECT referrer_bank FROM users WHERE id = ?').get(userId.toString());
      return row?.referrer_bank || 0;
  } catch (e) {
      console.error('[DB] getReferrerBank:', e.message);
      return 0;
  }
}

/**
* Снять всю сумму из банка реферовода на основной баланс PF.
* @param {string|number} userId
* @returns {{ success: boolean, amount: number, message?: string }}
*/
function withdrawReferrerBank(userId) {
  try {
      const user = db.prepare('SELECT referrer_bank FROM users WHERE id = ?').get(userId.toString());
      const bankAmount = user?.referrer_bank || 0;

      if (bankAmount <= 0) {
          return { success: false, amount: 0, message: 'Банк пуст.' };
      }

      db.exec('BEGIN TRANSACTION;');
      try {
          db.prepare('UPDATE users SET referrer_bank = 0 WHERE id = ?').run(userId.toString());
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(bankAmount, userId.toString());
          db.exec('COMMIT;');

          // Логирование
          try {
              db.prepare(
                  'INSERT INTO finance_log (actor_user_id, type, amount, success, ref) VALUES (?, ?, ?, 1, ?)'
              ).run(userId.toString(), 'referrer_bank_withdraw', bankAmount, 'referrer_bank');
          } catch (logErr) {
              console.error('[DB] withdrawReferrerBank log:', logErr.message);
          }

          return { success: true, amount: bankAmount };
      } catch (e) {
          db.exec('ROLLBACK;');
          throw e;
      }
  } catch (e) {
      console.error('[DB] withdrawReferrerBank:', e.message);
      return { success: false, amount: 0, message: e.message };
  }
}

/**
* Выдать билетики фортуны пользователю.
* @param {string|number} userId
* @param {number} amount
* @returns {number} количество изменённых строк
*/
function giveFortuneTicket(userId, amount) {
  try {
      return db.prepare('UPDATE users SET fortune_tickets = fortune_tickets + ? WHERE id = ?')
          .run(amount, userId.toString()).changes;
  } catch (e) {
      console.error('[DB] giveFortuneTicket:', e.message);
      return 0;
  }
}

/**
* Получить количество билетиков фортуны у пользователя.
* @param {string|number} userId
* @returns {number}
*/
function getFortuneTickets(userId) {
  try {
      const row = db.prepare('SELECT fortune_tickets FROM users WHERE id = ?').get(userId.toString());
      return row?.fortune_tickets || 0;
  } catch (e) {
      console.error('[DB] getFortuneTickets:', e.message);
      return 0;
  }
}


function createPartnerRequest(partnerId, name, prizeType, prizeAmount, audienceType, template) {
  const stmt = db.prepare('INSERT INTO partner_requests (partner_id, name, prize_type, prize_amount, audience_type, template) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(partnerId, name, prizeType, prizeAmount, audienceType, template);
  return info.lastInsertRowid;
}

function updatePartnerRequestAdminMessageId(requestId, messageId) {
  db.prepare('UPDATE partner_requests SET admin_message_id = ? WHERE id = ?').run(messageId, requestId);
}

function updatePartnerRequestStatus(requestId, status) {
  db.prepare('UPDATE partner_requests SET status = ? WHERE id = ?').run(status, requestId);
}

function getPartnerRequestsByPartner(partnerId) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE partner_id = ? ORDER BY created_at DESC LIMIT 10');
  return stmt.all(partnerId);
}

function getPartnerRequestByPartnerAndName(partnerId, name, status) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE partner_id = ? AND name = ? AND status = ?');
  return stmt.get(partnerId, name, status);
}

function getPartnerRequestById(requestId) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE id = ?');
  return stmt.get(requestId);
}

function createPartnerPromo(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt, creatorId, audienceType, template) {
  const stmt = db.prepare(
    'INSERT INTO promos (name, activations_left, prize_type, prize_amount, created_by, min_status_id, expires_at, creator_id, audience_type, template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  try {
    stmt.run(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt, creatorId, audienceType, template);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Промокод с таким названием уже существует.' };
  }
}
// ========== ФУНКЦИЯ ПРОВЕРКИ ПРИОРИТЕТА (ДЛЯ ПАРТНЕРКИ) ==========
function getUserMaxPriority(userId) {
  try {
    // 1. Получаем пользователя
    const user = db.prepare('SELECT status_ids FROM users WHERE id = ?').get(userId.toString());
    if (!user || !user.status_ids) return 0;

    // 2. Парсим JSON массив ID статусов
    let statusIds = [];
    try {
      statusIds = JSON.parse(user.status_ids);
    } catch (e) {
      console.error('[DB] Ошибка парсинга status_ids:', e);
      return 0;
    }

    if (!Array.isArray(statusIds) || statusIds.length === 0) return 0;

    // 3. Получаем приоритеты этих статусов
    // Используем IN (...) для запроса всех статусов разом
    const placeholders = statusIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT priority FROM statuses WHERE id IN (${placeholders})`);
    const rows = stmt.all(...statusIds);

    // 4. Находим максимум
    let max = 0;
    for (const row of rows) {
      if (row.priority > max) max = row.priority;
    }
    
    console.log(`[DB] getUserMaxPriority(${userId}): statusIds=${JSON.stringify(statusIds)}, maxPriority=${max}`);
    return max;
  } catch (e) {
    console.error('[DB] Критическая ошибка в getUserMaxPriority:', e);
    return 0;
  }
}
// ==================================================================

function getPartnerRequestsStats(partnerId, hours = 24) {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - (hours * 3600);
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM partner_requests 
      WHERE partner_id = ? AND created_at >= ?
    `);
    const row = stmt.get(partnerId.toString(), cutoff);
    return {
      total: row.total || 0,
      approved: row.approved || 0,
      pending: row.pending || 0,
      rejected: row.rejected || 0
    };
  } catch (e) {
    console.error('[DB] getPartnerRequestsStats error:', e);
    return { total: 0, approved: 0, pending: 0, rejected: 0 };
  }
}

function createPartnerRequest(partnerId, name, prizeType, prizeAmount, audienceType, template) {
  const stmt = db.prepare('INSERT INTO partner_requests (partner_id, name, prize_type, prize_amount, audience_type, template) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(partnerId.toString(), name, prizeType, prizeAmount, audienceType, template || 'normal');
  return info.lastInsertRowid;
}

function createPartnerCurrencyRequest(partnerId, name, currencyType, amount) {
  const stmt = db.prepare('INSERT INTO partner_requests (partner_id, name, prize_type, prize_amount, audience_type, template, request_type) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(partnerId.toString(), name, currencyType, amount, 'all', 'normal', 'currency');
  return info.lastInsertRowid;
}

function updatePartnerRequestAdminMessageId(requestId, messageId) {
  db.prepare('UPDATE partner_requests SET admin_message_id = ? WHERE id = ?').run(messageId, requestId);
}

function updatePartnerRequestStatus(requestId, status) {
  db.prepare('UPDATE partner_requests SET status = ? WHERE id = ?').run(status, requestId);
}

function getPartnerRequestsByPartner(partnerId) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE partner_id = ? ORDER BY created_at DESC LIMIT 10');
  return stmt.all(partnerId.toString());
}

function getPartnerRequestByPartnerAndName(partnerId, name, status) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE partner_id = ? AND name = ? AND status = ?');
  return stmt.get(partnerId.toString(), name, status);
}

function getPartnerRequestById(requestId) {
  const stmt = db.prepare('SELECT * FROM partner_requests WHERE id = ?');
  return stmt.get(requestId);
}

function createPartnerPromo(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt, creatorId, audienceType, template) {
  const stmt = db.prepare(
    'INSERT INTO promos (name, activations_left, prize_type, prize_amount, created_by, min_status_id, expires_at, creator_id, audience_type, template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  try {
    stmt.run(name, activations, prizeType, prizeAmount, createdBy, minStatusId, expiresAt, creatorId, audienceType, template);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Промокод с таким названием уже существует.' };
  }
}
// ========== КОНЕЦ ФУНКЦИЙ ==========

// ========== ПОЛУЧЕНИЕ ID СТАТУСОВ ПОЛЬЗОВАТЕЛЯ ==========
function getUserStatusIds(userId) {
  try {
    const user = db.prepare('SELECT status_ids FROM users WHERE id = ?').get(userId.toString());
    if (!user || !user.status_ids) return [];
    const ids = JSON.parse(user.status_ids);
    return Array.isArray(ids) ? ids : [];
  } catch (e) {
    console.error('[DB] getUserStatusIds error:', e);
    return [];
  }
}
// =========================================================


// Экспортируем функции
module.exports = {
  getUserById,
  getUserByNumericId,
  createUserOrUpdate,
  updateUserBalance,
  updateUserBalanceByNumericId,
  saveBet,
  getBetsByRoundId,
  updateLastBonusTime,
  getChatByChatId,
  activateDoubleMode,
  deactivateDoubleMode,
  isDoubleChat,
  activateDiceMode,
  deactivateDiceMode,
  isDiceChat,
  getActiveModeInChat,
  addChat,
  getReferralsByReferrerId, // Добавляем новую функцию для реферальной системы
  getUserByUsername,
  getAllUsers,
  createPromo,
  getPromoByName,
  getAllPromos,
  hasUserActivatedPromo, // Добавляем эту функцию
  recordPromoActivation, 
  getPromoById,
  deletePromoById,
  isUserBanned,
  addToBlacklist,
  removeFromBlacklist,
  getBlacklist,
  getBlacklistEntry,
  updateContainerCount,
  decreaseContainerCount,
  getMaxNumericId,
  getAllActiveDiceChats,
  saveDiceRound,
  saveDiceBet,
  updateDiceResults,
  getDiceBetsByRoundId,
  resetDiceRoundParticipants,
  getTotalDonatedStars,
  deleteFormIdFromDatabase,
  saveFormIdToDatabase,
  createStatus,
  getAllStatuses,
  getStatusById,
  getStatusByName,
  updateUserStatus,
  getUserStatuses,
  removeUserStatus,
  updateUserDFBalance,
  saveCardNumber,
  getCardNumber,
  saveCardDetails,
  getCardDetails,
  getDoubleStats,
  updateDoubleStatistics,
  incrementLikesReceived,
  incrementDislikesReceived,
  getUsersByStatuses,
  addMute,
  removeMute,
  isUserMuted,
  getMuteList,
  activatePromo,
  updateUserField,
  getTargetUserId,
  addDonationToHistory,
  getDonationHistory,
  updateTotalDonatedStars,
  getTopDonatorsFromDatabase,
  getReferrerId,
  isCardNumberUnique,
  updateUserSelectedSkin,
  getSelectedSkin,
  getAllSkinIds,
  getAllSkins,
  addSkinToUser,
  getSkinById,
  getUserAvailableSkins,
  deductCurrencyFromUser,
  getUserBalance,
  getCardTemplateById,
  getSelectedSkinFileName,
  deleteUserAccount,
  updateNumericId,
  getFreeReservedNumericIds,
  hasCard,
  updateCardBalance,
  getCardBalance,
  transaction,
  getUserBalances,
  getAllPrefixes,
  addPrefixToUser,
  removePrefixFromUser,
  getPrefixById,
  updateUserFieldByNumericId,
  saveBetDetails,
  getDetailedStats,
  updateRoundStatistics,
  updateMainBalance,
  updateUsername,
  updateSkinStock,
  getSkinStock,
  updateUserNpfShares,
  awardStatusToUser,
  listUserPrefixes,
  getUserNotificationSettings,
  updateUserNotifications,
  getSkinRarity,
  getActiveChatIdsByRoundHash,
  toggleHyperlink,
  isHyperlinkDisabled,
  getUserSkinsWithSerials,
  updateReferralBonusAmount,
  getSkinIdByName,
  getDetailedTopPlayers,
  getTopPlayersByContainers,
  takeItemFromUser,
  giveItemToUser,
  getTopPlayersByDfBalance,
  getTopPlayersByNpfShares,
  getTopPlayersByCardBalance,
  getTotalBalance,
  setReferralBonusForAllUsers,
  getUserSkinsByNumericId,
  giveSkinToUser,
  takeSkinFromUser,
  getUserByAnyId,
  getNumericIdByUserId,
  blockTransfersByNumericId,
  unblockTransfersByNumericId,
  areTransfersBlockedByNumericId,
  resetAccount,
  subtractReferrals,
  isUserHiddenInTop,
  toggleUserVisibilityInTop,
  getAllSpecialPrefixes,
  createSpecialPrefix,
  deleteSpecialPrefix,
  assignSpecialPrefixToUser,
  removeSpecialPrefixFromUser,
  getSpecialPrefixById,
  getTopReferrers,
  hasUnansweredReports,
  getUsersByStatus,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  updateUserData,
  getSeasonalReferralsByReferrerId,
  getTopSeasonalReferrers,
  getAuctionState,
  addNewBoss,
  getCurrentBoss,
  updateBossState,
  getCurrentEnergy,
  reduceUserEnergy,
  getUserAttackPower,
  getUserEnergyData,
  updateUserEnergy,
  updateAttackPower,
  getTopPlayersByBossDamage,
  addBossDamageToUser,
  getActiveWeapon,
  getWeaponById, 
  getWeaponByName,
  setActiveWeapon,
  getAllWeapons,
  resetBossDamage,
  reduceAttackPowerBy90Percent,
  transitionToPhase2,
  updateBossCorrectButtonIndex,
  getUsersWithDamage,
  getMaxEnergyByStatus,
  distributePrizesToTopPlayers,
  getLastAttackTime,
  updateLastAttackTime,
  setBossCallerId,
  getBossCallerId,
  reduceWeaponDurability,
  removeBrokenWeapon,
  switchToDefaultWeapon,
  getCurrentWeaponDurability,
  cleanupOldAttackStates,
  deleteAttackState,
  getAttackState,
  saveAttackState,
  updateAttackMessageId,
  addWeaponToUser,
  getOwnedWeapons,
  getBossDamageByUserId,
  getUserWeapons,
  getTopPlayersByAttackPower,
  updateSkinPrice,
  saveAuctionState,
  getCardLevel,   // <-- Добавляем новую
  updateCardLevel,   // <-- Добавляем новую
  getCardLimitByLevel,   // <-- Добавляем новую
  setCardLevelByNumericId,   // <-- Добавляем новую
  recordAdminAction,
  cleanupExpiredAdminActions,
  getAdminActionsInRange,  
  getLastAdminActionTime,
  getUserLastPrivateBonusTime,
  resetAllBonusTimes,
  getPlayerBalanceInfoByNumericId,
  setPlayerBalanceByNumericId,
  recordAdminKickAction,
  cleanupExpiredAdminKickActions,
  getAdminKickActionsInRange,
  getLastAdminKickActionTime,
  getUsersWithCards, // Добавляем новую функцию в экспорт
  getNpfStats,      // Экспортируем функцию получения статистики
  getUserNpfShares, // Экспортируем функцию получения акций
  updateUserNpfShares,
  giveTickets,
  awardPrizeToUser,
  getTickets,
  takeTickets,
  giveTicketsAdmin,  // НОВОЕ
  takeTicketsAdmin,  // НОВОЕ
  giveCandy,
  takeCandy,
  getSecretGifts,
  addSecretGift,
  takeSecretGift,
  getExpiredPromos, cleanupExpiredPromos,
  logMessage,
  getUserMessageLog,
  cleanupOldMessageLogs,
  logFinance,
  cleanupFinanceLog,
  createDoubleRound,
  getDoubleRoundByHash,
  logDoubleBet,
  updateDoubleBetOutcome,
  getDoubleBetsByRound,
  cleanupDoubleRounds,
  cleanupDoubleBetsLog,
  runLogsCleanup, 
  logAdminItem, 
  logModeration, FINANCE_LOG_CATEGORIES,
  resolveLogSearchIds, 
  getAdminLogsFinance, 
  getAdminLogsDouble,
  logMessage,
  updateDoubleBetPayoutByGroup, markDoubleBetPayoutFailed, markRoundBetsFailed, updateGameChoicesForRoundUser, finishDoubleRoundLog, getAdminDoubleRoundsView, getAdminDoubleBetsView,
  getDoubleRoundDetails,
  logPromoActivation,
  backfillPromoActivationLogs,
  getDoubleRoundState,
  setDoubleRoundState,
  getDoubleNotification,
  markDoubleNotificationSent,
  refundBetsForRound,
  cleanupDoubleNotifications,
  incrementGameWins, resetAllDoubleStatistics,
  updateMaxBetIfGreater, updateMaxWinIfGreater, incrementMultiplierCount, getMultiplierStats, updateWinStreak,
  getActivePlayersCount,
  generatePromoAlias, savePromoAlias, getPromoNameByAlias, deletePromoAlias, transliterate,
  getReferrerId,
  getReferralCount,
  getReferrerBankPercent,
  addToReferrerBank,
  getReferrerBank,
  withdrawReferrerBank,
  giveFortuneTicket,
  getFortuneTickets,
  getUserStatusesSync,
  getUserMaxPriority,
  createPartnerRequest,
  updatePartnerRequestAdminMessageId,
  updatePartnerRequestStatus,
  getPartnerRequestsByPartner,
  getPartnerRequestByPartnerAndName,
  getPartnerRequestById,
  createPartnerPromo,
  getPartnerRequestsStats,
  createPartnerCurrencyRequest,
  getUserStatusIds,



};
