import * as Network from 'expo-network';
import { create } from 'zustand';

import { SubmitError, submitReport } from '@/api/reports';
import { loadQueue, persistMedia, removeMedia, saveQueue } from '@/queue/storage';
import type { QueuedReport, ReportDraft, SubmitResult } from '@/types';

/** Таван на опитите за един сигнал преди изоставяне (трайни мрежови провали). */
const MAX_ATTEMPTS = 6;

/** Сигнали, които точно сега се изпращат — пази от двойно подаване (review + processAll). */
const sendingIds = new Set<string>();

type QueueState = {
  items: QueuedReport[];
  hydrated: boolean;
  processing: boolean;
  hydrate: () => Promise<void>;
  /** Записва черновата в опашката (с постоянни медийни файлове). */
  enqueueFromDraft: (draft: ReportDraft) => Promise<string>;
  /** Опитва еднократно да изпрати конкретен сигнал. Връща кода при успех. */
  trySend: (id: string) => Promise<SubmitResult | null>;
  /** Минава през всички чакащи и опитва да ги изпрати, ако има мрежа. */
  processAll: () => Promise<void>;
};

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  hydrated: false,
  processing: false,

  hydrate: async () => {
    const items = await loadQueue();
    set({ items, hydrated: true });
  },

  enqueueFromDraft: async (draft) => {
    if (!draft.categorySlug || !draft.settlementSlug) {
      throw new Error('Непълна чернова: липсва категория или населено място.');
    }
    const id = genId();
    const media = await Promise.all(
      draft.media.map((asset, index) => persistMedia(id, asset, index)),
    );
    const report: QueuedReport = {
      id,
      createdAt: Date.now(),
      categorySlug: draft.categorySlug,
      settlementSlug: draft.settlementSlug,
      media,
      location: draft.location,
      description: draft.description,
      reporterName: draft.reporterName,
      reporterPhone: draft.reporterPhone,
      attempts: 0,
    };
    const items = [...get().items, report];
    await saveQueue(items);
    set({ items });
    return id;
  },

  trySend: async (id) => {
    const report = get().items.find((r) => r.id === id);
    if (!report) {
      return null;
    }
    // In-flight guard: не подавай същия сигнал два пъти едновременно.
    if (sendingIds.has(id)) {
      return null;
    }
    sendingIds.add(id);
    try {
      if (!(await isOnline())) {
        return null;
      }
      const result = await submitReport(report);
      await removeMedia(report);
      const items = get().items.filter((r) => r.id !== id);
      await saveQueue(items);
      set({ items });
      return result;
    } catch (error) {
      const permanent = error instanceof SubmitError && error.permanent;
      const attempts = report.attempts + 1;
      // Постоянен отказ или изчерпани опити → маха се, за да не виси вечно.
      if (permanent || attempts >= MAX_ATTEMPTS) {
        await removeMedia(report).catch(() => undefined);
        const items = get().items.filter((r) => r.id !== id);
        await saveQueue(items);
        set({ items });
      } else {
        const items = get().items.map((r) => (r.id === id ? { ...r, attempts } : r));
        await saveQueue(items);
        set({ items });
      }
      return null;
    } finally {
      sendingIds.delete(id);
    }
  },

  processAll: async () => {
    if (get().processing) {
      return;
    }
    if (get().items.length === 0 || !(await isOnline())) {
      return;
    }
    set({ processing: true });
    try {
      const pending = [...get().items];
      for (const report of pending) {
        await get().trySend(report.id);
      }
    } finally {
      set({ processing: false });
    }
  },
}));
