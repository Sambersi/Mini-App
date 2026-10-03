const API = '';
const TG = window.Telegram?.WebApp;
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const $ = (id) => document.getElementById(id);
let userId = null;
let ws = null;

document.addEventListener('DOMContentLoaded', () => {
  if (TG) {
    TG.ready(); TG.expand();
    userId = TG.initDataUnsafe?.user?.id || null;
    const photo = TG.initDataUnsafe?.user?.photo_url;
    if (photo) { const img = $('avatar-img'); if (img) { img.src = photo; img.style.display = 'block'; } }
  }
  if (!userId && isLocal) userId = '768451950'; // тестовый id как в старом App.jsx
  connectOnlineWS();
});

// --- Онлайн (WebSocket + фолбэк REST) ---
function updateOnlineText(count) {
  const el = $('online-text');
  if (el) el.textContent = `онлайн: ${count}`;
  document.querySelectorAll('.online-text-mirror').forEach(m => { m.textContent = `онлайн: ${count}`; });
}

function connectOnlineWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/online`;
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('[WS] Подключено к серверу онлайна');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'online_count') updateOnlineText(data.count);
      } catch (e) { console.error('[WS] Ошибка парсинга:', e); }
    };
    ws.onerror = (err) => console.error('[WS] Ошибка соединения:', err);
    ws.onclose = () => { console.log('[WS] Переподключение через 5 сек...'); setTimeout(connectOnlineWS, 5000); };
  } catch (e) {
    console.error('[WS] Не удалось создать WebSocket:', e);
    fallbackOnlinePolling();
  }
}

async function fallbackOnlinePolling() {
  try {
    const d = await (await fetch(`${API}/api/online`)).json();
    updateOnlineText(d.online);
  } catch (e) { console.error('[REST] Ошибка онлайна:', e); }
  setTimeout(fallbackOnlinePolling, 30000);
}

// --- Модалка (есть не на всех страницах — проверяем наличие) ---
function showModal(title, bodyHtml) {
  const m = $('modal');
  if (!m) return;
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml || '';
  m.hidden = false;
}