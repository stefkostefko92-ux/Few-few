import { create } from 'zustand';
import { api, setToken, getToken } from './api';
import type { Character, Derived } from './types';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: number;
}

interface State {
  user: User | null;
  token: string | null;
  character: Character | null;
  derived: Derived | null;
  unreadMail: number;
  loading: boolean;
  toasts: Toast[];

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;

  refreshCharacter: () => Promise<void>;
  refreshMail: () => Promise<void>;
  setCharacter: (c: Character, d?: Derived | null) => void;

  toast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: number) => void;
  showUnlocks: (unlocks: any[] | undefined | null) => void;
}

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  user: null,
  token: getToken(),
  character: null,
  derived: null,
  unreadMail: 0,
  loading: false,
  toasts: [],

  async init() {
    if (!getToken()) return;
    try {
      const r = await api.get('/character/me');
      set({ character: r.character, derived: r.derived });
      try {
        const m = await api.get('/mail');
        set({ unreadMail: m.unread ?? 0 });
      } catch { /* ignore */ }
      try {
        const u = await api.get('/account/me');
        set({ user: u.user });
      } catch { /* ignore */ }
    } catch {
      setToken(null);
      set({ token: null, character: null });
    }
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

  async register(username, email, password) {
    set({ loading: true });
    try {
      const r = await api.post('/auth/register', { username, email, password });
      setToken(r.token);
      set({ token: r.token, user: r.user, character: null });
    } finally {
      set({ loading: false });
    }
  },

  logout() {
    setToken(null);
    set({ token: null, user: null, character: null, derived: null, unreadMail: 0 });
  },

  async refreshCharacter() {
    try {
      const r = await api.get('/character/me');
      set({ character: r.character, derived: r.derived });
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
}));
