// botMonitoring.js
const os = require('os');
const { performance } = require('perf_hooks');

const METRICS = {
  // Счётчики запросов
  requestBuffer: new Array(), // временные метки
  peakRPS: 0,
  // CPU (дельта между двумя замерами)
  _prevCpu: null,
  cpuUsage: 0,
  // Память процесса
  heapUsage: 0,       // heapUsed / heapTotal * 100
  rssMB: 0,            // RSS в МБ
  // Event loop lag
  eventLoopLagMs: 0,
  _lastTickTime: 0,
  maxObservedLagMs: 0,
};

// === REQUESTS ===
function incrementRequestCount() {
  const now = Date.now();
  METRICS.requestBuffer.push(now);
  // Оставляем только последние 60 секунд
  const cutoff = now - 60000;
  while (METRICS.requestBuffer.length && METRICS.requestBuffer[0] < cutoff) {
    METRICS.requestBuffer.shift();
  }
  const rps = calculateCurrentRPS();
  if (rps > METRICS.peakRPS) METRICS.peakRPS = rps;
}

function calculateCurrentRPS() {
  const cutoff = Date.now() - 1000;
  let i = METRICS.requestBuffer.length;
  while (i > 0 && METRICS.requestBuffer[i - 1] > cutoff) i--;
  return METRICS.requestBuffer.length - i;
}

function calculateCurrentRPM() {
  return METRICS.requestBuffer.length; // буфер уже обрезан до 60 сек
}

// === CPU через дельту (реальная текущая загрузка) ===
function _snapshotCpu() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

function updateCpuUsage() {
  const snap = _snapshotCpu();
  if (METRICS._prevCpu) {
    const prev = METRICS._prevCpu;
    const dTotal = snap.total - prev.total;
    const dIdle = snap.idle - prev.idle;
    METRICS.cpuUsage = dTotal > 0 ? (1 - dIdle / dTotal) : 0;
  }
  METRICS._prevCpu = snap;
}

// === Память процесса ===
function updateMemoryUsage() {
  const mem = process.memoryUsage();
  METRICS.heapUsage = mem.heapTotal > 0 ? (mem.heapUsed / mem.heapTotal) * 100 : 0;
  METRICS.rssMB = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
}

// === Event loop lag — главная метрика Node.js ===
function tickEventLoop() {
  const now = performance.now();
  if (METRICS._lastTickTime) {
    // Ожидали ~50 мс, получили факт
    const lag = now - METRICS._lastTickTime - 50;
    METRICS.eventLoopLagMs = Math.max(0, lag);
    if (lag > METRICS.maxObservedLagMs) METRICS.maxObservedLagMs = lag;
  }
  METRICS._lastTickTime = now;
  setTimeout(tickEventLoop, 50); // каждые 50 мс
}

// === Инициализация и цикл обновления ===
updateCpuUsage();
tickEventLoop();

// CPU и память обновляем раз в 3 секунды
setInterval(() => {
  updateCpuUsage();
  updateMemoryUsage();
}, 3000);

// === Итоговый отчёт ===
function calculateLoadDetails() {
  return {
    rps: calculateCurrentRPS(),
    rpm: calculateCurrentRPM(),
    peakRPS: METRICS.peakRPS,
    cpu: METRICS.cpuUsage * 100,               // 0..100
    heap: METRICS.heapUsage,                   // 0..100
    rssMB: METRICS.rssMB,
    eventLoopLagMs: Math.round(METRICS.eventLoopLagMs * 10) / 10,
    maxEventLoopLagMs: Math.round(METRICS.maxObservedLagMs * 10) / 10,
  };
}

// Оценка здоровья одной строкой: критичен event loop lag > 50 мс или heap > 90%
function getHealthStatus() {
  const l = calculateLoadDetails();
  if (l.eventLoopLagMs > 100) return { level: 'critical', reason: `event loop lag ${l.eventLoopLagMs.toFixed(0)} ms` };
  if (l.heap > 90) return { level: 'critical', reason: `heap ${l.heap.toFixed(0)}%` };
  if (l.eventLoopLagMs > 50) return { level: 'warning', reason: `event loop lag ${l.eventLoopLagMs.toFixed(0)} ms` };
  if (l.heap > 75) return { level: 'warning', reason: `heap ${l.heap.toFixed(0)}%` };
  return { level: 'ok', reason: 'всё в порядке' };
}

module.exports = {
  incrementRequestCount,
  calculateLoadDetails,
  getHealthStatus,
};