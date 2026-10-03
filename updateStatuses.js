// updateStatuses.js
const { createStatus, getAllStatuses, db } = require('./db');

// Список всех возможных статусов с приоритетами от 1 до 10
const allStatuses = [
  { name: 'Тех администратор', priority: 10 },
  { name: 'Главный админ', priority: 9 },
  { name: 'Администратор', priority: 8 },
  { name: 'Руководитель партнёрки', priority: 7 },
  { name: 'Модератор', priority: 6 },
  { name: 'DIAMOND', priority: 5 },
  { name: 'PLATINUM', priority: 4 },
  { name: 'GOLD', priority: 3 },
  { name: 'Партнёр', priority: 2 },
  { name: 'Beto-tester', priority: 1 },
];

// Функция для обновления статусов в базе данных
async function updateStatuses() {
  try {
    // Получаем список всех существующих статусов
    const existingStatuses = await getAllStatuses();
    const existingStatusMap = new Map();
    existingStatuses.forEach((status) => {
      existingStatusMap.set(status.name.toLowerCase(), status);
    });

    let statusesUpdated = false;
    let prioritiesUpdated = false;

    for (const status of allStatuses) {
      const existing = existingStatusMap.get(status.name.toLowerCase());

      if (!existing) {
        // Статус отсутствует — создаём
        const result = await createStatus(status.name, status.priority);
        if (result.success) {
          statusesUpdated = true;
          console.log(`[STATUSES] Добавлен новый статус: ${status.name} (приоритет: ${status.priority})`);
        }
      } else if (existing.priority !== status.priority) {
        // Статус существует, но приоритет отличается — обновляем
        try {
          db.prepare('UPDATE statuses SET priority = ? WHERE id = ?').run(status.priority, existing.id);
          prioritiesUpdated = true;
          console.log(`[STATUSES] Обновлён приоритет статуса "${status.name}": ${existing.priority} → ${status.priority}`);
        } catch (err) {
          console.error(`[STATUSES] Ошибка обновления приоритета "${status.name}":`, err.message);
        }
      }
    }

    if (statusesUpdated || prioritiesUpdated) {
      console.log('[STATUSES] Статусы успешно обновлены.');
    } else {
      console.log('[STATUSES] Все статусы уже актуальны. Обновление не требуется.');
    }
  } catch (error) {
    console.error('Ошибка при обновлении статусов:', error);
  }
}

module.exports = {
  updateStatuses,
  allStatuses,
};