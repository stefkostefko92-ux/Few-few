// Файлов браузър — четене (списък + преглед на текст с таван) и редакция с копие.
// Останалите операции (качване, кошче, права, архиви…) са в fileops.js.
// Панелът върви като root: браузването е съзнателно позволено навсякъде, но
// тайните файлове (mode 600 конфиги) се показват само по изричен път — одитирано.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from './config.js';

const VIEW_CAP = 256 * 1024; // 256KB преглед

// Тайните на САМИЯ панел не бива да минават през браузъра. Открадната сесия иначе
// вади sessionSecret → подправени сесии завинаги (преживяват смяна на паролата) и
// peerToken → достъп до другия VPS. Root shell пак може да ги прочете — това не е
// граница на привилегии, а стесняване на щетата от открадната сесия.
const SECRET_KEYS = /("(?:passwordHash|sessionSecret|peerToken|secret|token|botToken|password|apiKey)"\s*:\s*)"[^"]*"/gi;
// Копията носят СЪЩИТЕ тайни: `config.json.bak` (saveConfig) и `.tmp` от атомарния
// запис. Регекс, закотвен на `config.json$`, ги пропускаше — прегледът показваше
// копието нередактирано. desktop.env е паролата на десктопа (вторият слой).
const SENSITIVE_FILES = [
  /\/etc\/vps-dashboard\/config\.json(?:\.[\w-]+)*$/,
  /\/etc\/vps-dashboard\/.*\.env(?:\.[\w-]+)*$/,
  /\/deploy\/desktop\/desktop\.env(?:\.[\w-]+)*$/,
];

// Пътят на ЖИВИЯ конфиг (уважава CSD_CONFIG) — иначе преместен конфиг тихо
// изпада от защитата и тайните му тръгват към браузъра.
export function isSensitive(fullPath) {
  const live = path.resolve(CONFIG_PATH);
  if (fullPath === live || fullPath.startsWith(live + '.')) return true;
  return SENSITIVE_FILES.some((rx) => rx.test(fullPath));
}

// Папките, в които живеят тайните на панела — цели не се свалят, а по-горна
// папка (напр. /etc) се сваля БЕЗ тях.
export function secretDirs() {
  return [...new Set([path.dirname(path.resolve(CONFIG_PATH)), '/etc/vps-dashboard'])];
}

export function redactSecrets(fullPath, text) {
  if (!isSensitive(fullPath)) return { text, changed: false };
  let changed = false;
  let out = text.replace(SECRET_KEYS, (_m, prefix) => {
    changed = true;
    return `${prefix}"«скрито — виж файла на сървъра»"`;
  });
  // .env форма: КЛЮЧ=стойност
  out = out.replace(/^(\s*[\w.]*(?:SECRET|TOKEN|PASSWORD|KEY)[\w.]*\s*=).*$/gim, (_m, prefix) => {
    changed = true;
    return `${prefix}«скрито»`;
  });
  return { text: out, changed };
}

function safeResolve(p) {
  const full = path.resolve(String(p || '/'));
  if (full.includes('\0')) throw Object.assign(new Error('Невалиден път'), { status: 400 });
  return full;
}

export function listDir(p, { owners } = {}) {
  const full = safeResolve(p);
  const st = fs.statSync(full);
  if (!st.isDirectory()) throw Object.assign(new Error('Не е папка'), { status: 400 });
  const names = fs.readdirSync(full);
  const users = owners?.users;
  const groups = owners?.groups;
  const entries = names
    .slice(0, 2000)
    .map((name) => {
      try {
        const s = fs.lstatSync(path.join(full, name));
        const e = {
          name,
          isDir: s.isDirectory(),
          isLink: s.isSymbolicLink(),
          sizeBytes: s.size,
          mode: '0' + (s.mode & 0o777).toString(8),
          owner: users?.get(s.uid) ?? String(s.uid),
          group: groups?.get(s.gid) ?? String(s.gid),
          mtime: s.mtime.toISOString(),
        };
        if (e.isLink) {
          try {
            e.target = fs.readlinkSync(path.join(full, name));
            // Връзка към папка се отваря като папка (sites-enabled → sites-available).
            e.targetIsDir = fs.statSync(path.join(full, name)).isDirectory();
          } catch {
            e.broken = true;
          }
        }
        return e;
      } catch {
        return { name, error: true };
      }
    })
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
  // Огромна папка (node_modules, кеш) не бива да изпраща 200 000 реда — но и не
  // бива да мълчи, че е отрязана.
  return { path: full, parent: full === '/' ? null : path.dirname(full), entries, total: names.length, truncated: names.length > 2000 };
}

// Запис на текстов файл. Пази копие на стария (.bak-<време>) — редакцията на
// конфиг на сървъра трябва да е обратима. Не създава нови файлове по погрешка:
// изисква файлът да съществува, освен при изричен create.
export const REDACTED_MARK = '«скрито';

// Копието лежи до ИСТИНСКИЯ файл (през символна връзка — до целта) и никога в
// папка, която сървърът зарежда ЦЯЛА: nginx включва `sites-enabled/*`, тоест
// `сайт.bak-…` там е ВТОРИ активен vhost със старите настройки (а `nginx -t`
// само предупреждава за дублирания server_name). Оттам — в /var/backups.
export const EDIT_BAK_DIR = '/var/backups/vps-dashboard';
const INCLUDE_ALL_DIR = /\/(sites-enabled|conf-enabled|mods-enabled|streams-enabled)$/;
export function backupPathFor(full, now = new Date()) {
  let real = full;
  try {
    real = fs.realpathSync(full);
  } catch {
    /* няма го — пътят е какъвто е */
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  if (INCLUDE_ALL_DIR.test(path.dirname(real))) return path.join(EDIT_BAK_DIR, `${path.basename(real)}.bak-${stamp}`);
  return `${real}.bak-${stamp}`;
}

export function writeFile(p, content, { create = false } = {}, audit, user) {
  const full = safeResolve(p);
  const text = String(content ?? '');
  // Файловете с тайни се показват РЕДАКТИРАНИ (виж redactSecrets) — запис оттук би
  // презаписал истинските тайни с плочки. Затова са само за четене през панела.
  if (isSensitive(full)) {
    throw Object.assign(
      new Error('Този файл съдържа тайни и се показва скрит — редактирай го на сървъра (терминал), не оттук.'),
      { status: 403 }
    );
  }
  if (text.includes(REDACTED_MARK)) {
    throw Object.assign(new Error('Съдържанието носи скрити стойности — записът е спрян, за да не изтрие тайни.'), {
      status: 400,
    });
  }
  if (Buffer.byteLength(text, 'utf8') > VIEW_CAP) {
    throw Object.assign(new Error('Файлът е твърде голям за редакция през панела'), { status: 400 });
  }
  const exists = fs.existsSync(full);
  if (!exists && !create) throw Object.assign(new Error('Няма такъв файл'), { status: 400 });
  if (exists) {
    const st = fs.statSync(full);
    if (!st.isFile()) throw Object.assign(new Error('Не е файл'), { status: 400 });
    const bak = backupPathFor(full);
    if (bak.startsWith(EDIT_BAK_DIR + '/')) fs.mkdirSync(EDIT_BAK_DIR, { recursive: true, mode: 0o700 });
    fs.copyFileSync(full, bak);
    audit.log({ action: 'file.write', path: full, bytes: text.length, backup: bak, user });
    fs.writeFileSync(full, text, { mode: st.mode & 0o777 });
    return { path: full, bytes: text.length, backup: bak };
  }
  audit.log({ action: 'file.create', path: full, bytes: text.length, user });
  fs.writeFileSync(full, text, { mode: 0o600 });
  return { path: full, bytes: text.length, backup: null };
}

export function readFilePreview(p, audit, user) {
  const full = safeResolve(p);
  const st = fs.statSync(full);
  if (!st.isFile()) throw Object.assign(new Error('Не е файл'), { status: 400 });
  audit.log({ action: 'file.view', path: full, user });
  const fd = fs.openSync(full, 'r');
  try {
    const size = Math.min(st.size, VIEW_CAP);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    // Бинарни файлове не се показват — проверка за NUL в първите байтове.
    if (buf.subarray(0, 8000).includes(0)) {
      return { path: full, binary: true, sizeBytes: st.size };
    }
    const redacted = redactSecrets(full, buf.toString('utf8'));
    return {
      path: full,
      binary: false,
      sizeBytes: st.size,
      truncated: st.size > VIEW_CAP,
      redacted: redacted.changed,
      content: redacted.text,
    };
  } finally {
    fs.closeSync(fd);
  }
}
