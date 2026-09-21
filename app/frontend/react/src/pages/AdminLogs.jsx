import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAdminLogs, fetchRoundDetails } from '../utils/api.js';

const RANGES = [
  { value: 'day', label: 'за сутки' },
  { value: 'week', label: 'за неделю' },
  { value: 'month', label: 'за месяц' },
  { value: 'all', label: 'все' },
];

const FIN_TYPES = [
  { value: '', label: 'все типы' },
  { value: 'transfer', label: 'переводы' },
  { value: 'donation', label: 'донаты' },
  { value: 'promo', label: 'промокоды' },
  { value: 'admin_give,admin_take,admin_set', label: 'действия админов' },
  { value: 'ban,unban', label: 'баны / разбаны' },
  { value: 'mute,unmute', label: 'муты / размуты' },
  { value: 'kick', label: 'кики' },
  { value: 'block_transfers,unblock_transfers', label: 'блокировки переводов' },
  { value: 'message', label: 'сообщения' },
];

const fmtTime = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}) : '—');
const fmtDate = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleDateString('ru-RU') : '—');
const fmtTimeShort = (ts) => (typeof ts === 'number' ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—');

// Жёсткая санация: отбрасываем строки-призраки, дубликаты и пустые строки
function sanitizeRows(rows, mode, view) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    if (mode === 'double' && view === 'rounds') {
      if (!r.round_id || typeof r.start_ts !== 'number') continue;
      const k = 'r' + r.round_id;
      if (seen.has(k)) continue;
      seen.add(k);
    } else if (mode === 'double' && view === 'bets') {
      if (!r.round_id || !r.user_id || !r.chat_id) continue;
      const k = 'b' + r.round_id + '|' + r.user_id + '|' + r.chat_id;
      if (seen.has(k)) continue;
      seen.add(k);
    } else {
      if (r.id == null) continue;
      const hasContent =
        (typeof r.action === 'string' && r.action.trim() !== '') ||
        r.amount != null ||
        r.actor_name || r.target_name ||
        r.actor_user_id || r.target_user_id ||
        r.chat_title || r.chat_type;
      if (!hasContent) continue;
      const k = 'f' + r.id;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(r);
  }
  return out;
}

// Цвет ставки: из БД, а при отсутствии is_win — сопоставлением с множителем раунда
function betVisual(bet, roundMultiplier, roundStatus) {
  if (bet.is_win === 1) return 'win';
  if (bet.is_win === 0) return 'loss';
  if (roundStatus === 'finished' && roundMultiplier) {
    return bet.multiplier === roundMultiplier ? 'win' : 'loss';
  }
  return 'pend';
}

// Статус выплаты группы ставок
function groupPayout(bets, roundStatus) {
  if (!bets || bets.length === 0) return 'pending';
  const st = bets.map((b) => b.payout_status);
  if (st.some((s) => s === 'failed')) return 'failed';
  if (st.every((s) => s === 'paid')) return 'paid';
  if (st.every((s) => s === 'lost')) return 'lost';
  if (roundStatus === 'finished') {
    return bets.some((b) => b.is_win === 1) ? 'paid' : 'lost';
  }
  return 'pending';
}

// Ключ контекста: для какого режима+вида пригодны данные
function ctxKey(mode, doubleView) {
  return mode === 'double' ? 'double:' + doubleView : 'finance';
}

const EMPTY_DATA = { rows: [], total: 0, pages: 1, page: 1, ctx: null };

export default function AdminLogs({ adminId }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('finance');
  const [doubleView, setDoubleView] = useState('rounds');
  const [range, setRange] = useState('day');
  const [types, setTypes] = useState('');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(EMPTY_DATA);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // { roundId, loading, error, details }
  const reqId = useRef(0);

  // Текущие значения фильтров — для проверки ответа в момент прилёта
  const currentRef = useRef({});
  currentRef.current = { mode, doubleView, range, types, searchApplied, page };

  const load = useCallback(async () => {
    const my = ++reqId.current;
    const req = { mode, doubleView, range, types, searchApplied, page };
    setLoading(true);
    try {
      const res = await fetchAdminLogs(req.mode, {
        callerId: adminId,
        range: req.range,
        types: req.mode === 'finance' && req.types ? req.types.split(',') : null,
        search: req.searchApplied,
        page: req.page,
        view: req.mode === 'double' ? req.doubleView : null,
      });
      if (my !== reqId.current) return;
      // Жёстко: ответ применим только если фильтры не изменились, пока он летел
      const cur = currentRef.current;
      if (
        cur.mode !== req.mode ||
        cur.doubleView !== req.doubleView ||
        cur.range !== req.range ||
        cur.types !== req.types ||
        cur.searchApplied !== req.searchApplied ||
        cur.page !== req.page
      ) return;
      setData({
        rows: sanitizeRows(res.rows, req.mode, req.mode === 'double' ? req.doubleView : 'finance'),
        total: res.total,
        pages: res.pages,
        page: res.page,
        ctx: ctxKey(req.mode, req.doubleView),
      });
      setError(null);
    } catch (e) {
      if (my !== reqId.current) return;
      setError(e.message);
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [mode, doubleView, range, types, searchApplied, page, adminId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Смена режима: мгновенно инвалидируем таблицу, чтобы чужой шаблон не рисовал старые строки
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setPage(1);
    setData(EMPTY_DATA);
  };

  // Смена вида дабла (раунды/ставки): то же самое
  const switchView = (v) => {
    if (v === doubleView) return;
    setDoubleView(v);
    setPage(1);
    setData(EMPTY_DATA);
  };

  const applySearch = () => { setPage(1); setSearchApplied(search.trim()); };

  // Данные пригодны к показу только если совпадает контекст
  const rowsMatch = data.ctx === ctxKey(mode, doubleView);
  const rows = rowsMatch ? sanitizeRows(data.rows, mode, mode === 'double' ? doubleView : 'finance') : [];
  const pages = rowsMatch ? data.pages : 1;
  const colsClass = mode === 'finance' ? 'cols-4' : 'cols-5';

  const openRoundDetails = async (roundId) => {
    setModal({ roundId, loading: true, error: null, details: null });
    try {
      const details = await fetchRoundDetails(roundId, adminId);
      setModal({ roundId, loading: false, error: null, details });
    } catch (e) {
      setModal({ roundId, loading: false, error: e.message, details: null });
    }
  };

  const copyHash = (hash) => {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(hash);
    } catch (e) { /* ignore */ }
  };

  return (
    <div className="page logs-page">
      <button className="page-close" onClick={() => navigate('/admin')} aria-label="Закрыть">
        <span className="material-symbols-rounded">close</span>
      </button>
      <div className="page-mode-title">Логи</div>
      <div className="logs-controls">
        <div className="logs-row">
          <div className="seg logs-seg">
            <button className={'seg-btn' + (mode === 'double' ? ' active' : '')} onClick={() => switchMode('double')}>дабл</button>
            <button className={'seg-btn' + (mode === 'finance' ? ' active' : '')} onClick={() => switchMode('finance')}>общее</button>
          </div>
          <input
            className="input logs-search"
            placeholder={mode === 'double' ? (doubleView === 'rounds' ? 'поиск по хешу раунда...' : 'ID игрока или хеш раунда...') : 'поиск по ID или нику...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
          />
          <button className="btn-mini" onClick={applySearch}>Найти</button>
        </div>
        <div className="logs-row">
          <select className="select" value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {mode === 'finance' && (
            <select className="select" value={types} onChange={(e) => { setTypes(e.target.value); setPage(1); }}>
              {FIN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
          {mode === 'double' && (
            <select className="select" value={doubleView} onChange={(e) => switchView(e.target.value)}>
              <option value="rounds">Раунды</option>
              <option value="bets">Ставки игроков</option>
            </select>
          )}
        </div>
      </div>
      {error && (
        <div className="card secondary"><div className="text">Ошибка загрузки: {error}</div></div>
      )}
      <div className="logs-table-wrap card secondary" key={`${mode}-${doubleView}`}>
        <div className="logs-scroll">
          {/* ШАПКА — первый элемент скролл-контейнера, липнет сверху */}
          {mode === 'finance' && (
            <div className={'logs-head ' + colsClass}>
              <div>Пользователь</div>
              <div>Цель / Чат</div>
              <div>Действие</div>
              <div>Время</div>
            </div>
          )}
          {mode === 'double' && doubleView === 'rounds' && (
            <div className={'logs-head ' + colsClass}>
              <div>Дата / время</div>
              <div>Хеш игры</div>
              <div>Статистика</div>
              <div>Множитель / соль</div>
              <div>Статус</div>
            </div>
          )}
          {mode === 'double' && doubleView === 'bets' && (
            <div className={'logs-head ' + colsClass}>
              <div>Игрок</div>
              <div>Раунд</div>
              <div>Чат</div>
              <div>Ставки</div>
              <div>Выплата</div>
            </div>
          )}
          {!rowsMatch && <div className="logs-empty">Загрузка данных…</div>}
          {rowsMatch && rows.length === 0 && <div className="logs-empty">Нет записей под текущие фильтры</div>}
          {rowsMatch && rows.map((r) => {
            if (mode === 'finance') {
              return (
                <div className={'logs-rowline ' + colsClass} key={'f' + r.id}>
                  <div>
                    <div className="logs-cell-name">{r.actor_name || '—'}</div>
                    <div className="logs-cell-sub">ID: {r.actor_num ?? '—'}</div>
                    <div className="logs-cell-sub">TG: {r.actor_user_id ?? '—'}</div>
                  </div>
                  <div>
                    {r.chat_type ? (
                      <>
                        <div className="logs-cell-name">
                          {r.chat_type === 'private' ? 'Личка' : r.chat_type === 'supergroup' ? 'Супергруппа' : r.chat_type === 'group' ? 'Группа' : r.chat_type}
                        </div>
                        {r.chat_title && <div className="logs-cell-sub">{r.chat_title}</div>}
                      </>
                    ) : (
                      <>
                        <div className="logs-cell-name">{r.target_name || '—'}</div>
                        <div className="logs-cell-sub">ID: {r.target_num ?? '—'}</div>
                        <div className="logs-cell-sub">TG: {r.target_user_id ?? '—'}</div>
                      </>
                    )}
                  </div>
                  <div className="logs-cell-action">{r.action}</div>
                  <div className="logs-cell-sub">{fmtTime(r.ts)}</div>
                </div>
              );
            }
            if (mode === 'double' && doubleView === 'rounds') {
              const finished = r.status === 'finished';
              return (
                <div className={'logs-rowline ' + colsClass} key={'r' + r.round_id}>
                  <div>
                    <div className="logs-cell-name">{fmtDate(r.start_ts)}</div>
                    <div className="logs-cell-sub">{fmtTimeShort(r.start_ts)}</div>
                    {finished && <div className="logs-cell-sub">End: {fmtTimeShort(r.end_ts)}</div>}
                  </div>
                  <div
                    className="logs-cell-sub"
                    style={{ cursor: 'pointer' }}
                    title={r.round_id}
                    onClick={() => copyHash(r.round_id)}
                  >
                    {String(r.round_id).slice(0, 12)}…
                  </div>
                  <div>
                    <span className="logs-stat-link" onClick={() => openRoundDetails(r.round_id)}>
                      👥 {r.participants_count ?? 0} · 💬 {r.chats_count ?? 0} · 🎲 {r.bets_count ?? 0}
                    </span>
                  </div>
                  <div>
                    <div className="logs-cell-name">{r.result_multiplier || '—'}</div>
                    <div className="logs-cell-sub">Соль: {r.salt || '—'}</div>
                  </div>
                  <div>
                    {finished
                      ? <span className="status-badge status-finished">✅ Завершен</span>
                      : <span className="status-badge status-active">⏳ Активен</span>}
                  </div>
                </div>
              );
            }
            // ставки
            const bets = Array.isArray(r.bets) ? r.bets : [];
            const payout = groupPayout(bets, r.round_status);
            const totalWin = bets.reduce((s, b) => s + (b.is_win === 1 ? (b.win_amount || 0) : 0), 0);
            return (
              <div className={'logs-rowline ' + colsClass} key={'b' + r.round_id + '|' + r.user_id + '|' + r.chat_id}>
                <div>
                  <div className="logs-cell-name">{r.user_name || '—'}</div>
                  <div className="logs-cell-sub">ID: {r.user_num ?? '—'}</div>
                  <div className="logs-cell-sub">TG: {r.user_id}</div>
                </div>
                <div className="logs-cell-sub">
                  <div>{fmtDate(r.round_start_ts)}</div>
                  <div>{fmtTimeShort(r.round_start_ts)} – {fmtTimeShort(r.round_end_ts)}</div>
                  <div>Мн: {r.result_multiplier || '—'}</div>
                </div>
                <div className="logs-cell-sub">
                  <div className="logs-cell-name">{r.chat_title || 'Чат без названия'}</div>
                  <div>{r.chat_id}</div>
                </div>
                <div>
                  {bets.map((b) => {
                    const v = betVisual(b, r.result_multiplier, r.round_status);
                    const cls = v === 'win' ? 'bet-win' : v === 'loss' ? 'bet-loss' : 'bet-pend';
                    return (
                      <div key={b.ts + '_' + b.multiplier + '_' + b.amount} className={cls}>
                        {b.amount} на {b.multiplier}{b.game_choice ? ` (${b.game_choice})` : ''}{v === 'win' && b.win_amount ? ` → +${b.win_amount}` : ''}
                      </div>
                    );
                  })}
                  {bets.length === 0 && <div className="bet-pend">нет ставок</div>}
                </div>
                <div className="logs-cell-sub">
                  {payout === 'paid' && <span className="bet-win">💰 Выплачено{totalWin ? `: ${totalWin} PF` : ''}</span>}
                  {payout === 'lost' && <span className="bet-loss">❌ Проигрыш</span>}
                  {payout === 'failed' && <span className="bet-loss">⚠️ Ошибка выплаты</span>}
                  {payout === 'pending' && <span>⏳ Ожидание</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="logs-pager">
        <button className="btn-mini" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
        <span>стр. {page} из {pages}{loading && rowsMatch ? ' (обновление…)' : ''}</span>
        <button className="btn-mini" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
      </div>
      {/* Модалка деталей раунда */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">Раунд {String(modal.roundId).slice(0, 8)}…</div>
            {modal.loading && <div className="logs-empty">Загрузка…</div>}
            {modal.error && <div className="logs-empty">Ошибка: {modal.error}</div>}
            {modal.details && (
              <div className="overlay-list">
                <div className="row"><span>Начало</span><span className="val">{fmtTime(modal.details.round?.start_ts)}</span></div>
                <div className="row"><span>Конец</span><span className="val">{modal.details.round?.end_ts ? fmtTime(modal.details.round.end_ts) : '—'}</span></div>
                <div className="row"><span>Иксовка</span><span className="val">{modal.details.round?.result_multiplier || '—'}</span></div>
                <div className="row"><span>Участников</span><span className="val">{modal.details.participants.length}</span></div>
                {modal.details.participants.map((p) => (
                  <div className="row" key={p.user_id}>
                    <span>{p.username || '—'} (ID {p.user_num ?? '—'})</span>
                    <span className="val">{p.bets} ст. / {p.bank.toLocaleString('ru-RU')} PF{p.won ? ` / +${p.won.toLocaleString('ru-RU')}` : ''}</span>
                  </div>
                ))}
                <div className="row"><span>Чатов</span><span className="val">{modal.details.chats.length}</span></div>
                {modal.details.chats.map((c) => (
                  <div className="row" key={c.chat_id}>
                    <span>{c.chat_title || 'Чат без названия'}</span>
                    <span className="val">{c.bets} ст. / {c.bank.toLocaleString('ru-RU')} PF</span>
                  </div>
                ))}
                <div className="row"><span>Ставок</span><span className="val">{modal.details.bets.length}</span></div>
                {modal.details.bets.map((b) => (
                  <div className="row" key={b.id}>
                    <span>{b.username || '—'} → {b.multiplier}{b.game_choice ? ` (${b.game_choice})` : ''}</span>
                    <span className={'val ' + (b.is_win === 1 ? 'bet-win' : b.is_win === 0 ? 'bet-loss' : '')}>
                      {b.amount.toLocaleString('ru-RU')}{b.is_win === 1 && b.win_amount ? ` → +${b.win_amount.toLocaleString('ru-RU')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-mini" style={{ marginTop: 12, width: '100%' }} onClick={() => setModal(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}