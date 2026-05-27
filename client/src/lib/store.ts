import { create } from 'zustand';
import { api, setToken, getToken } from './api';
import type { Character, Derived } from './types';

interface User {
  id: number;
  username: string;
  email: string;
}

interface State {
  user: User | null;
  token: string | null;
  character: Character | null;
  derived: Derived | null;
  loading: boolean;
  toasts: Toast[];

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;

  refreshCharacter: () => Promise<void>;
  setCharacter: (c: Character, d?: Derived | null) => void;

  toast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: number) => void;
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
  loading: false,
  toasts: [],

  async init() {
    if (!getToken()) return;
    try {
      const r = await api.get('/character/me');
      set({ character: r.character, derived: r.derived });
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
    set({ token: null, user: null, character: null, derived: null });
  },

  async refreshCharacter() {
    try {
      const r = await api.get('/character/me');
      set({ character: r.character, derived: r.derived });
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
}));
