// Конфигурация — чете /etc/vps-dashboard/config.json (mode 600, само на сървъра).
// В dev режим (CSD_DEV=1 или липсващ конфиг) генерира ефимерен конфиг с еднократна
// парола, отпечатана в конзолата — нищо не се записва в репото.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';

export const CONFIG_PATH = process.env.CSD_CONFIG || '/etc/vps-dashboard/config.json';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 7700,
  nodeId: 'local',
  nodeName: 'Този сървър',
  adminUser: 'admin',
  sessionTtlHours: 12,
  // Зад reverse proxy с TLS → кукито става Secure и IP-то се чете от X-Forwarded-For.
  trustProxy: false,
  // Входящ federation токен — с него другият VPS вика нашето API. Празно = изключено.
  peerToken: '',
  // Другите VPS-и: [{ id, name, url, token }]
  peers: [],
  paths: {
    stateDir: '/var/lib/vps-dashboard',
    releasesDir: '/opt/few-few/releases',
    currentLink: '/opt/few-few/current',
    archiveDir: '/root',
    autodeploy: '', // празно = <archive>/deploy/autodeploy.sh от текущия release
  },
  // Известия — канали. Празните се пропускат. Тайните живеят само тук (mode 600).
  notify: {
    telegram: { botToken: '', chatId: '' },
    ntfy: { server: 'https://ntfy.sh', topic: '', token: '' },
    webhook: { url: '' },
    email: { to: '', from: 'vps-dashboard@localhost' }, // праща се през sendmail, ако е наличен
  },
  // Аларми — прагове и каданс. Аларми по СИМПТОМ, не по причина (канонът на Наблюдателя).
  alerts: {
    enabled: true,
    checkIntervalSec: 60,
    cooldownMin: 60, // повторно известие за същия проблем не по-често от това
    sustainSamples: 3, // праг трябва да се задържи N проверки → без шум от пикове
    thresholds: {
      cpuPct: 90,
      memPct: 90,
      diskPct: 85,
      load1PerCore: 2,
      certDays: 14,
    },
  },
  // Двуфакторна автентикация (TOTP). secret се записва при включване от панела.
  totp: { enabled: false, secret: '' },
  // Качване на архиви от браузъра (за деплой).
  uploads: { maxBytes: 3 * 1024 * 1024 * 1024 },
  // Продуктови health проверки (име + локален URL). Съвпадат с autodeploy.sh.
  healthChecks: [
    { name: 'zabobovdol', url: 'http://127.0.0.1:80/' },
    { name: 'medqr', url: 'http://127.0.0.1:3000/' },
    { name: 'vizitka', url: 'http://127.0.0.1:3100/' },
    { name: 'mastilko', url: 'http://127.0.0.1:3200/' },
    { name: 'nexus', url: 'http://127.0.0.1:4000/api/health' },
    { name: 'supreme', url: 'http://127.0.0.1:8080/' },
    { name: 'eternaltouch', url: 'http://127.0.0.1:4300/healthz' },
    { name: 'ospedali', url: 'http://127.0.0.1:8788/healthz' },
  ],
};

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadConfig({ configPath = CONFIG_PATH, allowDev = true } = {}) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Невалиден конфиг ${configPath}: ${err.message}`);
  }

  if (!raw) {
    if (!allowDev && !process.env.CSD_DEV) {
      throw new Error(`Липсва конфиг ${configPath} — пусни deploy/install.sh веднъж на сървъра.`);
    }
    // Dev fallback: еднократна парола, ефимерни тайни, state в локална папка.
    const password = crypto.randomBytes(9).toString('base64url');
    const cfg = deepMerge(DEFAULTS, {
      nodeName: 'DEV',
      passwordHash: hashPassword(password),
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      paths: { stateDir: path.resolve('.state') },
      dev: true,
    });
    // eslint-disable-next-line no-console
    console.log(`\n▸ DEV режим: потребител "${cfg.adminUser}", парола "${password}" (еднократна)\n`);
    return finalize(cfg);
  }

  const cfg = deepMerge(DEFAULTS, raw);
  if (!cfg.passwordHash) throw new Error('Конфигът няма passwordHash — пусни deploy/install.sh.');
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) {
    throw new Error('Конфигът няма силен sessionSecret (≥32 знака).');
  }
  return finalize(cfg);
}

function finalize(cfg) {
  fs.mkdirSync(cfg.paths.stateDir, { recursive: true, mode: 0o700 });
  return cfg;
}

// Записва промяна по конфига (2FA, канали за известия, прагове) обратно на диск.
// Атомарно (tmp + rename), mode 600. Мутира и обекта в паметта, за да е в синхрон.
// В dev режим (без файл) само мутира паметта — нищо не се записва.
export function saveConfig(cfg, patch, { configPath = CONFIG_PATH } = {}) {
  const merged = deepMerge(cfg, patch);
  Object.assign(cfg, merged);
  if (cfg.dev) return cfg;
  const { dev, ...toWrite } = merged;
  const tmp = `${configPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, configPath);
  return cfg;
}
