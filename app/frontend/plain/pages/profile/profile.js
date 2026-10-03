document.addEventListener('DOMContentLoaded', () => {
  buildBonusProgress();
  bindProfileUI();
  if (userId) { loadUser(); loadTickets(); }
});

async function loadUser() {
  try {
    const r = await fetch(`${API}/api/v2/user/${userId}`);
    if (!r.ok) return;
    const u = await r.json();
    $('nickname').textContent = u.username || '—';
    $('id-value').textContent = u.numeric_id ?? '—';
    $('status-value').textContent = u.topStatus || '—';
    const pf = Number(u.balance || 0).toLocaleString('ru-RU');
    $('pf-amount').textContent = pf;
    const hp = $('header-pf-amount'); // мини-плашки больше нет — проверяем наличие
    if (hp) hp.textContent = pf;
    $('df-amount').textContent = Number(u.df_balance || 0).toLocaleString('ru-RU');
    const admin = (u.statuses || []).some(s => s === 'Администратор' || s === 'Тех администратор');
    if (admin) {
      const btn = $('admin-enter');
      if (btn) btn.classList.remove('hidden');
    }
  } catch (e) { console.error(e); }
}

async function loadTickets() {
  try {
    const d = await (await fetch(`${API}/api/fortune/tickets/${userId}`)).json();
    $('ticket-count').textContent = d.tickets;
    $('fortune-count').textContent = d.tickets;
  } catch (e) { console.error(e); }
}

function buildBonusProgress() {
  const box = $('bonus-progress');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('span');
    b.className = 'bonus-card__progress-bar';
    box.appendChild(b);
  }
}

function bindProfileUI() {
  $('bonus-btn').addEventListener('click', () => alert('Бонусное колесо пока не реализовано.'));
  $('fortune-btn').addEventListener('click', () => alert('Колесо фортуны пока не реализовано.'));
  document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => alert('Покупка валюты — через бота, команда «донат».')));
  document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => alert('Справка: команда «помощь» в боте.')));
  $('promo-open').addEventListener('click', () => alert('Промокод активируется в боте: команда «промо [код]».'));
  $('channel-open').addEventListener('click', () => {
    const url = 'https://t.me/FBot42';
    if (TG && TG.openTelegramLink) TG.openTelegramLink(url);
    else window.open(url, '_blank');
  });
}