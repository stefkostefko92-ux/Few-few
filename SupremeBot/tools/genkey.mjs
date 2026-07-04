#!/usr/bin/env node
/**
 * License key generator for Tanoth Master Bot.
 *
 * Usage:   node tools/genkey.mjs [days]
 * Examples:
 *   node tools/genkey.mjs 31        # one-month key  (€4)
 *   node tools/genkey.mjs 365000    # lifetime key   (€20)
 *
 * The key encodes only an expiry timestamp and is signed with LICENSE_SECRET so
 * the extension can verify it offline. KEEP LICENSE_SECRET PRIVATE and identical
 * to src/shared/payment.js. A lifetime key is locked to the first computer it is
 * activated on (device binding happens client-side on activation).
 *
 * NOTE: offline verification is a deterrent, not unbreakable DRM (the secret
 * ships in the extension). For strong enforcement, validate keys server-side.
 */
import crypto from 'node:crypto';

// Must match src/shared/payment.js
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'TZ-b0d6632a1a185b2714f94eee965390232c763380df811d59-stealth';
const LICENSE_PREFIX = 'TZ1';

const arg = process.argv[2] || '31';
const days = arg === 'lifetime' ? 365000 : Number(arg);
if (!Number.isFinite(days) || days <= 0) {
  console.error('Usage: node tools/genkey.mjs [days>0 | lifetime]');
  process.exit(1);
}

const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
const payloadB64 = Buffer.from(JSON.stringify({ exp })).toString('base64url');
const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('base64url').slice(0, 24);
const key = `${LICENSE_PREFIX}.${payloadB64}.${sig}`;

console.log('License key (valid %d days, until %s):', days, new Date(exp * 1000).toISOString());
console.log(key);
