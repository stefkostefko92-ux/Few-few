// Файлов браузър — САМО четене (списък + преглед на текстови файлове с таван).
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
const SENSITIVE_FILES = [/\/etc\/vps-dashboard\/config\.json$/, /\/etc\/vps-dashboard\/.*\.env$/];

// Пътят на ЖИВИЯ конфиг (уважава CSD_CONFIG) — иначе преместен конфиг тихо
// изпада от защитата и тайните му тръгват към браузъра.
function isSensitive(fullPath) {
  if (path.resolve(CONFIG_PATH) === fullPath) return true;
  return SENSITIVE_FILES.some((rx) => rx.test(fullPath));
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

export function listDir(p) {
  const full = safeResolve(p);
  const st = fs.statSync(full);
  if (!st.isDirectory()) throw Object.assign(new Error('Не е папка'), { status: 400 });
  const entries = fs
    .readdirSync(full)
    .slice(0, 1000)
    .map((name) => {
      try {
        const s = fs.lstatSync(path.join(full, name));
        return {
          name,
          isDir: s.isDirectory(),
          isLink: s.isSymbolicLink(),
          sizeBytes: s.size,
          mode: '0' + (s.mode & 0o777).toString(8),
          mtime: s.mtime.toISOString(),
        };
      } catch {
        return { name, error: true };
      }
    })
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
  return { path: full, parent: full === '/' ? null : path.dirname(full), entries };
}

// Запис на текстов файл. Пази копие на стария (.bak-<време>) — редакцията на
// конфиг на сървъра трябва да е обратима. Не създава нови файлове по погрешка:
// изисква файлът да съществува, освен при изричен create.
export const REDACTED_MARK = '«скрито';

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
    const bak = `${full}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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
