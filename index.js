// index.js (корневой лаунчер)
const { spawn } = require('child_process');
const path = require('path');

console.log('[MAIN] Запуск проекта...');

const isWin = process.platform === 'win32';

function startProcess(name, command, args, cwd = __dirname) {
    console.log(`[MAIN] Запуск ${name} (${command} ${args.join(' ')})...`);
    
    const proc = spawn(command, args, {
        cwd: cwd,
        stdio: 'inherit',
        shell: isWin // shell нужен на Windows для cmd, на Linux для npx
    });

    proc.on('error', (err) => {
        console.error(`[${name}] Ошибка запуска:`, err.message);
    });

    proc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.warn(`[${name}] Завершён с кодом ${code}.`);
        }
    });

    return proc;
}

if (isWin) {
    // === WINDOWS (РАЗРАБОТКА) ===
    const ignoreFlags = [
        '--ignore', 'database.sqlite*',
        '--ignore', '*.log',
        '--ignore', 'node_modules/',
        '--ignore', 'app/frontend/',
        '--ignore', 'data/',
        '--ignore', 'logs/'
    ];

    startProcess('BOT', 'cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, 'bot.js']);
    startProcess('SERVER', 'cmd', ['/c', 'npx', 'nodemon', ...ignoreFlags, path.join('app', 'backend', 'index.js')]);
    startProcess('REACT', 'cmd', ['/c', 'npm', 'run', 'dev'], path.join(__dirname, 'app', 'frontend', 'react'));
    
    console.log('[MAIN] Режим: Windows (DEV). React на http://localhost:5173');
} else {
    // === LINUX (ХОСТИНГ / PRODUCTION) ===
    startProcess('BOT', 'node', ['bot.js']);
    startProcess('SERVER', 'node', [path.join('app', 'backend', 'index.js')]);
    
    console.log('[MAIN] Режим: Linux (PRODUCTION). React dev-сервер не запускается.');
}

console.log('[MAIN] Все процессы инициированы.');