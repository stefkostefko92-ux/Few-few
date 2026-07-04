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

export const PRICE_EUR = 4;             // monthly subscription
export const LIFETIME_PRICE_EUR = 20;   // one-off lifetime licence
export const BILLING_PERIOD_DAYS = 31;
export const TRIAL_DAYS = 3;

// Keys whose remaining validity exceeds this are treated/shown as "lifetime".
export const LIFETIME_THRESHOLD_DAYS = 365 * 50;

// The seller's Revolut payment link (the buyer enters the amount: €4 or €20).
export const REVOLUT_PAYMENT_URL = 'https://revolut.me/vycanismajoris';

// Optional license server for true one-computer enforcement. Empty = offline
// device binding only (see server/license-server.mjs and README). When set,
// also add this origin to the manifest's host_permissions.
export const LICENSE_SERVER_URL = '';

// Shared secret used to sign/verify license keys. CHANGE THIS to your own
// random value and keep the same value in tools/genkey.mjs.
export const LICENSE_SECRET = 'TZ-b0d6632a1a185b2714f94eee965390232c763380df811d59-stealth';

export const LICENSE_PREFIX = 'TZ1';

// Merchant identity + legal document URLs shown in the purchase UI (EU
// pre-contractual info / impressum). Point these at your hosted policy pages.
export const MERCHANT_NAME = 'Carbon Stealth VCC';
export const TERMS_URL = 'https://carbonstealth.eu/tanoth/terms';
export const PRIVACY_URL = 'https://carbonstealth.eu/tanoth/privacy';
export const REFUND_URL = 'https://carbonstealth.eu/tanoth/refunds';
