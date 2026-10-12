#!/usr/bin/env node
/**
 * License key generator for Tanoth Master Bot (ECDSA P-256).
 *
 * Keys are signed with a PRIVATE key that only the seller holds. The extension
 * and the licence server carry only the matching PUBLIC key
 * (LICENSE_PUBLIC_KEY in src/shared/payment.js), so nobody can mint a key from
 * the extension's code.
 *
 *   # one time: create a key pair OUTSIDE the repo
 *   node tools/genkey.mjs --new-keypair ~/.tanoth-license
 *   #   -> writes tanoth-license-private.pem (mode 600) and prints the public key
 *   #      to paste into LICENSE_PUBLIC_KEY (src/shared/payment.js) and the server
 *
 *   # issue keys (the private key comes from a file or the environment)
 *   LICENSE_PRIVATE_KEY_FILE=~/.tanoth-license/tanoth-license-private.pem node tools/genkey.mjs 31
 *   LICENSE_PRIVATE_KEY_FILE=~/.tanoth-license/tanoth-license-private.pem node tools/genkey.mjs lifetime
 *
 * Key format: TZ2.<payload b64url>.<signature b64url>, payload = {"exp":<epoch s>}.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_PREFIX = 'TZ2';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());

const args = process.argv.slice(2);

if (args[0] === '--new-keypair') {
  const dir = path.resolve(expand(args[1] || ''));
  if (!args[1]) { console.error('Usage: node tools/genkey.mjs --new-keypair <directory outside the repo>'); process.exit(1); }
  if (dir === REPO || dir.startsWith(REPO + path.sep)) {
    console.error(`Refusing: ${dir} is inside the repository - the private key must never be committed.`);
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'tanoth-license-private.pem');
  if (fs.existsSync(file)) { console.error(`Refusing to overwrite ${file} (keys signed with it would stop working).`); process.exit(1); }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  console.log(`Private key: ${file}  (keep it secret, back it up, never commit it)`);
  console.log('Public key - paste into LICENSE_PUBLIC_KEY in src/shared/payment.js');
  console.log('(and LICENSE_PUBLIC_KEY of the licence server if you run one):');
  console.log(pub);
  process.exit(0);
}

function loadPrivateKey() {
  const pem = process.env.LICENSE_PRIVATE_KEY ||
    (process.env.LICENSE_PRIVATE_KEY_FILE ? fs.readFileSync(expand(process.env.LICENSE_PRIVATE_KEY_FILE), 'utf8') : '');
  if (!pem) {
    console.error('No private key. Set LICENSE_PRIVATE_KEY_FILE=<path to tanoth-license-private.pem>');
    console.error('(or create one with: node tools/genkey.mjs --new-keypair <dir outside the repo>)');
    process.exit(1);
  }
  return crypto.createPrivateKey(pem);
}

const arg = args[0] || '31';
const days = arg === 'lifetime' ? 365000 : Number(arg);
if (!Number.isFinite(days) || days <= 0) {
  console.error('Usage: node tools/genkey.mjs [days>0 | lifetime]   |   --new-keypair <dir>');
  process.exit(1);
}

const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
const payloadB64 = Buffer.from(JSON.stringify({ exp })).toString('base64url');
const sig = crypto.sign('sha256', Buffer.from(payloadB64), { key: loadPrivateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url');

console.log('License key (valid %d days, until %s):', days, new Date(exp * 1000).toISOString());
console.log(`${LICENSE_PREFIX}.${payloadB64}.${sig}`);
