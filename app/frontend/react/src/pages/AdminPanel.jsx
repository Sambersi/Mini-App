import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel({ user }) {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="card admin-card">
        <div className="card-title">Админ-панель</div>
        <p className="text">Доступ разрешён. ID: {user?.id}</p>
      </div>

      <div className="card secondary">
        <div className="card-title">Управление</div>
        <button className="btn" style={{ marginBottom: 8 }} onClick={() => navigate('/admin/logs')}>
          Логи и активность
        </button>
        <button className="btn ghost" style={{ marginBottom: 8 }}>Список репортов</button>
        <button className="btn ghost" style={{ marginBottom: 8 }}>Бан/Разбан</button>
        <button className="btn ghost">Статистика</button>
      </div>
    </div>
  );
}