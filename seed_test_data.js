// seed_test_data.js — разовая набивка таблиц логов тестовыми данными
// Запуск: node seed_test_data.js (лучше при остановленном боте, чтобы не поймать SQLITE_BUSY)
const path = require('path');
const sqlite3 = require('better-sqlite3');

const db = new sqlite3(path.join(__dirname, 'database.sqlite'));

const now = Date.now();
const H = 3600 * 1000; // час
const M = 60 * 1000;   // минута

const seed = db.transaction(() => {
  // --- message_log ---
  const insMsg = db.prepare(`INSERT INTO message_log
    (user_id, ts, chat_type, chat_id, chat_title, message_text, is_command)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insMsg.run('768451950', now - 5 * M,  'private',    '768451950',      null,           'баланс', 1);
  insMsg.run('768451950', now - 4 * M,  'supergroup', '-1002546508751', 'DOUBLE PLUSS', '5 200к', 0);
  insMsg.run('999000001', now - 3 * H,  'supergroup', '-1002681608387', 'DICE',         'дайс 1к', 0);
  insMsg.run('999000002', now - 26 * H, 'private',    '999000002',      null,           'репорт не работает кнопка', 0);
  insMsg.run('999000003', now - 30 * H, 'supergroup', '-1002546508751', 'DOUBLE PLUSS', 'х2 100к', 0);

  // --- finance_log ---
  const insFin = db.prepare(`INSERT INTO finance_log
    (ts, type, actor_user_id, target_user_id, amount, currency, ref, chat_id, reason, action, payload, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insFin.run(now - 2 * H,  'transfer',   '999000001', '999000002', 500000,  'PF',     null,        null, null,                 'Перевод 500 000 PF', null, 1);
  insFin.run(now - 5 * H,  'donation',   '999000002', null,        50,      'STARS',  'charge_1',  null, null,                 'Донат 50 звёзд (+500 DF)', JSON.stringify({ df: 500 }), 1);
  insFin.run(now - 8 * H,  'promo',      '999000003', null,        100000,  'PF',     'TEST100K',  null, null,                 'Промокод TEST100K', null, 1);
  insFin.run(now - 26 * H, 'admin_give', '768451950', '999000004', 25,      'TICKET', 'tickets',   null, null,                 'Получил 25 TICKET от администратора', null, 1);
  insFin.run(now - 27 * H, 'ban',        '768451950', '999000004', 0,       'PF',     null,        null, 'Тестовая причина',  'БАН: тестовая причина', null, 1);
  insFin.run(now - 30 * H, 'admin_take', '768451950', '999000005', 1000000, 'PF',     'balance',   null, null,                 'Лишился 1 000 000 PF от администратора', null, 1);

  // --- double_rounds ---
  const insRound = db.prepare(`INSERT INTO double_rounds
    (round_id, start_ts, end_ts, result_multiplier, salt, total_bank, bets_count, chats_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insRound.run('round_test_1', now - 4 * H,  now - 3 * H,  'x3',   'salta', 5000000, 3, 2);
  insRound.run('round_test_2', now - 28 * H, now - 27 * H, 'GAME', 'saltb', 2000000, 3, 1);

  // --- double_bets_log ---
  const insBet = db.prepare(`INSERT INTO double_bets_log
    (ts, round_id, user_id, username, chat_id, multiplier, amount, status, reject_reason, game_choice, is_win, win_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insBet.run(now - 4 * H,  'round_test_1', '768451950', 'Vlad',             '-1002546508751', 'x3',   2000000, 'accepted', null,                           null,    1, 6000000);
  insBet.run(now - 4 * H,  'round_test_1', '999000001', 'Test_Billionaire', '-1002546508751', 'x2',   1500000, 'accepted', null,                           null,    0, 0);
  insBet.run(now - 4 * H,  'round_test_1', '999000003', 'Test_Newbie',      '-1002681608387', 'x3',   1500000, 'accepted', null,                           null,    1, 4500000);
  insBet.run(now - 28 * H, 'round_test_2', '999000005', 'Test_Whale',       '-1002546508751', 'GAME', 1000000, 'accepted', null,                           'left',   1, 2500000);
  insBet.run(now - 28 * H, 'round_test_2', '999000002', 'Test_Average',     '-1002546508751', 'GAME', 500000,  'accepted', null,                           'right',  0, 0);
  insBet.run(now - 28 * H, 'round_test_2', '999000004', 'Test_Banned',      '-1002546508751', 'x5',   500000,  'rejected', 'Недостаточно средств',      null,    null, null);
});

seed();

console.log('message_log:',     db.prepare('SELECT COUNT(*) c FROM message_log').get().c);
console.log('finance_log:',     db.prepare('SELECT COUNT(*) c FROM finance_log').get().c);
console.log('double_rounds:',   db.prepare('SELECT COUNT(*) c FROM double_rounds').get().c);
console.log('double_bets_log:', db.prepare('SELECT COUNT(*) c FROM double_bets_log').get().c);
console.log('✅ Тестовые данные логов вставлены.');
db.close();