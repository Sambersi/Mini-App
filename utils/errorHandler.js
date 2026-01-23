// utils/errorHandler.js

const logError = (error) => {
  // Логируем ошибку в консоль
  console.error('Произошла ошибка:', error);

  if (error.code === 'ECONNRESET' || error.type === 'system') {
    console.warn('Сетевая ошибка. Попытка повторного подключения...');
    return;
  }

  if (error.response && error.response.error_code === 429) {
    const retryAfter = error.response.parameters?.retry_after || 0;
    console.warn(`Слишком много запросов. Повторите попытку через ${retryAfter} секунд.`);
    return;
  }

  // Логирование остальных ошибок
  console.error('Необработанная ошибка:', error);
};

module.exports = { logError };