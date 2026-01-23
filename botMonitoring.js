const os = require('os');

// Объект для хранения метрик
const performanceMetrics = {
  requestBuffer: [], // Буфер для хранения временных меток запросов
  peakRPS: 0, // Пиковое значение RPS
  maxRPS: 100, // Максимальное количество запросов в секунду
  cpuUsage: 0, // Текущая загрузка CPU
  memoryUsage: 0, // Текущая загрузка памяти
};

// Функция для увеличения счетчика запросов
function incrementRequestCount() {
  const now = Date.now();
  performanceMetrics.requestBuffer.push(now);

  // Удаляем старые запросы из буфера (старше 60 секунд)
  const sixtySecondsAgo = now - 60000;
  performanceMetrics.requestBuffer = performanceMetrics.requestBuffer.filter(
    (timestamp) => timestamp > sixtySecondsAgo
  );

  // Обновляем пиковое значение RPS
  const currentRPS = calculateCurrentRPS();
  if (currentRPS > performanceMetrics.peakRPS) {
    performanceMetrics.peakRPS = currentRPS;
  }
}

// Функция для расчета текущего RPS
function calculateCurrentRPS() {
  const now = Date.now();
  const oneSecondAgo = now - 1000;

  // Подсчитываем количество запросов за последнюю секунду
  const recentRequests = performanceMetrics.requestBuffer.filter(
    (timestamp) => timestamp > oneSecondAgo
  );

  return recentRequests.length;
}

// Функция для расчета текущего RPM
function calculateCurrentRPM() {
  const now = Date.now();
  const sixtySecondsAgo = now - 60000;

  // Подсчитываем количество запросов за последнюю минуту
  const recentRequests = performanceMetrics.requestBuffer.filter(
    (timestamp) => timestamp > sixtySecondsAgo
  );

  return recentRequests.length;
}

// Функция для получения загрузки CPU
function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0,
    totalTick = 0;

  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  return 1 - totalIdle / totalTick; // Возвращает долю загрузки CPU
}

// Функция для получения загрузки памяти
function getMemoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return 1 - freeMemory / totalMemory; // Возвращает долю используемой памяти
}

// Обновление метрик каждые 5 секунд
setInterval(() => {
  performanceMetrics.cpuUsage = getCpuUsage();
  performanceMetrics.memoryUsage = getMemoryUsage();
}, 5000);

// Функция для расчета нагрузки
function calculateLoadDetails() {
  const currentRPS = calculateCurrentRPS();
  const currentRPM = calculateCurrentRPM();

  const rpsPercentage = (currentRPS / performanceMetrics.maxRPS) * 100;
  const rpmPercentage = (currentRPM / (performanceMetrics.maxRPS * 60)) * 100; // Запросы в минуту
  const cpuPercentage = performanceMetrics.cpuUsage * 100; // Предполагается, что CPU возвращается как доля (0.5 = 50%)
  const memoryPercentage = performanceMetrics.memoryUsage * 100; // Предполагается, что RAM возвращается как доля

  // Общая нагрузка как среднее значение
  const overallLoad = Math.min(
    (rpsPercentage + rpmPercentage + cpuPercentage + memoryPercentage) / 4,
    100
  );


  return {
    rps: rpsPercentage.toFixed(2),
    rpm: rpmPercentage.toFixed(2), // Добавляем запросы в минуту
    cpu: cpuPercentage.toFixed(2),
    memory: memoryPercentage.toFixed(2),
    overall: overallLoad.toFixed(2),
    peakRPS: performanceMetrics.peakRPS, // Возвращаем пиковое значение RPS
  };
}

// Экспортируем функции
module.exports = {
  incrementRequestCount,
  calculateLoadDetails,
};