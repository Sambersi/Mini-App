// bind.js — клей между дизайнерской страницей и бэкендом (plainApi: /api/v2/*, WS /ws/online)
const API = '';
const TG = window.Telegram?.WebApp;
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
let userId = null;
let bonusReady = false;
let bonusTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (TG) {
    TG.ready(); TG.expand();
    userId = TG.initDataUnsafe?.user?.id || null;
    const photo = TG.initDataUnsafe?.user?.photo_url;
    if (photo) {
      const img = $('.profile-card__avatar-img');
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
    const nick = $('.profile-card__nickname'); if (nick) nick.textContent = u.username || '—';
    const st = $('.profile-card__status-value'); if (st) st.textContent = u.topStatus || '—';
    const idv = $('.profile-card__id-value'); if (idv) idv.textContent = u.numeric_id ?? '—';
    const amounts = $$('.currency-card__amount');
    if (amounts[0]) amounts[0].textContent = fmtMoney(u.balance);
    if (amounts[1]) amounts[1].textContent = fmtMoney(u.df_balance);
  } catch (e) { console.error('[bind] user:', e); }
}

// --- билеты фортуны: /api/fortune/tickets/:userId ---
async function loadTickets() {
  try {
    const d = await (await fetch(`${API}/api/fortune/tickets/${userId}`)).json();
    $$('.ticket-badge__count').forEach(el => { el.textContent = d.tickets; });
  } catch (e) { console.error('[bind] tickets:', e); }
}

// --- бонус: статус и прогресс ---
async function loadBonusStatus() {
  try {
    const d = await (await fetch(`${API}/api/v2/bonus/status/${userId}`)).json();
    renderProgress(d.progress || 0, d.megaEvery || 6);
    startBonusTimer(d.availableIn || 0);
  } catch (e) { console.error('[bind] bonus status:', e); }
}

function renderProgress(filled, total) {
  const box = $('.bonus-card__progress');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const b = document.createElement('span');
    b.className = 'bonus-card__progress-bar' + (i < filled ? ' bonus-card__progress-bar--filled' : '');
    box.appendChild(b);
  }
}

function startBonusTimer(sec) {
  const btn = $$('.bonus-card__btn')[0];
  if (!btn) return;
  const text = btn.querySelector('.bonus-card__btn-text');
  if (!text) return;
  if (bonusTimer) clearInterval(bonusTimer);
  if (sec <= 0) {
    bonusReady = true;
    text.textContent = 'забрать бонус';
    return;
  }
  bonusReady = false;
  const tick = () => {
    if (sec <= 0) {
      clearInterval(bonusTimer); bonusTimer = null;
      bonusReady = true;
      text.textContent = 'забрать бонус';
      return;
    }
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    text.textContent = `доступно через ${m}:${s}`;
    sec--;
  };
  tick();
  bonusTimer = setInterval(tick, 1000);
}

// Кнопка бонуса: клонируем узел, чтобы снять дизайнерский listener (модалка)
// и повесить реальное обращение к /api/v2/bonus/spin
function setupBonusButton() {
  const btn = $$('.bonus-card__btn')[0];
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  clone.addEventListener('click', async () => {
    if (!bonusReady) {
      openInfo('Бонус ещё не готов: дождитесь таймера.');
      return;
    }
    try {
      const r = await fetch(`${API}/api/v2/bonus/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (r.status === 425) {
        const d = await r.json();
        startBonusTimer(d.availableIn || 0);
        openInfo('Бонус ещё не готов: дождитесь таймера.');
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
  const t = $('.modal-text');
  if (t) t.textContent = text;
  const o = $('#modalOverlay');
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
          const el = $('.online-status__text');
          if (el) el.textContent = `онлайн: ${data.count}`;
        }
      } catch (e) { console.error('[bind] ws parse:', e); }
    };
    ws.onclose = () => setTimeout(connectOnlineWS, 5000);
    ws.onerror = () => {};
  } catch (e) { console.error('[bind] ws:', e); }
}