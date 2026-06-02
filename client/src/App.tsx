import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from './lib/store';
import { getToken } from './lib/api';
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
import History from './pages/History';
import Settings from './pages/Settings';
import Help from './pages/Help';
import NotFound from './pages/NotFound';
import Landing from './pages/Landing';
import Daily from './pages/Daily';
import Wheel from './pages/Wheel';
import Hunting from './pages/Hunting';
import Dungeons from './pages/Dungeons';
import Achievements from './pages/Achievements';
import Bestiary from './pages/Bestiary';
import Stats from './pages/Stats';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import Guild from './pages/Guild';
import Premium from './pages/Premium';
import Market from './pages/Market';
import Camp from './pages/Camp';
import Forge from './pages/Forge';
import Tower from './pages/Tower';
import Bounties from './pages/Bounties';
import TrialCache from './pages/TrialCache';
import BattlePass from './pages/BattlePass';
import Recipes from './pages/Recipes';
import Auction from './pages/Auction';
import MountShop from './pages/MountShop';
import Hero from './pages/Hero';
import Realm from './pages/Realm';
import LevelUpOverlay from './components/LevelUpOverlay';
import CooldownTicker from './components/CooldownTicker';
import PageBackdrop from './components/PageBackdrop';

function AppLayout(): React.ReactElement {
  const location = useLocation();
  const levelUp = useStore((s) => s.levelUp);
  const dismissLevelUp = useStore((s) => s.dismissLevelUp);
  // Jump to the top of the page whenever the route changes (sidebar/navbar nav).
  // Also close the mobile drawer so the new page is visible immediately.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.body.classList.remove('mobile-open');
  }, [location.pathname]);
  return (
    <div className="app">
      {/* Per-route animated ambient backdrop, fixed-position behind shell. */}
      <PageBackdrop />
      <Navbar />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          {/* Live cooldown ticker — shows every action that's still
              counting down. Visible on every in-app page. */}
          <CooldownTicker />
          <div className="page-transition" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
      {levelUp && (
        <LevelUpOverlay
          level={levelUp.toLevel}
          statPoints={levelUp.statPointsGained}
          skillPoints={levelUp.skillPointsGained}
          onDone={dismissLevelUp}
        />
      )}
    </div>
  );
}

function AdminGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const user = useStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/app" replace />;
  return <>{children}</>;
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
          <h1 style={{ marginTop: 12, color: 'var(--gold-1)' }}>Awakening Nexus Dominion…</h1>
        </div>
      </div>
    );
  }

  const authed = !!token;
  const path = location.pathname;
  const isPublic = path === '/' || path === '/login' || path === '/register';
  const isCreateRoute = path === '/create';
  const isAdminRoute = path.startsWith('/admin');

  // Not signed in: allow public + landing
  if (!authed && !isPublic) return <Navigate to="/" replace />;
  // Signed in but on a marketing/auth route: redirect into the app
  if (authed && (path === '/login' || path === '/register' || path === '/')) {
    return <Navigate to={character ? '/app' : '/create'} replace />;
  }
  // Admin route doesn't require a character
  if (authed && !character && !isCreateRoute && !isAdminRoute) return <Navigate to="/create" replace />;
  if (authed && character && isCreateRoute) return <Navigate to="/app" replace />;

  return <>{children}</>;
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Bootstrapper>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/create" element={<CharacterCreate />} />
          <Route path="/admin/*" element={<AdminGate><Navbar /><Admin /><Toasts /></AdminGate>} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Hero />} />
            <Route path="profile" element={<Hero />} />
            <Route path="character" element={<Hero />} />
            <Route path="inventory" element={<Hero />} />
            <Route path="stats" element={<Hero />} />
            <Route path="shop" element={<Shop />} />
            <Route path="quests" element={<Realm />} />
            <Route path="arena" element={<Arena />} />
            <Route path="world" element={<Realm />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="mail" element={<Mail />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="daily" element={<Daily />} />
            <Route path="wheel" element={<Wheel />} />
            <Route path="hunting" element={<Hunting />} />
            <Route path="dungeons" element={<Dungeons />} />
            <Route path="achievements" element={<Achievements />} />
            <Route path="bestiary" element={<Bestiary />} />
            <Route path="guild" element={<Guild />} />
            <Route path="premium" element={<Premium />} />
            <Route path="market" element={<Market />} />
            <Route path="camp" element={<Camp />} />
            <Route path="forge" element={<Forge />} />
            <Route path="tower" element={<Tower />} />
            <Route path="bounties" element={<Bounties />} />
            <Route path="trial-cache" element={<TrialCache />} />
            <Route path="battlepass" element={<BattlePass />} />
            <Route path="recipes" element={<Recipes />} />
            <Route path="auction" element={<Auction />} />
            <Route path="stables" element={<MountShop />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Bootstrapper>
    </BrowserRouter>
  );
}
