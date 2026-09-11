import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAdminLogs } from '../utils/api.js';

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
  { value: 'message', label: 'сообщения' }, // ✅ НОВОЕ: Фильтр сообщений
];

const fmtTime = (ts) => new Date(ts).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Приводим строки обоих режимов («общее» и «дабл») к единому виду
function normalizeRow(r) {
  // строки finance_log: есть actor_*/target_* поля
  if (r.actor_user_id !== undefined || r.actor_name !== undefined) {
    return {
      id: r.id,
      ts: r.ts,
      action: r.action,
      userName: r.actor_name || null,
      userNum: r.actor_num ?? null,
      userTg: r.actor_user_id || null,
      targetName: r.target_name || null,
      targetNum: r.target_num ?? null,
      targetTg: r.target_user_id || null,
      targetExtra: null,
      chatType: r.chat_type || null,   // ✅ НОВОЕ: Тип чата
      chatTitle: r.chat_title || null, // ✅ НОВОЕ: Название чата
    };
  }
  // строки double_bets_log / double_rounds
  return {
    id: r.id,
    ts: r.ts,
    action: r.action,
    userName: r.userName || null,
    userNum: r.userNum ?? null,
    userTg: r.userId || null,
    targetName: null,
    targetNum: null,
    targetTg: null,
    targetExtra: r.targetId || null, // хеш раунда
  };
}

export default function AdminLogs({ adminId }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('finance'); // 'finance' | 'double'
  const [range, setRange] = useState('day');
  const [types, setTypes] = useState('');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pages: 1, page: 1 });
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const my = ++reqId.current;
    try {
      const res = await fetchAdminLogs(mode, {
        callerId: adminId,
        range,
        types: mode === 'finance' && types ? types.split(',') : null,
        search: searchApplied,
        page,
      });
      if (my !== reqId.current) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (my !== reqId.current) return;
      setError(e.message);
    }
  }, [mode, range, types, searchApplied, page, adminId]);

  useEffect(() => { load(); }, [load]);

  // Автообновление каждые 20 секунд
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const applySearch = () => { setPage(1); setSearchApplied(search.trim()); };

  const rows = data.rows.map(normalizeRow);

  return (
    <div className="page logs-page">
      <button className="page-close" onClick={() => navigate('/admin')} aria-label="Закрыть">
        <span className="material-symbols-rounded">close</span>
      </button>
      <div className="page-mode-title">Логи</div>

      <div className="logs-controls">
        <div className="logs-row">
          <div className="seg logs-seg">
            <button className={'seg-btn' + (mode === 'double' ? ' active' : '')} onClick={() => { setMode('double'); setPage(1); }}>дабл</button>
            <button className={'seg-btn' + (mode === 'finance' ? ' active' : '')} onClick={() => { setMode('finance'); setPage(1); }}>общее</button>
          </div>
          <input
            className="input logs-search"
            placeholder="поиск по ID или нику..."
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
        </div>
      </div>

      {error && (
        <div className="card secondary"><div className="text">Ошибка загрузки: {error}</div></div>
      )}

      <div className="logs-table-wrap card secondary">
        <div className="logs-table">
          <div className="logs-head">
            <div>ПОЛЬЗОВАТЕЛЬ</div>
            <div>ЦЕЛЬ / ВЗАИМОДЕЙСТВИЕ</div>
            <div>ДЕЙСТВИЕ</div>
            <div>ВРЕМЯ</div>
          </div>
          {rows.length === 0 && <div className="logs-empty">Нет записей под текущие фильтры</div>}
          {rows.map((r) => (
            <div className="logs-rowline" key={r.id}>
              {/* Колонка 1: кто совершил действие */}
              <div>
                <div className="logs-cell-name">{r.userName || '—'}</div>
                <div className="logs-cell-sub">ID: {r.userNum ?? '—'}</div>
                <div className="logs-cell-sub">TG: {r.userTg ?? '—'}</div>
              </div>

              {/* Колонка 2: цель / взаимодействие ИЛИ ЧАТ (для сообщений) */}
              <div>
                {r.chatType ? (
                  // ✅ Если это сообщение — показываем тип и название чата
                  <>
                    <div className="logs-cell-name">
                      {r.chatType === 'private' ? 'Личные сообщения' : 
                       r.chatType === 'group' ? 'Группа' : 
                       r.chatType === 'supergroup' ? 'Супергруппа' : r.chatType}
                    </div>
                    {r.chatTitle && <div className="logs-cell-sub">{r.chatTitle}</div>}
                  </>
                ) : r.targetName || r.targetNum != null || r.targetTg ? (
                  // Обычная логика для финансовых/модерационных логов
                  <>
                    <div className="logs-cell-name">{r.targetName || '—'}</div>
                    <div className="logs-cell-sub">ID: {r.targetNum ?? '—'}</div>
                    <div className="logs-cell-sub">TG: {r.targetTg ?? '—'}</div>
                  </>
                ) : r.targetExtra ? (
                  <div className="logs-cell-sub">Раунд: {r.targetExtra}</div>
                ) : (
                  <div className="logs-cell-sub">—</div>
                )}
              </div>

              {/* Колонка 3: действие */}
              <div className="logs-cell-action">{r.action}</div>

              {/* Колонка 4: время */}
              <div className="logs-cell-sub">{fmtTime(r.ts)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="logs-pager">
        <button className="btn-mini" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
        <span>стр. {page} из {data.pages}</span>
        <button className="btn-mini" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>→</button>
      </div>
    </div>
  );
}