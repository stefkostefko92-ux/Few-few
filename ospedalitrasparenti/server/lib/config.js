// @ts-check
// Конфигурация + тайни за админ сервиза. Тайните НИКОГА не влизат в репото —
// четат се от обкръжението (systemd Environment=) или от server/.env (mode 600).

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

/**
 * @typedef {import('./auth.js').PasswordRecord} PasswordRecord
 *
 * @typedef {Object} Config
 * @property {number} port
 * @property {string} host
 * @property {string} siteDir
 * @property {string} stateDir
 * @property {string} analyticsFile
 * @property {string} visibilityFile
 * @property {string} auditFile
 * @property {boolean} secureCookies
 * @property {string} sessionSecret
 * @property {boolean} sessionRandom
 * @property {PasswordRecord} [admin]
 * @property {'env'|'state'|'generated'} [adminSource]
 * @property {string} [generatedPassword]
 */

const SERVER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(SERVER_DIR);

// Прост .env парсер (без зависимости); не пре-записва вече зададени променливи.
/** @returns {void} */
function loadDotEnv() {
  const f = join(SERVER_DIR, '.env');
  if (!existsSync(f)) return;
  let testo;
  // .env може да е root-owned (mode 600) под systemd — тайните идват от
  // EnvironmentFile (чете се от systemd като root). Тогава www-data не може да
  // отвори файла: best-effort, не спираме сервиза заради EACCES.
  try { testo = readFileSync(f, 'utf8'); } catch { return; }
  for (const line of testo.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * Разпознава продукционен режим. „Продукция" = изрично `NODE_ENV=production`
 * ИЛИ отсъствие на `OSPEDALI_INSECURE_COOKIES` (т.е. Secure бисквитки → зад TLS).
 * @returns {boolean}
 */
export function eProduzione() {
  return process.env.NODE_ENV === 'production' || !process.env.OSPEDALI_INSECURE_COOKIES;
}

/**
 * Сглобява конфигурацията + тайните за админ сервиза.
 * @returns {Promise<Config>}
 */
export async function initConfig() {
  loadDotEnv();
  const STATE_DIR = join(SERVER_DIR, '.state');
  await mkdir(STATE_DIR, { recursive: true }).catch(() => {});

  /** @type {Config} */
  const cfg = {
    port: Number(process.env.OSPEDALI_PORT) || 8788,
    host: process.env.OSPEDALI_HOST || '127.0.0.1',
    siteDir: join(ROOT, 'site'),
    stateDir: STATE_DIR,
    analyticsFile: join(STATE_DIR, 'analytics.json'),
    visibilityFile: join(STATE_DIR, 'visibility.json'),
    auditFile: join(STATE_DIR, 'audit.log'),
    // Secure бисквитки по подразбиране (сайтът е зад TLS); изключи локално с =0.
    secureCookies: process.env.OSPEDALI_INSECURE_COOKIES ? false : true,
    sessionSecret: process.env.OSPEDALI_SESSION_SECRET || randomBytes(32).toString('hex'),
    sessionRandom: !process.env.OSPEDALI_SESSION_SECRET,
  };

  // Парола: env (plaintext) → .state/admin.json → генерирай случайна и я покажи веднъж.
  const credFile = join(STATE_DIR, 'admin.json');
  if (process.env.OSPEDALI_ADMIN_PASSWORD) {
    cfg.admin = hashPassword(process.env.OSPEDALI_ADMIN_PASSWORD);
    cfg.adminSource = 'env';
  } else if (existsSync(credFile)) {
    cfg.admin = JSON.parse(await readFile(credFile, 'utf8'));
    cfg.adminSource = 'state';
  } else if (eProduzione()) {
    // Prod-guard: в продукция НЕ генерираме тиха парола (иначе рестартът мълчаливо
    // сменя достъпа) — искаме изрична OSPEDALI_ADMIN_PASSWORD. Отказваме старт ясно.
    throw new Error(
      'OSPEDALI_ADMIN_PASSWORD липсва в продукционен режим. Задай я (systemd Environment= ' +
        'или server/.env, mode 600) — автоматично генерирана парола е само за локална разработка ' +
        '(пусни с OSPEDALI_INSECURE_COOKIES=1 за локален режим).'
    );
  } else {
    const pw = randomBytes(9).toString('base64url');
    cfg.admin = hashPassword(pw);
    // Атомен запис (tmp → rename в същата директория); best-effort.
    try {
      const tmp = `${credFile}.tmp`;
      await writeFile(tmp, JSON.stringify(cfg.admin));
      await rename(tmp, credFile);
    } catch { /* без спиране — паролата остава само в паметта за тази сесия */ }
    cfg.adminSource = 'generated';
    cfg.generatedPassword = pw;
  }
  return cfg;
}
