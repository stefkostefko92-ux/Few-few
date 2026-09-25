// Публичен фасаден модул за портфейлите — какво да покаже изгледът и какво да
// задейства при промяна на визитката.
import { appleEnabled, googleEnabled } from './shared.js';
import { pushPassUpdate } from './apns.js';
import { patchGoogleObject } from './google.js';

export { appleEnabled, googleEnabled, appleApnsEnabled } from './shared.js';
export { buildPkpass, getPkpass } from './apple.js';
export { googleSaveUrl } from './google.js';
export { passAuthToken } from './shared.js';

// Google издава карти на ВСИЧКИ едва след одобрение („publishing access“). Дотогава
// (демо режим) запазването работи само за акаунти с роля в конзолата — обикновен
// посетител би получил грешка. Затова бутонът е за всички чак с този флаг, а преди
// това — само за собственика и админа (за тест).
const googlePublished = () => process.env.GOOGLE_WALLET_PUBLISHED === '1';

// Линкове за бутоните на публичната визитка (null → бутонът не се показва).
// Когато нито един портфейл не е конфигуриран, показваме „Скоро" тийзър (неактивен).
export function walletLinks(profile, { preview = false } = {}) {
  const publicPath = `/p/${profile.slug}/wallet`;
  const apple = appleEnabled();
  const google = googleEnabled() && (googlePublished() || preview);
  return {
    apple: apple ? `${publicPath}/apple.pkpass` : null,
    google: google ? `${publicPath}/google` : null,
    any: apple || google,
    comingSoon: !apple && !google, // функцията идва скоро — тийзър без действие
  };
}

// При промяна на визитката: пушни Apple обновяване + PATCH-ни Google обекта.
// Fire-and-forget — грешките не бива да чупят запазването на профила.
export function notifyWalletUpdate(profile, base) {
  if (appleEnabled()) pushPassUpdate(profile.id).catch((e) => console.error('APNs:', e.message));
  if (googleEnabled())
    patchGoogleObject(profile, base).catch((e) => console.error('Google Wallet:', e.message));
}
