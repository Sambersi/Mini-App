const { createReadStream, createWriteStream, statSync, unlinkSync, existsSync, mkdirSync } = require('fs');
const { createGzip } = require('zlib');
const { pipeline } = require('stream/promises');
const path = require('path');
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const { getUserStatuses } = require('./db');

// Путь к базе данных
const dbPath = path.join(__dirname, 'database.sqlite');

// Главный администратор
const MAIN_ADMIN_ID = process.env.MAIN_ADMIN;

// Создаем экземпляр бота для отправки сообщений
const bot = new Telegraf(process.env.BOT_TOKEN);

// Функция для проверки, является ли пользователь главным администратором
function isMainAdmin(userId) {
  return userId.toString() === MAIN_ADMIN_ID;
}

// Функция для проверки, имеет ли пользователь статус "Тех администратор"
async function isTechAdmin(userId) {
  const statuses = await getUserStatuses(userId);
  return statuses.includes('Тех администратор');
}

// Универсальная функция для проверки прав администратора
async function isAdmin(userId) {
  return isMainAdmin(userId) || (await isTechAdmin(userId));
}

// Получение размера базы данных
function getDatabaseSize() {
  try {
    const stats = statSync(dbPath);
    return stats.size; // Размер в байтах
  } catch (error) {
    console.error('Ошибка при получении размера базы данных:', error);
    throw new Error('Не удалось получить размер базы данных.');
  }
}

// Команда для получения размера базы данных
async function handleDbSizeCommand(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Проверяем права администратора
    if (!(await isAdmin(userId))) {
      return;
    }

    const sizeInBytes = getDatabaseSize();
    const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
    await ctx.reply(`📦 Размер базы данных: ${sizeInMB} МБ`);
  } catch (error) {
    console.error('Ошибка при выполнении команды db_size:', error);
    await ctx.reply('❌ Произошла ошибка при получении размера базы данных.');
  }
}

// Команда для запроса резервной копии (сжатой в ZIP)
async function handleBackupCommand(ctx) {
  try {
    const userId = ctx.from.id.toString();

    // Проверяем права администратора
    if (!(await isAdmin(userId))) {
      return;
    }

    // Проверяем, существует ли файл базы данных
    if (!existsSync(dbPath)) {
      console.error('Файл базы данных не найден для резервного копирования.');
      return ctx.reply('❌ Файл базы данных не найден для резервного копирования.');
    }

    // Путь для временного ZIP-архива
    const zipFileName = `backup_${Date.now()}.zip`;
    const zipFilePath = path.join(__dirname, 'backups', zipFileName);

    // Создаем папку backups, если её нет
    const backupDir = path.join(__dirname, 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    console.log(`[BACKUP] Начинаем создание архива: ${zipFilePath}`);

    // Создаем потоки для чтения, сжатия и записи
    const readStream = createReadStream(dbPath);
    const writeStream = createWriteStream(zipFilePath);
    const gzipStream = createGzip();

    // Используем pipeline для соединения потоков: чтение -> сжатие -> запись
    await pipeline(
      readStream,
      gzipStream,
      writeStream
    );

    console.log(`[BACKUP] Архив создан: ${zipFilePath}`);

    // Проверяем размер архива
    const zipStats = statSync(zipFilePath);
    const maxSize = 50 * 1024 * 1024; // 50 MB в байтах

    if (zipStats.size > maxSize) {
       // Удаляем созданный архив, так как он слишком большой
       unlinkSync(zipFilePath);
       console.error(`[BACKUP] Размер архива (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB) превышает лимит Telegram (50 MB).`);
       return ctx.reply(`❌ Размер сжатого бэкапа (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB) превышает лимит Telegram (50 MB).`);
    }

    // Отправляем ZIP-архив администратору
    await ctx.replyWithDocument({ source: zipFilePath, filename: zipFileName });
    await ctx.reply('📦 Резервная копия успешно отправлена.');

    console.log(`[BACKUP] Бэкап отправлен: ${zipFilePath}`);

    // Удаляем временный ZIP-файл после отправки
    unlinkSync(zipFilePath);
    console.log(`[BACKUP] Временный файл удален: ${zipFilePath}`);

  } catch (error) {
    console.error('Ошибка при выполнении команды backup:', error);
    await ctx.reply('❌ Произошла ошибка при создании или отправке резервной копии.');
  }
}

// Отправка резервной копии главному администратору (внутренняя функция, использует сжатие)
async function sendBackupToAdmin() {
  try {
    // Проверяем существование файла базы данных
    if (!existsSync(dbPath)) {
      console.error('Файл базы данных не найден.');
      return;
    }

    // Путь для временного ZIP-архива
    const zipFileName = `backup_${Date.now()}.zip`;
    const zipFilePath = path.join(__dirname, 'backups', zipFileName);

    // Создаем папку backups, если её нет
    const backupDir = path.join(__dirname, 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    console.log(`[BACKUP] Начинаем создание архива: ${zipFilePath}`);

    // Создаем потоки для чтения, сжатия и записи
    const readStream = createReadStream(dbPath);
    const writeStream = createWriteStream(zipFilePath);
    const gzipStream = createGzip();

    // Используем pipeline для соединения потоков: чтение -> сжатие -> запись
    await pipeline(
      readStream,
      gzipStream,
      writeStream
    );

    console.log(`[BACKUP] Архив создан: ${zipFilePath}`);

    // Проверяем размер архива
    const zipStats = statSync(zipFilePath);
    const maxSize = 50 * 1024 * 1024; // 50 MB в байтах

    if (zipStats.size > maxSize) {
       // Удаляем созданный архив, так как он слишком большой
       unlinkSync(zipFilePath);
       console.error(`[BACKUP] Размер архива (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB) превышает лимит Telegram (50 MB).`);
       console.error('❌ Автоматическое резервное копирование прервано: файл слишком большой.');
       return;
    }

    // Отправляем ZIP-архив главному администратору
    await bot.telegram.sendDocument(MAIN_ADMIN_ID, { source: zipFilePath, filename: zipFileName });
    console.log('Резервная копия успешно отправлена главному администратору.');

    // Удаляем временный ZIP-файл после отправки
    unlinkSync(zipFilePath);
    console.log(`[BACKUP] Временный файл удален: ${zipFilePath}`);

  } catch (error) {
    console.error('Ошибка при отправке резервной копии:', error);
  }
}

function scheduleDailyBackup() {
  // Запуск резервного копирования в 6:00 и 18:00 каждый день
  cron.schedule('0 6,18 * * *', async () => {
    console.log('Запуск автоматического резервного копирования...');
    try {
      await sendBackupToAdmin();
      console.log('Автоматическое резервное копирование успешно завершено.');
    } catch (error) {
      console.error('Ошибка при выполнении автоматического резервного копирования:', error);
    }
  });
}

// Экспортируем функции
module.exports = {
  handleDbSizeCommand,
  handleBackupCommand,
  scheduleDailyBackup,
};