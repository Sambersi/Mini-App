import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Nav({ isAdmin }) {
  return (
    <div className="nav">
      <div className="nav-inner">
        <NavLink to="/donate" className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}>
          <span className="material-symbols-rounded">volunteer_activism</span>
          <span className="nav-label">Донат</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}>
          <span className="material-symbols-rounded">person</span>
          <span className="nav-label">Профиль</span>
        </NavLink>
        <NavLink to="/help" className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}>
          <span className="material-symbols-rounded">help</span>
          <span className="nav-label">Помощь</span>
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}>
            <span className="material-symbols-rounded">admin_panel_settings</span>
            <span className="nav-label">Админ</span>
          </NavLink>
        )}
      </div>
    </div>
  );
}