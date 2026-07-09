// Обща конфигурация за портфейлите (Apple Wallet + Google Wallet).
// Функциите се активират само когато нужните сертификати/ключове са зададени —
// иначе бутоните са скрити и маршрутите връщат 404 (като IndexNow/печатния handoff).
import crypto from 'node:crypto';
import fs from 'node:fs';

// Резервен цвят на картата по темата, когато няма собствен accent.
const THEME_HEX = {
  blue: '#4f46e5',
  emerald: '#059669',
  sunset: '#f97316',
  ocean: '#0891b2',
  graphite: '#374151',
  rose: '#9f1239',
};

export function cardBgHex(profile) {
  return profile.accent || THEME_HEX[profile.theme] || THEME_HEX.blue;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbCss = (hex) => `rgb(${hexToRgb(hex).join(', ')})`;

// Тайна за authenticationToken на .pkpass (Apple update web service). В продукция
// PRINT_API_SECRET е задължителна така или иначе; позволяваме и отделна тайна.
export function walletSecret() {
  const s = process.env.WALLET_AUTH_SECRET || process.env.PRINT_API_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production')
    throw new Error('WALLET_AUTH_SECRET/PRINT_API_SECRET е задължителна за портфейл токените.');
  return 'dev-wallet-secret';
}

// Токен за конкретна визитка (в Authorization: ApplePass <token>).
export function passAuthToken(serial) {
  return crypto.createHmac('sha256', walletSecret()).update(`apple:${serial}`).digest('hex');
}

// --- Apple активиран? (всички сертификатни пътища налични) ----------------------
export function appleEnabled() {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_ID &&
    fileEnv('APPLE_PASS_CERT') &&
    fileEnv('APPLE_PASS_KEY') &&
    fileEnv('APPLE_WWDR_CERT')
  );
}

// Apple auto-update пуш (APNs) активиран? (изисква и pkpass, и APNs ключ)
export function appleApnsEnabled() {
  return Boolean(appleEnabled() && fileEnv('APPLE_APNS_KEY') && process.env.APPLE_APNS_KEY_ID);
}

// --- Google активиран? (издател + service account ключ) -------------------------
let googleSaCache = null;
export function googleServiceAccount() {
  if (googleSaCache) return googleSaCache;
  const path = process.env.GOOGLE_WALLET_SA_KEY;
  if (!path || !fs.existsSync(path)) return null;
  const sa = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!sa.client_email || !sa.private_key) return null;
  googleSaCache = sa;
  return sa;
}

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_WALLET_ISSUER_ID && googleServiceAccount());
}

export function googleIssuerId() {
  return process.env.GOOGLE_WALLET_ISSUER_ID || '';
}

export function googleClassId() {
  return process.env.GOOGLE_WALLET_CLASS_ID || `${googleIssuerId()}.vizitka_generic`;
}

function fileEnv(name) {
  const p = process.env[name];
  return p && fs.existsSync(p) ? p : '';
}
