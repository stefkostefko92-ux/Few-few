// Редактор на .env файловете на продуктите.
//
// Това е най-опасната редакция в панела: един сгрешен ред спира продукт, а
// стойностите са ТАЙНИ (ключове на Stripe, пароли за база, токени). Затова:
//
//  1. Само ОТКРИТИ пътища. Файловият браузър позволява всичко (root си е root),
//     но тук списъкът е затворен: конфигурирани + намерени по познатите места.
//     Произволен път през тялото на заявката би превърнал редактора в „презапиши
//     кой да е файл на сървъра" с приятен интерфейс.
//  2. Стойностите се МАСКИРАТ по подразбиране. Разкриват се само по изрична молба
//     и това се записва в одита — иначе открадната сесия изнася всички тайни с
//     един GET.
//  3. Записът е ЧАСТИЧЕН (patch по ключ), не „ето ти целия файл". Така маскираните
//     стойности физически не могат да презапишат истинските — най-честият начин
//     такъв редактор да изтрие тайните на продукцията.
//  4. Коментарите и редът на редовете оцеляват. `.env` файловете носят обяснения,
//     които не бива да изчезват при редакция от браузъра.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from './config.js';

const MAX_ENV = 256 * 1024;
export const KEY_RX = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

// Ключове, чиито стойности не се показват без изрично разкриване.
const SECRET_KEY_RX = /(SECRET|TOKEN|PASSWORD|PASSWD|_PW|KEY|CREDENTIAL|PRIVATE|SALT|HASH|DSN|DATABASE_URL|WEBHOOK)/i;

export function isSecretKey(key) {
  return SECRET_KEY_RX.test(String(key || ''));
}

// Разбор, който ПАЗИ формата: всеки ред остава такъв, какъвто е, а редовете с
// присвояване допълнително се разчитат. Така записът пипа само това, което сме
// променили.
export function parseEnv(text) {
  const lines = String(text ?? '').split('\n');
  const entries = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/^export\s+/, '');
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) return;
    let value = m[2];
    let quote = '';
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1)) {
      quote = trimmed[0];
      value = trimmed.slice(1, -1);
    } else {
      // Коментар след стойността се маха само при НЕцитирана стойност.
      value = trimmed.replace(/\s+#.*$/, '');
    }
    entries.push({ key: m[1], value, quote, line: i });
  });
  return { lines, entries };
}

// Сериализира стойност обратно: цитира, ако има интервал, # или кавичка — иначе
// `KEY=две думи` се чете като `KEY=две` и продуктът тръгва с окастрена стойност.
export function formatValue(value, quote) {
  const v = String(value ?? '');
  if (v.includes('\n')) throw Object.assign(new Error('Стойността не може да съдържа нов ред'), { status: 400 });
  const needs = quote || /[\s#'"$`\\]/.test(v);
  if (!needs) return v;
  return `"${v.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function maskValue(value) {
  const v = String(value ?? '');
  if (!v) return '';
  if (v.length <= 4) return '••••';
  return `${v.slice(0, 2)}••••${v.slice(-2)} (${v.length} знака)`;
}

// ── Кои файлове изобщо са достъпни ───────────────────────────────────────────
const COMMON_DIRS = ['/opt', '/srv', '/var/www'];
const ENV_NAMES = ['.env', '.env.production', '.env.local'];

function safe(p) {
  const full = path.resolve(String(p || ''));
  if (full.includes('\0')) throw Object.assign(new Error('Невалиден път'), { status: 400 });
  return full;
}

// Тайните на САМИЯ панел не минават оттук — иначе редакторът дава sessionSecret
// и peerToken на всеки, който открадне сесия (и достъп до другия VPS).
function isPanelSecret(full) {
  return path.resolve(CONFIG_PATH) === full || /\/etc\/vps-dashboard\//.test(full);
}

// Открива .env файловете: конфигурираните (с unit за рестарт) + намерените под
// текущия release и обичайните места. Едно ниво надолу — без обхождане на целия
// диск (namei бомба при 100k папки).
export function discover(cfg) {
  const found = new Map();
  const add = (file, { name, unit, source }) => {
    const full = safe(file);
    if (isPanelSecret(full)) return;
    if (!fs.existsSync(full)) return;
    if (found.has(full)) return;
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      return;
    }
    if (!st.isFile() || st.size > MAX_ENV) return;
    found.set(full, {
      path: full,
      name: name || path.basename(path.dirname(full)),
      unit: unit || null,
      source,
      sizeBytes: st.size,
      mode: '0' + (st.mode & 0o777).toString(8),
      mtime: st.mtime.toISOString(),
      // Права, по-широки от 600, са реален проблем: всеки на машината чете тайните.
      worldReadable: Boolean(st.mode & 0o044),
    });
  };

  for (const e of cfg.envFiles || []) {
    add(e.path, { name: e.name, unit: e.unit, source: 'конфиг' });
  }

  const roots = [cfg.paths?.currentLink, ...COMMON_DIRS].filter(Boolean);
  for (const root of roots) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink());
    } catch {
      continue;
    }
    for (const d of dirs.slice(0, 200)) {
      for (const n of ENV_NAMES) add(path.join(root, d.name, n), { name: d.name, source: root });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function mustBeKnown(cfg, p) {
  const full = safe(p);
  const known = discover(cfg).find((f) => f.path === full);
  if (!known) {
    throw Object.assign(
      new Error('Този файл не е в списъка с познати .env файлове. Добави го в „envFiles" в конфига, ако е нужен.'),
      { status: 403 }
    );
  }
  return known;
}

// ── Четене ───────────────────────────────────────────────────────────────────
export function readEnv(cfg, p, { reveal = false } = {}, audit, user) {
  const known = mustBeKnown(cfg, p);
  const text = fs.readFileSync(known.path, 'utf8');
  const { entries } = parseEnv(text);
  // Разкриването на тайни е събитие за одита — не тихо четене.
  audit?.log({ action: reveal ? 'env.reveal' : 'env.read', path: known.path, keys: entries.length, user });
  return {
    ...known,
    revealed: Boolean(reveal),
    vars: entries.map((e) => ({
      key: e.key,
      secret: isSecretKey(e.key),
      value: !isSecretKey(e.key) || reveal ? e.value : maskValue(e.value),
      empty: e.value === '',
    })),
  };
}

// ── Запис ────────────────────────────────────────────────────────────────────
// `changes`: { KEY: 'нова стойност' }, `remove`: ['KEY'].
// Никога не приема цялото съдържание — виж горе защо.
export function writeEnv(cfg, p, { changes = {}, remove = [] } = {}, audit, user) {
  const known = mustBeKnown(cfg, p);
  const keys = Object.keys(changes);
  for (const k of [...keys, ...remove]) {
    if (!KEY_RX.test(k)) throw Object.assign(new Error(`Невалидно име на променлива: ${k}`), { status: 400 });
  }
  if (!keys.length && !remove.length) {
    throw Object.assign(new Error('Няма какво да се промени'), { status: 400 });
  }
  for (const [k, v] of Object.entries(changes)) {
    const s = String(v ?? '');
    if (s.includes('\n')) throw Object.assign(new Error(`${k}: стойността не може да съдържа нов ред`), { status: 400 });
    // Маскираната стойност никога не бива да стане истинска — това е буквално
    // начинът тайните на продукцията да се заменят с плочки.
    if (/••••/.test(s)) {
      throw Object.assign(new Error(`${k}: това е скритата стойност, не истинската — записът е спрян.`), { status: 400 });
    }
  }

  const text = fs.readFileSync(known.path, 'utf8');
  const { lines, entries } = parseEnv(text);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const drop = new Set();
  const changed = [];

  for (const [k, v] of Object.entries(changes)) {
    const e = byKey.get(k);
    const rendered = `${k}=${formatValue(v, e?.quote)}`;
    if (e) {
      if (lines[e.line] === rendered) continue; // нищо не се променя
      lines[e.line] = rendered;
    } else {
      lines.push(rendered);
    }
    changed.push(k);
  }
  for (const k of remove) {
    const e = byKey.get(k);
    if (!e) continue;
    drop.add(e.line);
    changed.push(k);
  }
  if (!changed.length) return { path: known.path, changed: [], backup: null, note: 'Нищо не се е променило.' };

  const out = lines.filter((_, i) => !drop.has(i)).join('\n');
  const st = fs.statSync(known.path);
  const bak = `${known.path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(known.path, bak);
  // Копието наследява правата на оригинала — иначе бекъпът на тайните може да
  // излезе по-широко четим от самия файл.
  fs.chmodSync(bak, st.mode & 0o777);
  const tmp = `${known.path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, out, { mode: st.mode & 0o777 });
  fs.renameSync(tmp, known.path);
  // В одита влизат САМО имената на променените ключове. Стойността — никога.
  audit?.log({ action: 'env.write', path: known.path, keys: changed, removed: remove, user });
  return { path: known.path, changed, backup: bak, unit: known.unit };
}
