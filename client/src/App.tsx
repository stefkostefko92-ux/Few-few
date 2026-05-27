import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from './lib/store';
import { api, getToken } from './lib/api';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Toasts from './components/Toasts';

import Login from './pages/Login';
import Register from './pages/Register';
import CharacterCreate from './pages/CharacterCreate';
import Dashboard from './pages/Dashboard';
import CharacterPage from './pages/CharacterPage';
import Inventory from './pages/Inventory';
import Shop from './pages/Shop';
import Quests from './pages/Quests';
import Arena from './pages/Arena';
import World from './pages/World';
import Leaderboard from './pages/Leaderboard';
import Mail from './pages/Mail';

function AppLayout(): React.ReactElement {
  return (
    <div className="app">
      <Navbar />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function Bootstrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const init = useStore((s) => s.init);
  const token = useStore((s) => s.token);
  const character = useStore((s) => s.character);
  const [ready, setReady] = useState(!getToken());
  const location = useLocation();

  useEffect(() => {
    (async () => {
      if (getToken()) {
        await init();
      }
      setReady(true);
    })();
  }, [init]);

  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-brand-mark">
            <svg viewBox="0 0 32 32"><path d="M16 4 L20 12 L28 13 L22 19 L24 28 L16 23 L8 28 L10 19 L4 13 L12 12 Z" fill="#d6a13d" /></svg>
          </div>
          <h1 style={{ marginTop: 12, color: 'var(--gold-1)' }}>Awakening Tanoth…</h1>
        </div>
      </div>
    );
  }

  // Gate to /login if no token, but allow /login and /register
  const authed = !!token;
  const path = location.pathname;
  const isAuthRoute = path === '/login' || path === '/register';
  const isCreateRoute = path === '/create';

  if (!authed && !isAuthRoute) return <Navigate to="/login" replace />;
  if (authed && isAuthRoute) return <Navigate to={character ? '/app' : '/create'} replace />;
  if (authed && !character && !isCreateRoute) return <Navigate to="/create" replace />;
  if (authed && character && isCreateRoute) return <Navigate to="/app" replace />;

  return <>{children}</>;
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Bootstrapper>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/create" element={<CharacterCreate />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="character" element={<CharacterPage />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="shop" element={<Shop />} />
            <Route path="quests" element={<Quests />} />
            <Route path="arena" element={<Arena />} />
            <Route path="world" element={<World />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="mail" element={<Mail />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Bootstrapper>
    </BrowserRouter>
  );
}
