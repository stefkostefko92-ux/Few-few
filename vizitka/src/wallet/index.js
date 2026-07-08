// Публичен фасаден модул за портфейлите — какво да покаже изгледът и какво да
// задейства при промяна на визитката.
import { appleEnabled, googleEnabled } from './shared.js';
import { pushPassUpdate } from './apns.js';
import { patchGoogleObject } from './google.js';

export { appleEnabled, googleEnabled, appleApnsEnabled } from './shared.js';
export { buildPkpass } from './apple.js';
export { googleSaveUrl } from './google.js';
export { passAuthToken } from './shared.js';

// Линкове за бутоните на публичната визитка (null → бутонът не се показва).
export function walletLinks(profile) {
  const publicPath = `/p/${profile.slug}/wallet`;
  return {
    apple: appleEnabled() ? `${publicPath}/apple.pkpass` : null,
    google: googleEnabled() ? `${publicPath}/google` : null,
    any: appleEnabled() || googleEnabled(),
  };
}

// При промяна на визитката: пушни Apple обновяване + PATCH-ни Google обекта.
// Fire-and-forget — грешките не бива да чупят запазването на профила.
export function notifyWalletUpdate(profile, base) {
  if (appleEnabled()) pushPassUpdate(profile.slug).catch((e) => console.error('APNs:', e.message));
  if (googleEnabled())
    patchGoogleObject(profile, base).catch((e) => console.error('Google Wallet:', e.message));
}
