#!/usr/bin/env node
/**
 * License key generator for Tanoth Master Bot.
 *
 * Usage:   node tools/genkey.mjs [days]
 * Example: node tools/genkey.mjs 31      # a one-month key
 *
 * Issue one key per paid month (€4 via Revolut). The key encodes only an expiry
 * timestamp and is signed with LICENSE_SECRET so the extension can verify it
 * offline. KEEP LICENSE_SECRET PRIVATE and identical to src/shared/payment.js.
 *
 * NOTE: offline verification is a deterrent, not unbreakable DRM (the secret
 * ships in the extension). For strong enforcement, validate keys server-side.
 */
import crypto from 'node:crypto';

// Must match src/shared/payment.js
const LICENSE_SECRET = 'TZ-7f3a9c1e5b8d246097fe1ab3cd5e7902-stealth';
const LICENSE_PREFIX = 'TZ1';

const days = Number(process.argv[2] || 31);
if (!Number.isFinite(days) || days <= 0) {
  console.error('Usage: node tools/genkey.mjs [days>0]');
  process.exit(1);
}

const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
const payloadB64 = Buffer.from(JSON.stringify({ exp })).toString('base64url');
const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('base64url').slice(0, 24);
const key = `${LICENSE_PREFIX}.${payloadB64}.${sig}`;

console.log('License key (valid %d days, until %s):', days, new Date(exp * 1000).toISOString());
console.log(key);
