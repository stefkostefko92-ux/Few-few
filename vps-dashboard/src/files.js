// Файлов браузър — САМО четене (списък + преглед на текстови файлове с таван).
// Панелът върви като root: браузването е съзнателно позволено навсякъде, но
// тайните файлове (mode 600 конфиги) се показват само по изричен път — одитирано.
import fs from 'node:fs';
import path from 'node:path';

const VIEW_CAP = 256 * 1024; // 256KB преглед

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
    return {
      path: full,
      binary: false,
      sizeBytes: st.size,
      truncated: st.size > VIEW_CAP,
      content: buf.toString('utf8'),
    };
  } finally {
    fs.closeSync(fd);
  }
}
