import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Profile from './pages/Profile.jsx';
import Fortune from './pages/Fortune.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import AdminLogs from './pages/AdminLogs.jsx'; // НОВОЕ
import Donate from './pages/Donate.jsx';
import Help from './pages/Help.jsx';
import Nav from './components/Nav.jsx';
import { fetchUser, fetchAdminCheck } from './utils/api.js';

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const TG = window.Telegram?.WebApp;

export default function App() {
  const [user, setUser] = useState(null);
  const [tgUser, setTgUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (TG) {
      TG.ready();
      TG.expand();
      const u = TG.initDataUnsafe?.user || null;
      setTgUser(u);
    }
    const id = tgUser?.id || (isLocal ? '768451950' : null);
    if (!id) { setLoading(false); return; }

    Promise.all([
      fetchUser(id).catch(() => null),
      fetchAdminCheck(id).catch(() => ({ isAdmin: false })),
    ]).then(([userData, adminData]) => {
      setUser(userData);
      setIsAdmin(!!adminData?.isAdmin);
      setLoading(false);
    });
  }, [tgUser]);

  if (loading) {
    return <div className="loading">Подключение к империи...</div>;
  }

  // Кнопка-колесо видна ТОЛЬКО на вкладке «Профиль»
  const showFab = location.pathname === '/profile';

  // ID админа для эндпоинтов логов (тот же, которым бэк проверяет ADMIN_IDS)
  const adminId = String(tgUser?.id || (isLocal ? '768451950' : ''));

  return (
    <div className="app">
      {showFab && (
        <div className="fab-clip">
          <button
            className="fortune-fab"
            onClick={() => navigate('/fortune')}
            aria-label="Колесо фортуны"
          >
            <img src="/fortune/default.jpg" alt="" draggable={false} />
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Navigate to="/profile" replace />} />
        <Route path="/profile" element={<Profile user={user} tgUser={tgUser} />} />
        <Route path="/fortune" element={<Fortune user={user} tgUser={tgUser} />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/help" element={<Help />} />
        <Route
          path="/admin"
          element={isAdmin ? <AdminPanel user={user} /> : <Navigate to="/profile" replace />}
        />
        <Route
          path="/admin/logs"
          element={isAdmin ? <AdminLogs adminId={adminId} /> : <Navigate to="/profile" replace />}
        />
      </Routes>
      <Nav isAdmin={isAdmin} />
    </div>
  );
}