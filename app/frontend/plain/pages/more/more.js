// Страница «ещё»: показ кнопки входа в админку только администраторам
document.addEventListener('DOMContentLoaded', async () => {
  const btn = $('admin-enter');
  if (!btn || !userId) return;
  try {
    const r = await fetch(`${API}/api/v2/user/${userId}`);
    if (!r.ok) return;
    const u = await r.json();
    const admin = (u.statuses || []).some(s => s === 'Администратор' || s === 'Тех администратор');
    if (admin) btn.classList.remove('hidden');
  } catch (e) { console.error(e); }
});