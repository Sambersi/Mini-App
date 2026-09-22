const BASE = '';
export async function fetchUser(userId) {
  const r = await fetch(`${BASE}/api/user/${userId}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
export async function fetchAdminCheck(userId) {
  const r = await fetch(`${BASE}/api/admin/check/${userId}`);
  if (!r.ok) return { isAdmin: false };
  return r.json();
}
export async function fetchTickets(userId) {
  const r = await fetch(`${BASE}/api/fortune/tickets/${userId}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
export async function spinFortune(userId) {
  const r = await fetch(`${BASE}/api/fortune/spin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Spin failed');
  return data;
}
export async function fetchAdminLogs(mode, opts = {}) {
  const { callerId, range = 'day', types = null, search = '', page = 1, view = null, targetTs = null } = opts;
  const qs = new URLSearchParams();
  qs.set('callerId', String(callerId ?? ''));
  qs.set('range', range); // Передаем диапазон (day, week, month, all)
  qs.set('page', String(page)); // Передаем номер страницы
  if (targetTs != null) qs.set('targetTs', String(targetTs)); // Момент времени для перехода к ближайшей странице
  if (types && types.length) qs.set('types', Array.isArray(types) ? types.join(',') : String(types));
  if (search) qs.set('search', search);
  if (view) qs.set('view', view);
  const res = await fetch(`/api/admin/logs/${mode}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function fetchRoundDetails(roundId, callerId) {
  const qs = new URLSearchParams();
  qs.set('callerId', String(callerId ?? ''));
  const res = await fetch(`/api/admin/logs/double/round/${encodeURIComponent(roundId)}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}