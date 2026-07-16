// Настройки в chrome.storage.local — единствен източник на истината.

// Поверителност по подразбиране: поща, чатове, вход/плащане никога не се
// индексират. Съвпадение по подниз в целия URL — умишлено агресивно
// (по-добре пропусната страница, отколкото индексирана чувствителна).
// Вграденият списък НЕ се записва в storage — винаги важи, потребителят
// само добавя свои шаблони отгоре (userDenylist).
export const BUILTIN_DENYLIST = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'mail.yahoo.com',
  'web.whatsapp.com',
  'web.telegram.org',
  'messenger.com',
  'discord.com/channels',
  'accounts.google.com',
  'login',
  'signin',
  'sign-in',
  'auth',
  'password',
  'checkout',
  'payment',
  'banking',
  'ebank',
  'mybank',
];

const DEFAULTS = {
  paused: false,
  // Потребителски шаблони за изключване (добавят се към вградените).
  userDenylist: [],
  // Авто-изтриване на страници по-стари от N месеца. 0 = пази завинаги.
  retentionMonths: 0,
  // Собствено огледало на модела (enterprise/офлайн). Празно = huggingface.co.
  modelHost: '',
};

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function patchSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function isDenied(url, userDenylist = []) {
  const u = url.toLowerCase();
  return [...BUILTIN_DENYLIST, ...userDenylist].some(
    (pattern) => pattern && u.includes(pattern.toLowerCase()),
  );
}
