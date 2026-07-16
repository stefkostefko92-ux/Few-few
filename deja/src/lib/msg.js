// Единственият четец на message-плика {ok, result, error} — протоколът на
// background.js живее само тук (и в самия background).

import { t } from './i18n.js';

export async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || t('errNoResponse'));
  return res.result;
}
