// bind.js — связь дизайнерской страницы с бэкендом (plainApi: /api/v2/*, WS /ws/online)
const API = '';
const TG = window.Telegram?.WebApp;
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const $ = (id) => document.getElementById(id);
let userId = null;
let bonusReady = false;
let bonusTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (TG) {
    TG.ready(); TG.expand();
    userId = TG.initDataUnsafe?.user?.id || null;
    const photo = TG.initDataUnsafe?.user?.photo_url;
    if (photo) {
      const img = document.querySelector('.profile-card__avatar-img');
      if (img) { img.src = photo; img.style.display = 'block'; }
    }
  }
  if (!userId && isLocal) userId = '768451950'; // тестовый id для локалки
  connectOnlineWS();
  if (userId) {
    loadUser();
    loadTickets();
    loadBonusStatus();
  }
  setupBonusButton();
});

const fmtMoney = (n) => Number(n || 0).toLocaleString('ru-RU');

// --- профиль: /api/v2/user/:id ---
async function loadUser() {
  try {
    const r = await fetch(`${API}/api/v2/user/${userId}`);
    if (!r.ok) return;
    const u = await r.json();
    $('nickname').textContent = u.username || '—';
    $('status-value').textContent = u.topStatus || '—';
    $('id-value').textContent = u.numeric_id ?? '—';
    $('pf-amount').textContent = fmtMoney(u.balance);
    $('df-amount').textContent = fmtMoney(u.df_balance);
  } catch (e) { console.error('[bind] user:', e); }
}

// --- билеты: /api/fortune/tickets/:userId ---
async function loadTickets() {
  try {
    const d = await (await fetch(`${API}/api/fortune/tickets/${userId}`)).json();
    $('ticket-count').textContent = d.tickets;
    $('fortune-count').textContent = d.tickets;
  } catch (e) { console.error('[bind] tickets:', e); }
}

// --- бонус: статус (кулдаун 2 часа задаёт plainApi: BONUS_COOLDOWN_SEC) ---
async function loadBonusStatus() {
  try {
    const d = await (await fetch(`${API}/api/v2/bonus/status/${userId}`)).json();
    renderProgress(d.progress || 0, d.megaEvery || 6);
    startBonusTimer(d.availableIn || 0);
  } catch (e) { console.error('[bind] bonus status:', e); }
}

function renderProgress(filled, total) {
  const box = $('bonus-progress');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const b = document.createElement('span');
    b.className = 'bonus-card__progress-bar' + (i < filled ? ' bonus-card__progress-bar--filled' : '');
    box.appendChild(b);
  }
}

// --- таймер 2 часа: формат Ч:ММ:СС (или ММ:СС меньше часа) ---
function fmtTimer(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function startBonusTimer(sec) {
  const btn = $('bonus-btn');
  if (!btn) return;
  const text = btn.querySelector('.bonus-card__btn-text');
  if (!text) return;
  if (bonusTimer) { clearInterval(bonusTimer); bonusTimer = null; }
  if (sec <= 0) {
    bonusReady = true;
    text.textContent = 'забрать бонус';
    return;
  }
  bonusReady = false;
  let left = sec;
  const tick = () => {
    if (left <= 0) {
      clearInterval(bonusTimer); bonusTimer = null;
      bonusReady = true;
      text.textContent = 'забрать бонус';
      return;
    }
    text.textContent = `доступно через ${fmtTimer(left)}`;
    left--;
  };
  tick();
  bonusTimer = setInterval(tick, 1000);
}

// Кнопку бонуса клонируем: снимаем дизайнерский listener (модалка)
// и вешаем реальный спин. Модалка на кулдауне НЕ открывается — только отсчёт на кнопке.
function setupBonusButton() {
  const btn = $('bonus-btn');
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  clone.addEventListener('click', async () => {
    if (!bonusReady) return; // таймер уже идёт на кнопке
    try {
      const r = await fetch(`${API}/api/v2/bonus/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (r.status === 425) {
        const d = await r.json();
        startBonusTimer(d.availableIn || 0);
        return;
      }
      if (!r.ok) { openInfo('Ошибка получения бонуса.'); return; }
      const d = await r.json();
      openInfo(d.isMega
        ? `MEGA! Вы получили +${fmtMoney(d.amount)} PF`
        : `Вы получили +${fmtMoney(d.amount)} PF`);
      renderProgress(d.progress || 0, 6);
      startBonusTimer(d.availableIn || 0);
      loadUser();
    } catch (e) {
      console.error('[bind] spin:', e);
      openInfo('Ошибка сети.');
    }
  });
}

function openInfo(text) {
  const t = $('modalText');
  if (t) t.textContent = text;
  const o = $('modalOverlay');
  if (o) o.classList.add('active');
}

// --- онлайн: WebSocket /ws/online ---
function connectOnlineWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/online`;
  try {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'online_count') {
          const el = $('online-text');
          if (el) el.textContent = `онлайн: ${data.count}`;
        }
      } catch (e) { console.error('[bind] ws parse:', e); }
    };
    ws.onclose = () => setTimeout(connectOnlineWS, 5000);
    ws.onerror = () => {};
  } catch (e) { console.error('[bind] ws:', e); }
}