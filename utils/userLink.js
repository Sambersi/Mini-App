const { getUserById } = require('../db');

// Функция для создания гиперссылки на пользователя
async function createUserLink(userId) {
  const user = await getUserById(userId.toString());
  const displayName = user?.username || 'Неизвестный'; // Имя из БД или "Неизвестный"
  return `<a href="tg://user?id=${userId}">${displayName}</a>`;
}

module.exports = { createUserLink };