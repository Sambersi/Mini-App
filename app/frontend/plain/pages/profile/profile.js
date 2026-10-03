// Страница «профиль»: данные пользователя, колёса-витрина, плашки промокод/канал
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
      // Статус с максимальным приоритетом (приходит с бекенда, plainApi.js)
      $('status-value').textContent = u.topStatus || '—';
      const pf = Number(u.balance || 0).toLocaleString('ru-RU');
      $('pf-amount').textContent = pf;
      $('header-pf-amount').textContent = pf; // мини-плашка на вкладке «играть»
      $('df-amount').textContent = Number(u.df_balance || 0).toLocaleString('ru-RU');
      // Вход в админку — по реальным статусам из БД
      // (НЕ по /api/admin/check: он в index.js всегда возвращает true)
      const admin = (u.statuses || []).some(s => s === 'Администратор' || s === 'Тех администратор');
      if (admin) $('admin-enter').classList.remove('hidden');
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
    const box = $('bonus-progress'); box.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const b = document.createElement('span');
      b.className = 'bonus-card__progress-bar';
      box.appendChild(b);
    }
  }
  
  function bindProfileUI() {
    // Колёса пока витрина: вращение по нажатию не реализовано (по ТЗ)
    $('bonus-btn').addEventListener('click', () => alert('Бонусное колесо пока не реализовано.'));
    $('fortune-btn').addEventListener('click', () => alert('Колесо фортуны пока не реализовано.'));
    document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => alert('Покупка валюты — через бота, команда «донат».')));
    document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', () => alert('Справка: команда «помощь» в боте.')));
    // Промокоды активируются в боте (эндпоинта активации с веба нет)
    $('promo-open').addEventListener('click', () => alert('Промокод активируется в боте: команда «промо [код]».'));
    // Канал проекта: t.me/FBot42 (адрес взят из текстов бота, bot.js)
    $('channel-open').addEventListener('click', () => {
      const url = 'https://t.me/FBot42';
      if (TG && TG.openTelegramLink) TG.openTelegramLink(url);
      else window.open(url, '_blank');
    });
  }