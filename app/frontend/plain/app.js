const API = '';
const TG = window.Telegram?.WebApp;
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const $ = (id) => document.getElementById(id);
let userId = null;
let ws = null; // WebSocket для онлайна

document.addEventListener('DOMContentLoaded', () => {
  if (TG) {
    TG.ready(); TG.expand();
    userId = TG.initDataUnsafe?.user?.id || null;
    const photo = TG.initDataUnsafe?.user?.photo_url;
    if (photo) { const img = $('avatar-img'); img.src = photo; img.style.display = 'block'; }
  }
  if (!userId && isLocal) userId = '768451950'; // тестовый id как в старом App.jsx
  buildBonusProgress();
  bindUI();
  if (userId) { loadUser(); loadTickets(); }
  connectOnlineWS(); // подключаем WebSocket для реального онлайна
});

async function loadUser() {
  try {
    const r = await fetch(`${API}/api/v2/user/${userId}`);
    if (!r.ok) return;
    const u = await r.json();
    $('nickname').textContent = u.username || '—';
    $('id-value').textContent = u.numeric_id ?? '—';
    $('pf-amount').textContent = Number(u.balance || 0).toLocaleString('ru-RU');
    $('df-amount').textContent = Number(u.df_balance || 0).toLocaleString('ru-RU');
    // Статусы не выводим (по ТЗ). Вход в админку — по реальным статусам из БД
    const admin = (u.statuses || []).some(s => s === 'Администратор' || s === 'Тех администратор');
    if (admin) $('admin-enter').classList.remove('hidden');
  } catch (e) { console.error(e); }
}

// Обновление текста онлайна во всех зеркалах
function updateOnlineText(count) {
  const text = `онлайн: ${count}`;
  const main = $('online-text');
  if (main) main.textContent = text;
  document.querySelectorAll('.online-text-mirror').forEach(el => { el.textContent = text; });
}

// Подключение к WebSocket для получения реального онлайна
function connectOnlineWS() {
  // Определяем протокол: если страница открыта по HTTPS — используем wss, иначе ws
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws/online`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Подключено к серверу онлайна');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'online_count') {
          updateOnlineText(data.count);
        }
      } catch (e) {
        console.error('[WS] Ошибка парсинга сообщения:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Ошибка соединения:', err);
    };

    ws.onclose = () => {
      console.log('[WS] Соединение закрыто. Переподключение через 5 сек...');
      setTimeout(connectOnlineWS, 5000);
    };
  } catch (e) {
    console.error('[WS] Не удалось создать WebSocket:', e);
    // Фолбэк: пробуем REST API раз в 30 секунд
    fallbackOnlinePolling();
  }
}

// Фолбэк: если WebSocket не работает, опрашиваем REST API
async function fallbackOnlinePolling() {
  try {
    const d = await (await fetch(`${API}/api/online`)).json();
    updateOnlineText(d.online);
  } catch (e) {
    console.error('[REST] Ошибка получения онлайна:', e);
  }
  setTimeout(fallbackOnlinePolling, 30000);
}

async function loadTickets() {
  try {
    const d = await (await fetch(`${API}/api/fortune/tickets/${userId}`)).json();
    $('ticket-count').textContent = d.tickets; $('fortune-count').textContent = d.tickets;
  } catch (e) { console.error(e); }
}

function buildBonusProgress() {
  const box = $('bonus-progress'); box.innerHTML = '';
  for (let i = 0; i < 6; i++) { const b = document.createElement('span'); b.className = 'bonus-card__progress-bar'; box.appendChild(b); }
}

// --- Навигация: 5 страниц + админка ---
function switchPage(name) {
  document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
  const target = $('page-' + name);
  if (target) target.classList.remove('hidden');
  // скролл в топ при смене страницы
  const sc = document.querySelector('.scroll-content');
  if (sc) sc.scrollTop = 0;
}
function setNavActive(name) {
  const items = document.querySelectorAll('.bottom-nav__item');
  items.forEach(i => {
    const active = i.getAttribute('data-nav') === name;
    i.classList.toggle('bottom-nav__item--active', active);
    i.querySelector('.bottom-nav__btn').classList.toggle('bottom-nav__btn--active', active);
    i.querySelector('.bottom-nav__label').classList.toggle('bottom-nav__label--active', active);
    const img = i.querySelector('img');
    if (img) img.src = active ? `icons/${name}.svg` : `icons/${name}_off.svg`;
  });
}
function bindUI() {
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    item.querySelector('.bottom-nav__btn').addEventListener('click', () => {
      const name = item.getAttribute('data-nav');
      setNavActive(name); switchPage(name);
    });
  });
  // Колёса пока витрина: вращение по нажатию не реализовано (по ТЗ)
  $('bonus-btn').addEventListener('click', () => alert('Бонусное колесо пока не реализовано.'));
  $('fortune-btn').addEventListener('click', () => alert('Колесо фортуны пока не реализовано.'));
  $('donate-open').addEventListener('click', () => alert('Донат открывается в боте: команда «донат».'));
  document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => alert('Покупка валюты — через бота, команда «донат».')));
  document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => alert('Справка: команда «помощь» в боте.')));
  $('admin-enter').addEventListener('click', () => { switchPage('admin'); AdminLogs.init(userId); });
  $('admin-back').addEventListener('click', () => { setNavActive('еще'); switchPage('еще'); });
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
}
function showModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml || '';
  $('modal').hidden = false;
}