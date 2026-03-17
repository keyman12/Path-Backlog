import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useAuth } from '../App';
import { api } from '../api';
import HomeFilters from './HomeFilters';
import './Layout.css';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { data } = useQuery('projects', api.projects.list, { staleTime: 60 * 1000 });
  const projects = data?.projects || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <header className="layout-header">
        <button
          type="button"
          className="layout-menu-btn layout-menu-btn-mobile"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Open menu"
        >
          <span className="layout-menu-icon">≡</span>
        </button>
        <div className="layout-header-spacer" />
        {isHome && (
          <div className="layout-header-filters">
            <HomeFilters />
          </div>
        )}
        <div className="layout-header-user">
          <span className="layout-user-name">{user?.display_name || user?.username}</span>
          <span className="layout-user-role">({user?.role})</span>
          <button type="button" className="layout-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <aside className={`layout-sidebar ${sidebarOpen ? 'layout-sidebar-open' : ''}`}>
        <div className="layout-sidebar-brand">
          <img src="/path-logo.png" alt="Path" className="layout-sidebar-logo-img" />
        </div>
        <nav className="layout-nav">
          <NavLink to="/" className={({ isActive }) => 'layout-nav-item' + (isActive ? ' layout-nav-item-active' : '')} end>
            Home
          </NavLink>
          {projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/project/${p.id}`}
              className={({ isActive }) => 'layout-nav-item' + (isActive ? ' layout-nav-item-active' : '')}
            >
              {p.name}
            </NavLink>
          ))}
          <NavLink to="/reports" className={({ isActive }) => 'layout-nav-item' + (isActive ? ' layout-nav-item-active' : '')}>
            Reports
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => 'layout-nav-item' + (isActive ? ' layout-nav-item-active' : '')}>
            Settings
          </NavLink>
        </nav>
        <div className="layout-sidebar-collapse" onClick={() => setSidebarOpen(false)}>
          {sidebarOpen ? 'Close' : ''}
        </div>
      </aside>
      {sidebarOpen && (
        <div className="layout-overlay" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
