import { Preferences } from '@capacitor/preferences';
import { z } from 'zod';
import { LANGS, setLang, type Lang } from '../i18n/index.ts';
import { TOTAL_CHAPTERS } from '../config/chapters.ts';

// Прогресът се пази нативно през @capacitor/preferences (Android
// SharedPreferences), не през браузърен localStorage. На уеб платформата
// плъгинът автоматично ползва localStorage като резервен вариант за dev.

const STORAGE_KEY = 'opalchentsi.progress.v1';

const ProgressSchema = z.object({
  lang: z.enum(['bg', 'en']),
  // Най-високата отключена глава (1..N). 1 е винаги достъпна.
  highestUnlocked: z.number().int().min(1).max(TOTAL_CHAPTERS),
  // Идентификаторите на завършените глави.
  completed: z.array(z.number().int().positive()),
});

export type Progress = z.infer<typeof ProgressSchema>;

function defaultProgress(): Progress {
  return { lang: 'bg', highestUnlocked: 1, completed: [] };
}

let state: Progress = defaultProgress();
let loaded = false;

/** Зарежда прогреса от нативното хранилище. Извиква се веднъж при boot. */
export async function loadProgress(): Promise<Progress> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) {
      const parsed = ProgressSchema.safeParse(JSON.parse(value));
      if (parsed.success) {
        state = parsed.data;
      } else {
        state = defaultProgress();
      }
    } else {
      state = defaultProgress();
    }
  } catch {
    state = defaultProgress();
  }
  loaded = true;
  setLang(state.lang);
  return state;
}

async function persist(): Promise<void> {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(state) });
  } catch {
    // Тихо: дори да не успеем да запишем, играта продължава в текущата сесия.
  }
}

export function getProgress(): Progress {
  return state;
}

export function isLoaded(): boolean {
  return loaded;
}

export function isUnlocked(chapterId: number): boolean {
  return chapterId <= state.highestUnlocked;
}

export function isCompleted(chapterId: number): boolean {
  return state.completed.includes(chapterId);
}

export function hasAnyProgress(): boolean {
  return state.completed.length > 0 || state.highestUnlocked > 1;
}

/** Бележи глава като завършена и отключва следващата. */
export async function completeChapter(chapterId: number): Promise<void> {
  if (!state.completed.includes(chapterId)) {
    state.completed = [...state.completed, chapterId].sort((a, b) => a - b);
  }
  const next = chapterId + 1;
  if (next <= TOTAL_CHAPTERS && next > state.highestUnlocked) {
    state.highestUnlocked = next;
  }
  await persist();
}

export async function setLanguage(lang: Lang): Promise<void> {
  if (!LANGS.includes(lang)) return;
  state.lang = lang;
  setLang(lang);
  await persist();
}

export async function resetProgress(): Promise<void> {
  const lang = state.lang; // запазваме избрания език
  state = { ...defaultProgress(), lang };
  await persist();
}
