/**
 * Subscription / payment configuration (shared ES module).
 *
 * Imported by the service worker, popup and options page. The content scripts
 * receive these values from the service worker inside the GET_LICENSE response,
 * so they never need to import this module directly.
 *
 * Licensing model:
 *   - A new install gets a TRIAL_DAYS free trial.
 *   - After that, the bot requires an active subscription, paid via Revolut at
 *     PRICE_EUR per BILLING_PERIOD_DAYS.
 *   - The seller issues a signed license key (see tools/genkey.mjs) that
 *     encodes an expiry date; the extension verifies it offline with
 *     LICENSE_SECRET (HMAC-SHA256).
 *
 * NOTE: because the secret ships inside the extension, offline verification is
 * a deterrent, not bullet-proof DRM. For production-grade enforcement, move
 * key validation behind a server and have this client call it. See README.
 */

export const PRICE_EUR = 4;
export const BILLING_PERIOD_DAYS = 31;
export const TRIAL_DAYS = 3;

// The seller's Revolut payment link. Replace with your own revolut.me handle or
// a Revolut payment-request / checkout URL. The "amount" hint pre-fills €4.
export const REVOLUT_PAYMENT_URL = 'https://revolut.me/tanothbot/eur4';

// Shared secret used to sign/verify license keys. CHANGE THIS to your own
// random value and keep the same value in tools/genkey.mjs.
export const LICENSE_SECRET = 'TZ-7f3a9c1e5b8d246097fe1ab3cd5e7902-stealth';

export const LICENSE_PREFIX = 'TZ1';
