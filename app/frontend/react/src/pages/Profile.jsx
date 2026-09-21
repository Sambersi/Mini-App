import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSoundEnabled, setSoundEnabled, getSoundType, setSoundType, playWin } from '../utils/sound.js';

const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

export default function Profile({ user, tgUser, isAdmin }) {
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [soundType, setSoundTypeState] = useState(getSoundType());

  if (!user) {
    return <div className="page"><div className="card secondary"><div className="card-title">Нет данных</div></div></div>;
  }

  const name = (tgUser && (tgUser.username || tgUser.first_name)) || user.username || 'Игрок';
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div className="page">
      <div className="card profile-head">
        <div className="avatar-big">{initial}</div>
        <div className="card-title" style={{ fontSize: 18, margin: 0 }}>
          {name}
          {isAdmin && <span className="admin-badge">ADMIN</span>}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
          ID: {user.numeric_id ?? user.id}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Активы</div>
        <div className="row"><span>Баланс PF</span><span className="val">{fmt(user.balance)}</span></div>
        <div className="row"><span>Баланс DF</span><span className="val">{fmt(user.df_balance)}</span></div>
        <div className="row"><span>Билеты</span><span className="val">{fmt(user.tickets)}</span></div>
        <div className="row"><span>Акции NPF</span><span className="val">{fmt(user.npf_shares)}</span></div>
      </div>

      <div className="card secondary">
        <div className="card-title">Настройки</div>
        <div className="row">
          <span>Звук вращения</span>
          <input
            type="checkbox"
            checked={soundOn}
            onChange={(e) => { setSoundOn(e.target.checked); setSoundEnabled(e.target.checked); }}
          />
        </div>
        <div className="row">
          <span>Тип звука</span>
          <select
            className="select"
            value={soundType}
            onChange={(e) => { setSoundTypeState(e.target.value); setSoundType(e.target.value); }}
          >
            <option value="classic">Классический</option>
            <option value="soft">Мягкий</option>
          </select>
        </div>
        <button className="btn ghost" onClick={() => playWin()}>Проверить звук</button>
      </div>

      {isAdmin && (
        <div className="card admin-card">
          <div className="card-title">Администрирование</div>
          <p className="text">Управление ботом, игроками, финансами и логами.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              className="btn admin-enter-btn"
              onClick={() => navigate('/admin')}
            >
              <span className="material-symbols-rounded" style={{ marginRight: 8 }}>admin_panel_settings</span>
              Админ-панель
            </button>

            {/* НОВАЯ КНОПКА */}
            <button
              className="btn ghost"
              style={{ 
                background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)', 
                border: 'none',
                color: '#fff'
              }}
              onClick={() => navigate('/physics')}
            >
              <span className="material-symbols-rounded" style={{ marginRight: 8 }}>bubble_chart</span>
              Физика частиц
            </button>
          </div>
        </div>
      )}
    </div>
  );
}