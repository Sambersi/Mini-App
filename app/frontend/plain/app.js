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
  bindCoreUI();
  connectOnlineWS();
  switchPage('профиль'); // старт: включает верхнюю плашку, онлайн и data-page
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

// --- Хром страницы: верхние плашки и онлайн ---
function applyPageChrome(name) {
  const hp = $('header-profile');
  const hm = $('header-mini');
  const on = $('online-status');
  const screen = document.querySelector('.mobile-screen');
  if (name === 'профиль') {
    if (hp) hp.classList.remove('hidden');
    if (hm) hm.classList.add('hidden');
    if (on) on.classList.remove('hidden');
  } else if (name === 'admin') {
    if (hp) hp.classList.add('hidden');
    if (hm) hm.classList.add('hidden');
    if (on) on.classList.add('hidden');
  } else {
    if (hp) hp.classList.add('hidden');
    if (hm) hm.classList.remove('hidden');
    if (on) on.classList.toggle('hidden', name !== 'еще');
  }
  if (screen) screen.setAttribute('data-page', name);
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
    const itemName = i.getAttribute('data-nav'); // ФИКС БАГА: имя берём у каждой кнопки своё
    const active = itemName === name;
    i.classList.toggle('bottom-nav__item--active', active);
    const btn = i.querySelector('.bottom-nav__btn');
    if (btn) btn.classList.toggle('bottom-nav__btn--active', active);
    const label = i.querySelector('.bottom-nav__label');
    if (label) label.classList.toggle('bottom-nav__label--active', active);
    const img = i.querySelector('img');
    if (img) img.src = active ? `icons/${itemName}.svg` : `icons/${itemName}_off.svg`;
  });
}
function bindCoreUI() {
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    const btn = item.querySelector('.bottom-nav__btn');
    if (btn) btn.addEventListener('click', () => {
      const name = item.getAttribute('data-nav');
      setNavActive(name);
      switchPage(name);
    });
  });
  const donate = $('donate-open');
  if (donate) donate.addEventListener('click', () => alert('Донат открывается в боте: команда «донат».'));
  const adminEnter = $('admin-enter');
  if (adminEnter) adminEnter.addEventListener('click', () => { switchPage('admin'); AdminLogs.init(userId); });
  const adminBack = $('admin-back');
  if (adminBack) adminBack.addEventListener('click', () => { setNavActive('еще'); switchPage('еще'); });
  const modalClose = $('modal-close');
  if (modalClose) modalClose.addEventListener('click', () => { $('modal').hidden = true; });
}
function showModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml || '';
  $('modal').hidden = false;
}