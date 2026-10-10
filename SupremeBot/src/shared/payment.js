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
 *     encodes an expiry date. Keys are signed with ECDSA P-256 using a PRIVATE
 *     key that only the seller holds (never in this repo). The extension and
 *     the licence server carry only the PUBLIC key below, so they can verify a
 *     key but nobody can mint one from the extension's code.
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

// PUBLIC verification key (ECDSA P-256, SPKI DER, base64url). Public by design:
// it can only CHECK a signature. The matching private key signs keys with
// tools/genkey.mjs and must stay off the repo. Rotate both together with
// `node tools/genkey.mjs --new-keypair <dir outside the repo>`.
export const LICENSE_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsoxllU7kFnMtCT_g1-6fmCcN2lPiQxJp9OaTvYmVy2VChIrdwwphkkfE1nedXHL3CaLZ4JFypbAo7tjJzU7rnQ';

export const LICENSE_PREFIX = 'TZ2';

// Merchant identity + legal document URLs shown in the purchase UI (EU
// pre-contractual info / impressum). Point these at your hosted policy pages.
export const MERCHANT_NAME = 'Carbon Stealth VCC';
export const TERMS_URL = 'https://carbonstealth.eu/tanoth/terms';
export const PRIVACY_URL = 'https://carbonstealth.eu/tanoth/privacy';
export const REFUND_URL = 'https://carbonstealth.eu/tanoth/refunds';
