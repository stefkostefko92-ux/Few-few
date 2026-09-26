import { create } from 'zustand';
import { api, setToken, getToken, setBannedHandler, setUnauthorizedHandler } from './api';
import type { Character, Derived } from './types';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: number;
}

/** Per-action next-available timestamps in ms (epoch). 0 / missing = ready. */
export type Cooldowns = Partial<Record<'hunt' | 'camp' | 'tower' | 'dungeon' | 'quest' | 'arena', number>>;

interface State {
  user: User | null;
  token: string | null;
  character: Character | null;
  derived: Derived | null;
  cooldowns: Cooldowns;
  unreadMail: number;
  loading: boolean;
  toasts: Toast[];
  /** Ако е зададено, сървърът е спрял достъпа. `until` 0 = постоянен. */
  banned: { reason: string; until: number } | null;
  /** Причина за неуспешен boot — 'rate_limited' (429, знаем колко да чакаме)
      срещу общо 'offline' (5xx/мрежа/рестарт) за различен, честен текст. */
  bootError: { kind: 'rate_limited' | 'offline'; retryAfterMs?: number } | null;

  /** false = временна грешка (429/5xx/мрежа) — героят не е потвърден нито отречен. */
  init: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, dateOfBirth: string, country: string) => Promise<void>;
  logout: () => void;

  refreshCharacter: () => Promise<void>;
  refreshMail: () => Promise<void>;
  setCharacter: (c: Character, d?: Derived | null) => void;

  toast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: number) => void;
  showUnlocks: (unlocks: any[] | undefined | null) => void;
  showLevelUp: (info: { fromLevel: number; toLevel: number; statPointsGained: number; skillPointsGained: number } | null | undefined) => void;
  dismissLevelUp: () => void;

  levelUp: { fromLevel: number; toLevel: number; statPointsGained: number; skillPointsGained: number } | null;
}

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

let toastId = 0;

// Регистрира глобалния бан хендлър в api-слоя веднъж при създаване на
// store-а: всяка 403 { error:'banned' } заявка вдига `banned` състоянието,
// което App рендира като пълноекранен ban screen. Връща началната стойност.
function registerBanHandler(set: (partial: Partial<State>) => void): null {
  setBannedHandler((reason: string, until: number) => set({ banned: { reason, until } }));
  // Изтекла сесия → изчисти и прати към login (веднъж, ако сме автентикирани).
  setUnauthorizedHandler(() => {
    setToken(null);
    set({ token: null, user: null, character: null, derived: null, cooldowns: {}, unreadMail: 0 });
    if (typeof window !== 'undefined' && !/\/(login|register|)$/.test(window.location.pathname)) {
      window.location.href = '/login';
    }
  });
  return null;
}

export const useStore = create<State>((set, get) => ({
  user: null,
  token: getToken(),
  character: null,
  derived: null,
  cooldowns: {},
  unreadMail: 0,
  loading: false,
  toasts: [],
  levelUp: null,
  banned: registerBanHandler(set),
  bootError: null,

  async init() {
    if (!getToken()) return true;
    set({ bootError: null });
    // Токенът се чисти САМО при 401 (глобалният unauthorizedHandler в api.ts).
    // 404 = акаунт без герой (нов играч / админ) — остава логнат; 429/5xx или
    // мрежова грешка при рестарт на сървъра не бива да изхвърля играча.
    const [acc, chr] = await Promise.allSettled([api.get('/account/me'), api.get('/character/me')]);
    if (acc.status === 'fulfilled') set({ user: acc.value.user });
    if (chr.status === 'fulfilled') {
      set({ character: chr.value.character, derived: chr.value.derived, cooldowns: chr.value.cooldowns || {} });
      try {
        const m = await api.get('/mail');
        set({ unreadMail: m.unread ?? 0 });
      } catch { /* ignore */ }
      return true;
    }
    const status = (chr.reason as { status?: number })?.status;
    if (status === 404 || status === 401) {
      set({ character: null });
      return true;
    }
    // 429 → честно "твърде много заявки" с автоматичен повторен опит по
    // Retry-After/RateLimit-Reset, вместо генеричното "кралството не отговаря"
    // (същата грешка за рестарт на сървъра ≠ клиентът е засипал API-то).
    if (status === 429) {
      const retryAfterMs = (chr.reason as { retryAfterMs?: number })?.retryAfterMs;
      set({ bootError: { kind: 'rate_limited', retryAfterMs } });
      return false;
    }
    set({ bootError: { kind: 'offline' } });
    return false;
  },

  async login(username, password) {
    set({ loading: true });
    try {
      const r = await api.post('/auth/login', { username, password });
      setToken(r.token);
      set({ token: r.token, user: r.user });
      try {
        const c = await api.get('/character/me');
        set({ character: c.character, derived: c.derived });
        try {
          const m = await api.get('/mail');
          set({ unreadMail: m.unread ?? 0 });
        } catch { /* ignore */ }
      } catch {
        set({ character: null });
      }
    } finally {
      set({ loading: false });
    }
  },

  async register(username, email, password, dateOfBirth, country) {
    set({ loading: true });
    try {
      const r = await api.post('/auth/register', { username, email, password, dateOfBirth, country });
      setToken(r.token);
      set({ token: r.token, user: r.user, character: null });
    } finally {
      set({ loading: false });
    }
  },

  logout() {
    setToken(null);
    set({ token: null, user: null, character: null, derived: null, cooldowns: {}, unreadMail: 0 });
  },

  async refreshCharacter() {
    try {
      const r = await api.get('/character/me');
      set({ character: r.character, derived: r.derived, cooldowns: r.cooldowns || {} });
    } catch {
      /* ignore */
    }
  },

  async refreshMail() {
    try {
      const m = await api.get('/mail');
      set({ unreadMail: m.unread ?? 0 });
    } catch {
      /* ignore */
    }
  },

  setCharacter(c, d) {
    set({ character: c, derived: d ?? get().derived });
  },

  toast(message, type = 'info') {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3800);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  showUnlocks(unlocks) {
    if (!unlocks || unlocks.length === 0) return;
    for (const u of unlocks) {
      const msg = `${u.icon || '🏆'}  ${u.name} — ${u.description}`;
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, message: msg, type: 'success' as const }] }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 6000);
    }
  },

  showLevelUp(info) {
    if (!info) return;
    set({ levelUp: info });
  },

  dismissLevelUp() {
    set({ levelUp: null });
  },
}));
