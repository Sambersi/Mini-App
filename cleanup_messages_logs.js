// cleanup_messages_logs.js
const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = new sqlite3(path.join(__dirname, 'database.sqlite'));

// Сколько дней логов сообщений оставить (0 = удалить все)
const KEEP_DAYS = 0;
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;

// 1) finance_log: записи типа 'message' (вкладка «общее» в админке)
const finBefore = db.prepare(`SELECT COUNT(*) c FROM finance_log WHERE type = 'message' AND ts < ?`).get(cutoff).c;
const fin = db.prepare(`DELETE FROM finance_log WHERE type = 'message' AND ts < ?`).run(cutoff);
console.log(`finance_log (type='message'): удалено ${fin.changes} из ${finBefore}`);

// 2) message_log: служебный журнал сообщений
const msgBefore = db.prepare(`SELECT COUNT(*) c FROM message_log WHERE ts < ?`).get(cutoff).c;
const msg = db.prepare(`DELETE FROM message_log WHERE ts < ?`).run(cutoff);
console.log(`message_log: удалено ${msg.changes} из ${msgBefore}`);

db.close();
console.log('Готово.');