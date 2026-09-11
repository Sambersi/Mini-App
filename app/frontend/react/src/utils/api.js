const BASE = ''; // на проде тот же домен, локально проксируется Vite

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
export async function fetchAdminLogs(mode, { callerId, range = 'day', types = null, search = '', page = 1 } = {}) {
  const q = new URLSearchParams({ callerId, range, page: String(page) });
  if (types && types.length) q.set('types', types.join(','));
  if (search) q.set('search', search);
  const r = await fetch(`${BASE}/api/admin/logs/${mode === 'double' ? 'double' : 'finance'}?${q}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}