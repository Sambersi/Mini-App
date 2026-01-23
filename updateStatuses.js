//updateStatuses.js
const { db } = require('./db'); // Импортируем базу данных
const { createStatus, getAllStatuses } = require('./db');

// Список всех возможных статусов
const allStatuses = [
  { name: 'Администратор', priority: 100 },
  { name: 'Тех администратор', priority: 95 },
  { name: 'Модератор', priority: 90 },
  { name: 'DIAMOND', priority: 85 },
  { name: 'PLATINUM', priority: 80 },
  { name: 'GOLD', priority: 75 },
  { name: 'Beto-tester', priority: 70 },
  { name: 'Руководитель партнёрки', priority: 70 }
];

// Функция для обновления статусов в базе данных
async function updateStatuses() {
  try {

    // Получаем список всех существующих статусов
    const existingStatuses = await getAllStatuses();
    const existingStatusNames = existingStatuses.map((status) => status.name.toLowerCase());

    // Флаг для отслеживания изменений
    let statusesUpdated = false;

    // Добавляем новые статусы, если их нет в базе данных
    for (const status of allStatuses) {
      if (!existingStatusNames.includes(status.name.toLowerCase())) {
        const result = await createStatus(status.name, status.priority);
        if (result.success) {
          statusesUpdated = true; // Отмечаем, что статус был добавлен
        }
      }
    }

    // Выводим сообщение об успешном обновлении
    if (statusesUpdated) {
      console.log('Статусы успешно обновлены.');
    } else {
      console.log('Все статусы уже актуальны. Обновление не требуется.');
    }
  } catch (error) {
    console.error('Ошибка при обновлении статусов:', error);
  }
}

module.exports = {
  updateStatuses,
};