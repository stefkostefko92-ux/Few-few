// Настройки в chrome.storage.local — единствен източник на истината.

const DEFAULTS = {
  paused: false,
  // Собствено огледало на модела (enterprise/офлайн). Празно = huggingface.co.
  modelHost: '',
  // Поверителност по подразбиране: поща, чатове, вход/плащане никога не се индексират.
  // Съвпадение по подниз в целия URL — умишлено агресивно (по-добре пропусната
  // страница, отколкото индексирана чувствителна).
  denylist: [
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
  ],
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

export function isDenied(url, denylist) {
  const u = url.toLowerCase();
  return denylist.some((pattern) => u.includes(pattern));
}
