// handlers/fortyTwo.js

// --- Хакерская анимация ---

// Массив строк для пошагового "взлома"
const hackLines = [
    `Инициализация протоколов дешифрования...`,
    `Доступ к защищенному хранилищу: ██████████ 100%`,
    `Обход систем безопасности...`,
    `Целостность защиты нарушена.`,
    `Поиск запрашиваемых данных...`,
    `Запуск вычислительных алгоритмов...`,
    `Получение зашифрованной информации...`,
    `Анализ структуры данных...`,
    `Сопоставление с известными шаблонами...`,
    `Вычисление контрольных сумм...`,
    `Данные найдены. Проверка достоверности...`,
    `Контрольная сумма: 010010100011010000110010`,
    `Подготовка результата...`,
    `Результат...`,
  ];
  
  // Функция для генерации эффекта "матрицы" - случайные символы
  function generateMatrixLine(length = 30) {
    // Используем кириллицу, латиницу и символы для атмосферы
    const chars = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*+-=/\\|';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  
  // --- Основная функция обработки команды ---
  
  /**
   * Обработчик команды "42".
   * Выводит анимацию в хакерском стиле, которая в итоге приводит к ответу "42".
   * @param {Telegraf.Context} ctx - Контекст Telegraf.
   */
  async function fortyTwoHandler(ctx) {
    try {
      // Проверяем, что команда отправлена в личном чате
      if (ctx.chat.type !== 'private') {
         return;
      }
  
      // Отправляем начальное сообщение с анимацией взлома
      let statusMessage = '📡 Подключение к удаленному серверу...\n';
      statusMessage += '```\n';
      for (let j = 0; j < 8; j++) {
          statusMessage += generateMatrixLine(35) + '\n';
      }
      statusMessage += '```';
      
      const message = await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  
      // --- Этап 1: Пошаговый "взлом" с фейковыми данными (ускорена) ---
      // Очень высокая скорость анимации
      for (let i = 0; i < hackLines.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50)); 
          
        let updatedText = '🔐 Протокол доступа к системе\n```\n';
        // Добавляем уже "завершенные" шаги
        for (let j = 0; j <= i; j++) {
          updatedText += `[OK] ${hackLines[j]}\n`;
        }
        // Добавляем "в процессе" шаги (до 3 следующих)
        for (let j = i + 1; j <= Math.min(i + 3, hackLines.length - 1); j++) {
          const progress = ['-', '\\', '|', '/'][Math.floor(Date.now() / 100) % 4];
          updatedText += `[${progress}] ${hackLines[j]}\n`;
        }
        // Добавляем фейковые данные пользователя
        if (i >= 2) { // Начинаем показывать после 2 шагов
            const fakeIPs = ['213.87.192.45', '198.51.100.12', '192.0.2.5', '203.0.113.88'];
            const fakePorts = ['54321', '49152', '60001', '33445'];
            const fakeProtocols = ['SSH', 'HTTPS', 'TCP', 'UDP'];
            const fakeUsernames = ['sys_admin', 'root', 'guest', 'operator'];
            
            const randomIP = fakeIPs[Math.floor(Math.random() * fakeIPs.length)];
            const randomPort = fakePorts[Math.floor(Math.random() * fakePorts.length)];
            const randomProtocol = fakeProtocols[Math.floor(Math.random() * fakeProtocols.length)];
            const randomUsername = fakeUsernames[Math.floor(Math.random() * fakeUsernames.length)];
            
            updatedText += `\n[INFO] IP: ${randomIP}:${randomPort}\n`;
            updatedText += `[INFO] Протокол: ${randomProtocol}\n`;
            updatedText += `[INFO] Пользователь: ${randomUsername}\n`;
        }
        // Добавляем пустые строки для "матрицы" внизу
        const linesLeft = 5 - (i + 3 - i);
        for (let j = 0; j < Math.max(0, linesLeft); j++) {
          updatedText += '   ' + generateMatrixLine(30) + '\n';
        }
        updatedText += '```';
          
        try {
          await ctx.telegram.editMessageText(message.chat.id, message.message_id, null, updatedText, { parse_mode: 'Markdown' });
        } catch (editError) {
          if (editError.response?.error_code === 400 && editError.response?.description?.includes('message is not modified')) {
            console.warn('[42] Сообщение не изменено во время анимации взлома.');
          } else {
            console.error('[42] Ошибка редактирования сообщения во время анимации взлома:', editError);
            throw editError;
          }
        }
      }
  
// handlers/fortyTwo.js (фрагмент с исправленной анимацией)

    // --- Этап 2: ASCII-арт анимация "42" ---
    await new Promise(resolve => setTimeout(resolve, 80)); // Очень короткая пауза перед ASCII-артом

    // Функция для безопасного экранирования текста для тега <pre>
    function escapeForPre(text) {
        return text
            .replace(/&/g, '&amp;')  // Сначала &
            .replace(/</g, '<')   // Потом <
            .replace(/>/g, '>')   // Потом >
            .replace(/"/g, '&quot;') // Кавычки
            .replace(/'/g, '&#39;');  // Апострофы
    }

    // Кадры анимации ASCII-арта для "42"
    // Используем функцию escapeForPre для полной безопасности
    const asciiFrames = [
      escapeForPre(`  ___  ___ \n |__ \\|__ \\\n    ) |  ) |\n   / /  / / \n  / /_ / /_ \n |____|____|`),
      escapeForPre(`  ____  ____ \n |___ \\|___ \\\n   __) |  __) |\n  |__ <  |__ < \n  ___) |  ___) |\n |____/  |____/ `),
      escapeForPre(`  _________ \n |_________|\n     ___    \n    / _ \\   \n   | | | |  \n   |_| |_|  `),
      escapeForPre(`  _________ \n |_________|\n     ___    \n    / _ \\   \n   | | | |  \n   |_| |_|  `),
      // Финальный кадр
      escapeForPre(`  _____  \n |___ /  \n   |_ \\  \n  ___) | \n |____/  \n         `)
    ];

    for (let i = 0; i < asciiFrames.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 60)); // Очень короткая задержка между кадрами
        let updatedText = '🔓 <b>ДОСТУП РАЗРЕШЕН</b>\n\n';
        updatedText += '<pre>' + asciiFrames[i] + '</pre>';

        try {
            // console.log('[DEBUG] Отправка кадра ASCII:', updatedText); // Для отладки
            await ctx.telegram.editMessageText(message.chat.id, message.message_id, null, updatedText, { parse_mode: 'HTML' });
        } catch (editError) {
            if (editError.response?.error_code === 400 && editError.response?.description?.includes('message is not modified')) {
                console.warn('[42] Сообщение не изменено во время анимации ASCII.');
            } else {
                console.error('[42] Ошибка редактирования сообщения во время анимации ASCII:', editError);
                // Не прерываем весь процесс из-за ошибки редактирования одного кадра
                // throw editError; // Можно раскомментировать для отладки
            }
        }
    }

    // --- Этап 3: Финальное сообщение с вашим ASCII-рисунком ---
    await new Promise(resolve => setTimeout(resolve, 80)); // Очень короткая пауза перед финалом

    // Используем ваш ASCII-рисунок
    // Также используем функцию escapeForPre для полной безопасности
    const finalAsciiArtRaw = `
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣿⣿⠀⠀⠀⠀⠀⣰⣾⢿⠯⠭⠟⠻⣷⣄⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⢽⣿⠀⠀⠀⠀⠠⠿⣷⠁⠀⠀⠀⠀⢻⣿⡄⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢠⣾⡻⠋⢸⣿⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⢀⣿⣿⠇⠀⠀⠀
⠀⠀⠀⠀⠀⣰⣿⡗⠁⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⠎⠀⠀⠀⠀
⠀⠀⠀⠀⣼⣿⣎⣀⣀⣀⣸⣿⣠⣀⣀⠀⠀⠀⠀⢀⣴⡿⣿⠟⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠿⠿⠿⠿⠿⠿⢿⣿⠻⠿⠿⠀⠀⢀⣴⣿⡯⠊⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⣰⣿⣯⣭⣤⣤⣤⣤⣤⣤⡄⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠃⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
`;
    // Полное экранирование для тега <pre>
    const finalAsciiArt = escapeForPre(finalAsciiArtRaw);

    const finalText = `
🔓 <b>ДОСТУП РАЗРЕШЕН</b>

🔍 <b>Глубокий анализ завершён</b>
🧠 <b>Вычисления окончены</b>

🗨️ <b>Запрос:</b> "<i>Каков Ответ на Главный Вопрос о Жизни, Вселенной и Всём Остальном?</i>"
🗨️ <b>Источник:</b> <i>Суперкомпьютер (7.5 миллионов лет)</i>

🎯 <b>РЕЗУЛЬТАТ:</b>
<pre>${finalAsciiArt}</pre>
<b><i>ОТВЕТ:</i></b> <u>42</u>

<i>"После 7.5 миллионов лет вычислений, ответ на Главный Вопрос о Жизни, Вселенной и Всём Остальном — это число 42."</i>
    `.trim();

    await ctx.telegram.editMessageText(message.chat.id, message.message_id, null, finalText, { parse_mode: 'HTML' });

    } catch (error) {
      console.error('[42] Ошибка при выполнении команды "42":', error);
      try {
          await ctx.reply('❌ Произошла ошибка при запуске протокола 42. Попробуйте позже.');
      } catch (replyError) {
          console.error('[42] Ошибка при отправке сообщения об ошибке:', replyError);
      }
    }
  }
  
  module.exports = { fortyTwoHandler };
  