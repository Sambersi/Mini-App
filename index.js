// D:\coding\myBot\index.js
const { spawn } = require('child_process');
const path = require('path');

console.log('[MAIN] Запуск проекта...');

// Игнорируем БД, логи, node_modules и папку frontend
const ignoreFlags = [
  '--ignore', 'database.sqlite*', 
  '--ignore', '*.log', 
  '--ignore', 'node_modules/', 
  '--ignore', 'app/frontend/',
  '--ignore', 'data/',  // <-- ДОБАВЬ ЭТУ СТРОКУ
  '--ignore', 'logs/'   // <-- И ЭТУ ТОЖЕ
];

// === Запуск бота ===
const botProcess = spawn('cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, 'bot.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

botProcess.on('error', (err) => console.error('[BOT] Ошибка запуска:', err));
botProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) console.warn(`[BOT] Завершён с кодом ${code}. Перезапуск...`);
});

// === Запуск сервера Mini App ===
const serverProcess = spawn('cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, path.join(__dirname, 'app', 'backend', 'index.js')], {
  cwd: __dirname,
  stdio: 'inherit'
});

// === Запуск React dev-сервера ===
const reactProcess = spawn('cmd', ['/c', 'npm', 'run', 'dev'], {
  cwd: path.join(__dirname, 'app', 'frontend', 'react'),
  stdio: 'inherit'
});

reactProcess.on('error', (err) => console.error('[REACT] Ошибка запуска:', err));
reactProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) console.warn(`[REACT] Завершён с кодом ${code}. Перезапуск...`);
});

console.log('[MAIN] React dev-сервер будет доступен на http://localhost:5173');

serverProcess.on('error', (err) => console.error('[SERVER] Ошибка запуска:', err));
serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) console.warn(`[SERVER] Завершён с кодом ${code}. Перезапуск...`);
});

console.log('[MAIN] Все процессы запущены.');