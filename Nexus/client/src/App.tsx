import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from './lib/store';
import { getToken } from './lib/api';
import { sfx, preloadAllSfx } from './lib/audio';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Toasts from './components/Toasts';
import CookieBanner from './components/CookieBanner';

// Eager: routes a first-time visitor (or someone deep-linking the
// auth flow) hits before they ever reach the in-app shell. Keeping
// these eager means the landing page renders without waiting for the
// in-app chunk.
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import CharacterCreate from './pages/CharacterCreate';
import NotFound from './pages/NotFound';

// Audit (frontend round #4): every page was statically imported, so
// the landing chunk shipped three.js + postprocessing + the entire
// admin tree (~600 kB after gzip). Lazy-load every in-app route so
// visitors who never reach /app don't pay for combat code at all.
const Admin = React.lazy(() => import('./pages/Admin'));
const Hero = React.lazy(() => import('./pages/Hero'));
const Realm = React.lazy(() => import('./pages/Realm'));
const Shop = React.lazy(() => import('./pages/Shop'));
const Arena = React.lazy(() => import('./pages/Arena'));
const Leaderboard = React.lazy(() => import('./pages/Leaderboard'));
const PlayerView = React.lazy(() => import('./pages/PlayerView'));
const Social = React.lazy(() => import('./pages/Social'));
const Mail = React.lazy(() => import('./pages/Mail'));
const History = React.lazy(() => import('./pages/History'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Help = React.lazy(() => import('./pages/Help'));
const Daily = React.lazy(() => import('./pages/Daily'));
const Wheel = React.lazy(() => import('./pages/Wheel'));
const Hunting = React.lazy(() => import('./pages/Hunting'));
const Dungeons = React.lazy(() => import('./pages/Dungeons'));
const Achievements = React.lazy(() => import('./pages/Achievements'));
const Bestiary = React.lazy(() => import('./pages/Bestiary'));
const Guild = React.lazy(() => import('./pages/Guild'));
const Premium = React.lazy(() => import('./pages/Premium'));
const Market = React.lazy(() => import('./pages/Market'));
const Camp = React.lazy(() => import('./pages/Camp'));
const Forge = React.lazy(() => import('./pages/Forge'));
const Tower = React.lazy(() => import('./pages/Tower'));
const Bounties = React.lazy(() => import('./pages/Bounties'));
const TrialCache = React.lazy(() => import('./pages/TrialCache'));
const BattlePass = React.lazy(() => import('./pages/BattlePass'));
const Recipes = React.lazy(() => import('./pages/Recipes'));
const Auction = React.lazy(() => import('./pages/Auction'));
const MountShop = React.lazy(() => import('./pages/MountShop'));
const RealmBoss = React.lazy(() => import('./pages/RealmBoss'));
const Factions = React.lazy(() => import('./pages/Factions'));
const Events = React.lazy(() => import('./pages/Events'));
const MythicPlus = React.lazy(() => import('./pages/MythicPlus'));
const Terms = React.lazy(() => import('./pages/Terms'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const CombatDemo = React.lazy(() => import('./pages/CombatDemo'));
// QA harness страницата (/demo/combat) е достъпна само в dev или с ?debug=1 —
// не е за реални играчи в продукция (mock данни, window.__combatDemo хук).
const demoEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
import LevelUpOverlay from './components/LevelUpOverlay';
import BanScreen from './components/BanScreen';
import CooldownTicker from './components/CooldownTicker';
import PageBackdrop from './components/PageBackdrop';
import OnboardingTour from './components/OnboardingTour';

// Quiet placeholder for React.lazy boundaries — kept deliberately
// small so it doesn't flash during the ~50 ms it takes the chunk to
// arrive on a warm CDN.
function LazyFallback(): React.ReactElement {
  return <div className="lazy-fallback" aria-hidden style={{ minHeight: 240 }} />;
}

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
  // Pre-warm SFX cache + play a click on every button press so the UI has
  // tactile audio feedback without each button needing an onClick wrapper.
  useEffect(() => {
    preloadAllSfx();
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Audit RISK #7: skip the click sfx when:
      //   1. The target lives inside a modal backdrop overlay that's
      //      handling its own dismiss (range scrubbing, textarea, etc).
      //   2. The element opts out via data-no-sfx.
      //   3. The element isn't actually interactive.
      if (t.closest('[data-no-sfx]')) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      const interactive = t.closest('button, .btn, a[href]') as HTMLElement | null;
      if (!interactive || interactive.hasAttribute('aria-disabled') || (interactive as HTMLButtonElement).disabled) return;
      // Drop sfx for buttons inside react-portal overlays that mount
      // into document.body — they fire twice (overlay click + button).
      if (interactive.closest('.levelup-overlay, .combat-result, [data-overlay-root]')) {
        if (!interactive.classList.contains('btn-primary')) return;
      }
      sfx.play('click', { volume: 0.35 });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
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
            <Suspense fallback={<LazyFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <Toasts />
      <OnboardingTour />
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
  const isPublic = path === '/' || path === '/login' || path === '/register' || path === '/terms' || path === '/privacy' || path.startsWith('/demo/');
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
        <CookieBanner />
        <BanScreen />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/create" element={<CharacterCreate />} />
          <Route path="/terms" element={<Suspense fallback={<LazyFallback />}><Terms /></Suspense>} />
          <Route path="/privacy" element={<Suspense fallback={<LazyFallback />}><Privacy /></Suspense>} />
          {demoEnabled && (
            <Route path="/demo/combat" element={<Suspense fallback={<LazyFallback />}><CombatDemo /></Suspense>} />
          )}
          <Route path="/admin/*" element={
            <AdminGate>
              <Navbar />
              <Suspense fallback={<LazyFallback />}><Admin /></Suspense>
              <Toasts />
            </AdminGate>
          } />
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
            <Route path="player/:name" element={<PlayerView />} />
            <Route path="social" element={<Social />} />
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
            <Route path="realm-boss" element={<RealmBoss />} />
            <Route path="factions" element={<Factions />} />
            <Route path="events" element={<Events />} />
            <Route path="mythic-plus" element={<MythicPlus />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Bootstrapper>
    </BrowserRouter>
  );
}
