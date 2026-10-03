// Логи: портировано с AdminLogs.jsx (React) на plain JS. Эндпоинты: /api/admin/logs/*
const AdminLogs = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FIN_TYPES = [
    { v: '', l: 'все типы' }, { v: 'transfer', l: 'переводы' }, { v: 'donation', l: 'донаты' },
    { v: 'promo', l: 'промокоды' }, { v: 'admin_give,admin_take,admin_set', l: 'действия админов' },
    { v: 'ban,unban', l: 'баны / разбаны' }, { v: 'mute,unmute', l: 'муты / размуты' }, { v: 'kick', l: 'кики' },
    { v: 'block_transfers,unblock_transfers', l: 'блокировки переводов' }, { v: 'message', l: 'сообщения' },
  ];
  const fmtTime = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
  const fmtDate = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleDateString('ru-RU') : '—');
  const fmtTimeShort = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—');
  const st = { mode: 'finance', view: 'rounds', types: '', search: '', page: 1, jumpTs: null, pages: 1, inited: false, timer: null };

  function init(userId) {
    if (st.inited) { load(); return; }
    st.inited = true;
    const sel = $('logs-types');
    sel.innerHTML = FIN_TYPES.map(t => `<option value="${esc(t.v)}">${esc(t.l)}</option>`).join('');
    sel.addEventListener('change', () => { st.types = sel.value; st.page = 1; load(); });
    $('mode-finance').addEventListener('click', () => setMode('finance'));
    $('mode-double').addEventListener('click', () => setMode('double'));
    $('logs-view').addEventListener('change', () => { st.view = $('logs-view').value; st.page = 1; load(); });
    $('logs-find').addEventListener('click', () => { st.search = $('logs-search').value.trim(); st.page = 1; load(); });
    $('logs-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { st.search = $('logs-search').value.trim(); st.page = 1; load(); } });
    $('logs-prev').addEventListener('click', () => { if (st.page > 1) { st.page--; load(); } });
    $('logs-next').addEventListener('click', () => { if (st.page < st.pages) { st.page++; load(); } });
    $('logs-date-btn').addEventListener('click', () => $('logs-date-input').classList.toggle('hidden'));
    $('logs-date-input').addEventListener('change', () => {
      const ts = new Date($('logs-date-input').value).getTime();
      if (Number.isNaN(ts)) return;
      st.jumpTs = ts; st.page = 1;
      $('logs-date-btn').textContent = '📅 ' + new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      $('logs-date-reset').classList.remove('hidden');
      load();
    });
    $('logs-date-reset').addEventListener('click', () => {
      st.jumpTs = null; st.page = 1;
      $('logs-date-btn').textContent = '📅 выбрать время';
      $('logs-date-reset').classList.add('hidden');
      $('logs-date-input').classList.add('hidden');
      load();
    });
    // автообновление каждые 20 сек, только без выбранной даты (как в React-версии)
    st.timer = setInterval(() => { if (!st.jumpTs && !$('page-admin').classList.contains('hidden')) load(); }, 20000);
    load();
  }

  function setMode(m) {
    if (st.mode === m) return;
    st.mode = m; st.page = 1;
    $('mode-finance').classList.toggle('active', m === 'finance');
    $('mode-double').classList.toggle('active', m === 'double');
    $('logs-types').classList.toggle('hidden', m !== 'finance');
    $('logs-view').classList.toggle('hidden', m !== 'double');
    $('logs-search').placeholder = m === 'double' ? (st.view === 'rounds' ? 'поиск по хешу...' : 'ID игрока...') : 'поиск по ID...';
    load();
  }

  async function load() {
    const q = new URLSearchParams();
    q.set('page', st.page);
    if (st.jumpTs != null) q.set('targetTs', st.jumpTs);
    if (st.search) q.set('search', st.search);
    if (st.mode === 'finance' && st.types) q.set('types', st.types);
    if (st.mode === 'double') q.set('view', st.view);
    const url = `${API}/api/admin/logs/${st.mode === 'finance' ? 'finance' : 'double'}?${q.toString()}`;
    $('logs-body').innerHTML = '<div class="logs-empty">Загрузка…</div>';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      st.pages = data.pages || 1;
      if (st.jumpTs != null && typeof data.page === 'number') { st.page = data.page; st.jumpTs = null; }
      render(data.rows || []);
      $('logs-page').textContent = `стр. ${st.page} из ${st.pages}`;
    } catch (e) {
      $('logs-body').innerHTML = `<div class="logs-empty">Ошибка: ${esc(e.message)}</div>`;
    }
  }

  function head(cols, cells) { return `<div class="logs-head ${cols}">${cells.map(c => `<div>${c}</div>`).join('')}</div>`; }

  function render(rows) {
    const box = $('logs-body');
    if (!rows.length) { box.innerHTML = '<div class="logs-empty">Нет записей под текущие фильтры</div>'; return; }
    let html = '';
    if (st.mode === 'finance') {
      html += head('cols-4', ['Пользователь', 'Цель / Чат', 'Действие', 'Время']);
      for (const r of rows) {
        html += `<div class="logs-rowline cols-4">
          <div><div class="logs-cell-name">${esc(r.actor_name || '—')}</div><div class="logs-cell-sub">ID: ${esc(r.actor_num ?? '—')}</div><div class="logs-cell-sub">TG: ${esc(r.actor_user_id ?? '—')}</div></div>
          <div>${r.chat_type ? `<div class="logs-cell-name">${r.chat_type === 'private' ? 'Личка' : r.chat_type === 'supergroup' ? 'Супергруппа' : esc(r.chat_type)}</div>${r.chat_title ? `<div class="logs-cell-sub">${esc(r.chat_title)}</div>` : ''}` : `<div class="logs-cell-name">${esc(r.target_name || '—')}</div><div class="logs-cell-sub">ID: ${esc(r.target_num ?? '—')}</div><div class="logs-cell-sub">TG: ${esc(r.target_user_id ?? '—')}</div>`}</div>
          <div class="logs-cell-action">${esc(r.action)}</div>
          <div class="logs-cell-sub">${fmtTime(r.ts)}</div>
        </div>`;
      }
    } else if (st.view === 'rounds') {
      html += head('cols-5', ['Дата / время', 'Хеш игры', 'Статистика', 'Множ / соль', 'Статус']);
      for (const r of rows) {
        const finished = r.status === 'finished';
        html += `<div class="logs-rowline cols-5">
          <div><div class="logs-cell-name">${fmtDate(r.start_ts)}</div><div class="logs-cell-sub">${fmtTimeShort(r.start_ts)}</div>${finished ? `<div class="logs-cell-sub">End: ${fmtTimeShort(r.end_ts)}</div>` : ''}</div>
          <div class="logs-cell-sub" style="cursor:pointer" title="${esc(r.round_id)}" data-copy="${esc(r.round_id)}">${esc(String(r.round_id).slice(0, 12))}…</div>
          <div><span class="logs-stat-link" data-round="${esc(r.round_id)}">👥 ${r.participants_count ?? 0} · 💬 ${r.chats_count ?? 0} · 🎲 ${r.bets_count ?? 0}</span></div>
          <div><div class="logs-cell-name">${esc(r.result_multiplier || '—')}</div><div class="logs-cell-sub">Соль: ${esc(r.salt || '—')}</div></div>
          <div>${finished ? '<span class="status-badge status-finished">✅ Завершен</span>' : '<span class="status-badge status-active">⏳ Активен</span>'}</div>
        </div>`;
      }
    } else {
      html += head('cols-5', ['Игрок', 'Раунд', 'Чат', 'Ставки', 'Выплата']);
      for (const r of rows) {
        const bets = Array.isArray(r.bets) ? r.bets : [];
        const betsHtml = bets.map(b => {
          let v = b.is_win === 1 ? 'win' : b.is_win === 0 ? 'loss' : (r.round_status === 'finished' ? (b.multiplier === r.result_multiplier ? 'win' : 'loss') : 'pend');
          return `<div class="bet-${v}">${esc(b.amount)} на ${esc(b.multiplier)}${b.game_choice ? `(${esc(b.game_choice)})` : ''}${v === 'win' && b.win_amount ? ` → +${esc(b.win_amount)}` : ''}</div>`;
        }).join('') || '<div class="bet-pend">нет ставок</div>';
        const sts = bets.map(b => b.payout_status);
        const payout = !bets.length ? 'pending'
          : sts.some(s => s === 'failed') ? 'failed'
          : sts.every(s => s === 'paid') ? 'paid'
          : sts.every(s => s === 'lost') ? 'lost'
          : r.round_status === 'finished' ? (bets.some(b => b.is_win === 1) ? 'paid' : 'lost') : 'pending';
        const totalWin = bets.reduce((s, b) => s + (b.is_win === 1 ? (b.win_amount || 0) : 0), 0);
        const payoutHtml = payout === 'paid' ? `<span class="bet-win">💰 Выплачено${totalWin ? `: ${totalWin} PF` : ''}</span>`
          : payout === 'failed' ? '<span class="bet-loss">⚠️ Ошибка выплаты</span>'
          : payout === 'lost' ? '<span class="bet-loss">❌ Проигрыш</span>' : '<span>⏳ Ожидание</span>';
        html += `<div class="logs-rowline cols-5">
          <div><div class="logs-cell-name">${esc(r.user_name || '—')}</div><div class="logs-cell-sub">ID: ${esc(r.user_num ?? '—')}</div><div class="logs-cell-sub">TG: ${esc(r.user_id)}</div></div>
          <div class="logs-cell-sub"><div>${fmtDate(r.round_start_ts)}</div><div>${fmtTimeShort(r.round_start_ts)} – ${fmtTimeShort(r.round_end_ts)}</div><div>Мн: ${esc(r.result_multiplier || '—')}</div></div>
          <div><div class="logs-cell-name">${esc(r.chat_title || 'Чат без названия')}</div><div class="logs-cell-sub">${esc(r.chat_id)}</div></div>
          <div>${betsHtml}</div>
          <div class="logs-cell-sub">${payoutHtml}</div>
        </div>`;
      }
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-round]').forEach(el => el.addEventListener('click', () => openRound(el.getAttribute('data-round'))));
    box.querySelectorAll('[data-copy]').forEach(el => el.addEventListener('click', () => { try { navigator.clipboard.writeText(el.getAttribute('data-copy')); } catch (e) {} }));
  }

  async function openRound(roundId) {
    showModal('Раунд ' + String(roundId).slice(0, 8) + '…', '<div class="logs-empty">Загрузка…</div>');
    try {
      const res = await fetch(`${API}/api/admin/logs/double/round/${encodeURIComponent(roundId)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      const row = (k, v) => `<div class="row"><span>${esc(k)}</span><span class="val">${v}</span></div>`;
      let body = row('Начало', fmtTime(d.round?.start_ts));
      body += row('Конец', d.round?.end_ts ? fmtTime(d.round.end_ts) : '—');
      body += row('Иксовка', esc(d.round?.result_multiplier || '—'));
      body += row('Участников', d.participants.length);
      for (const p of d.participants) body += row(`${esc(p.username || '—')} (ID ${esc(p.user_num ?? '—')})`, `${p.bets} ст. / ${p.bank.toLocaleString('ru-RU')} PF${p.won ? ` / +${p.won.toLocaleString('ru-RU')}` : ''}`);
      body += row('Чатов', d.chats.length);
      for (const c of d.chats) body += row(esc(c.chat_title || 'Чат без названия'), `${c.bets} ст. / ${c.bank.toLocaleString('ru-RU')} PF`);
      body += row('Ставок', d.bets.length);
      for (const b of d.bets) body += row(`${esc(b.username || '—')} → ${esc(b.multiplier)}${b.game_choice ? `(${esc(b.game_choice)})` : ''}`, `<span class="${b.is_win === 1 ? 'bet-win' : b.is_win === 0 ? 'bet-loss' : ''}">${b.amount.toLocaleString('ru-RU')}${b.is_win === 1 && b.win_amount ? ` → +${b.win_amount.toLocaleString('ru-RU')}` : ''}</span>`);
      showModal('Раунд ' + String(roundId).slice(0, 8) + '…', body);
    } catch (e) {
      showModal('Раунд ' + String(roundId).slice(0, 8) + '…', `<div class="logs-empty">Ошибка: ${esc(e.message)}</div>`);
    }
  }

  return { init };
})();