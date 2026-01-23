// D:\coding\myBot\index.js
const { spawn } = require('child_process');
const path = require('path');

console.log('[MAIN] Запуск проекта...');

// === Запуск бота ===
const botProcess = spawn('node', ['bot.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

botProcess.on('error', (err) => {
  console.error('[BOT] Ошибка запуска:', err);
});

botProcess.on('exit', (code) => {
  console.log(`[BOT] Процесс завершён с кодом ${code}`);
});

// === Запуск сервера Mini App ===
const serverProcess = spawn('node', [path.join(__dirname, 'app', 'backend', 'index.js')], {
  cwd: __dirname,
  stdio: 'inherit'
});

serverProcess.on('error', (err) => {
  console.error('[SERVER] Ошибка запуска:', err);
});

serverProcess.on('exit', (code) => {
  console.log(`[SERVER] Процесс завершён с кодом ${code}`);
});

console.log('[MAIN] Все процессы запущены.');