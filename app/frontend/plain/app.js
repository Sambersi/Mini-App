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
    if (photo) { const img = $('avatar-img'); img.src = photo; img.style.display = 'block'; }
  }
  if (!userId && isLocal) userId = '768451950'; // тестовый id как в старом App.jsx
  bindCoreUI();
  connectOnlineWS();
});

// --- Онлайн (WebSocket + фолбэк REST) ---
function updateOnlineText(count) {
  const el = $('online-text');
  if (el) el.textContent = `онлайн: ${count}`;
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

// --- Хром страницы: верхние плашки, зона размытия, видимость онлайна ---
function applyPageChrome(name) {
  const withHeader = (name === 'профиль' || name === 'играть');
  $('header-profile').classList.toggle('hidden', name !== 'профиль');
  $('header-play').classList.toggle('hidden', name !== 'играть');
  const screen = document.querySelector('.mobile-screen');
  screen.classList.toggle('top-zone', withHeader);
  screen.setAttribute('data-page', name);
  // онлайн только в профиле и «ещё»
  $('online-status').classList.toggle('hidden', !(name === 'профиль' || name === 'еще'));
}

// --- Навигация ---
function switchPage(name) {
  document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
  const target = $('page-' + name);
  if (target) target.classList.remove('hidden');
  applyPageChrome(name);
  const sc = document.querySelector('.scroll-content');
  if (sc) sc.scrollTop = 0;
}
function setNavActive(name) {
  const items = document.querySelectorAll('.bottom-nav__item');
  items.forEach(i => {
    const itemName = i.getAttribute('data-nav'); // БАГ ФИКС: раньше тут использовался name для всех кнопок
    const active = itemName === name;
    i.classList.toggle('bottom-nav__item--active', active);
    i.querySelector('.bottom-nav__btn').classList.toggle('bottom-nav__btn--active', active);
    i.querySelector('.bottom-nav__label').classList.toggle('bottom-nav__label--active', active);
    const img = i.querySelector('img');
    if (img) img.src = active ? `icons/${itemName}.svg` : `icons/${itemName}_off.svg`;
  });
}
function bindCoreUI() {
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    item.querySelector('.bottom-nav__btn').addEventListener('click', () => {
      const name = item.getAttribute('data-nav');
      setNavActive(name); switchPage(name);
    });
  });
  $('admin-enter').addEventListener('click', () => { switchPage('admin'); AdminLogs.init(userId); });
  $('admin-back').addEventListener('click', () => { setNavActive('еще'); switchPage('еще'); });
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
}
function showModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml || '';
  $('modal').hidden = false;
}