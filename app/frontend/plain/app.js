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
  if (!userId && isLocal) userId = '768451950';
  bindCoreUI();
  connectOnlineWS();
  switchPage('профиль'); // Стартуем с профиля
});

// --- Онлайн ---
function updateOnlineText(count) {
  const el = $('online-text');
  if (el) el.textContent = `онлайн: ${count}`;
}
function connectOnlineWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/online`;
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('[WS] Connected');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'online_count') updateOnlineText(data.count);
      } catch (e) { console.error('[WS] Parse error', e); }
    };
    ws.onerror = (err) => console.error('[WS] Error', err);
    ws.onclose = () => setTimeout(connectOnlineWS, 5000);
  } catch (e) { fallbackOnlinePolling(); }
}
async function fallbackOnlinePolling() {
  try {
    const d = await (await fetch(`${API}/api/online`)).json();
    updateOnlineText(d.online);
  } catch (e) {}
  setTimeout(fallbackOnlinePolling, 30000);
}

// --- Хром страницы ---
function applyPageChrome(name) {
  const headerProfile = $('header-profile');
  const headerMini = $('header-mini');
  const onlineStatus = $('online-status');
  const screen = document.querySelector('.mobile-screen');

  if (name === 'профиль') {
    headerProfile.classList.remove('hidden');
    headerMini.classList.add('hidden');
    onlineStatus.classList.remove('hidden');
  } else if (name === 'admin') {
    headerProfile.classList.add('hidden');
    headerMini.classList.add('hidden');
    onlineStatus.classList.add('hidden');
  } else {
    headerProfile.classList.add('hidden');
    headerMini.classList.remove('hidden');
    if (name === 'еще') onlineStatus.classList.remove('hidden');
    else onlineStatus.classList.add('hidden');
  }
  screen.setAttribute('data-page', name);
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
    const itemName = i.getAttribute('data-nav'); // ФИКС: берем имя конкретной кнопки
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
      setNavActive(name);
      switchPage(name);
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