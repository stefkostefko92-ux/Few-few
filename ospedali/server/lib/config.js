// Конфигурация + тайни за админ сервиза. Тайните НИКОГА не влизат в репото —
// четат се от обкръжението (systemd Environment=) или от server/.env (mode 600).

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

const SERVER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(SERVER_DIR);

// Прост .env парсер (без зависимости); не пре-записва вече зададени променливи.
function loadDotEnv() {
  const f = join(SERVER_DIR, '.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export async function initConfig() {
  loadDotEnv();
  const STATE_DIR = join(SERVER_DIR, '.state');
  await mkdir(STATE_DIR, { recursive: true }).catch(() => {});

  const cfg = {
    port: Number(process.env.OSPEDALI_PORT) || 8788,
    host: process.env.OSPEDALI_HOST || '127.0.0.1',
    siteDir: join(ROOT, 'site'),
    stateDir: STATE_DIR,
    analyticsFile: join(STATE_DIR, 'analytics.json'),
    visibilityFile: join(STATE_DIR, 'visibility.json'),
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
