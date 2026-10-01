// D:\coding\myBot\index.js
const { spawn } = require('child_process');
const path = require('path');

console.log('[MAIN] Запуск проекта...');

// Определяем операционную систему
const isWin = process.platform === 'win32';

// Функция для запуска процесса
function startProcess(name, command, args, cwd = __dirname) {
    console.log(`[MAIN] Запуск ${name} (${command})...`);
    
    const proc = spawn(command, args, {
        cwd: cwd,
        stdio: 'inherit', // Вывод логов в консоль
        shell: !isWin // На Linux нужен shell для корректной работы npx/npm, на Windows нет
    });

    proc.on('error', (err) => {
        console.error(`[${name}] Ошибка запуска:`, err.message);
    });

    proc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.warn(`[${name}] Завершён с кодом ${code}.`);
            // На локальной машине можно добавить логику перезапуска, если нужно
        }
    });

    return proc;
}

// Аргументы для игнорирования файлов (только для nodemon)
const ignoreFlags = [
    '--ignore', 'database.sqlite*',
    '--ignore', '*.log',
    '--ignore', 'node_modules/',
    '--ignore', 'app/frontend/',
    '--ignore', 'data/',
    '--ignore', 'logs/'
];

if (isWin) {
    // === WINDOWS (ЛОКАЛЬНАЯ РАЗРАБОТКА) ===
    // Используем cmd и nodemon для авто-перезгрузки при изменении кода
    
    // 1. Бот
    startProcess('BOT', 'cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, 'bot.js']);

    // 2. Сервер Mini App
    startProcess('SERVER', 'cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, path.join('app', 'backend', 'index.js')]);

    // 3. React Dev Server
    startProcess('REACT', 'cmd', ['/c', 'npm', 'run', 'dev'], path.join(__dirname, 'app', 'frontend', 'react'));
    
    console.log('[MAIN] React dev-сервер будет доступен на http://localhost:5173');

} else {
    // === LINUX (ХОСТИНГ) ===
    // Используем node напрямую. Без nodemon. Без React dev-сервера.
    
    // 1. Бот
    startProcess('BOT', 'node', ['bot.js']);

    // 2. Сервер Mini App
    // На сервере Express раздает статику из app/frontend/out (или build)
    startProcess('SERVER', 'node', [path.join('app', 'backend', 'index.js')]);
    
    console.log('[MAIN] Режим PRODUCTION. React dev-сервер не запускается.');
}

console.log('[MAIN] Все процессы инициированы.');