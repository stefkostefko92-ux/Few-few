/**
 * Безопасният резолвер (критерий 5): път от страницата или от задача стига само до файл под корена на
 * студиото. Отказва `..`, абсолютен път, UNC, `\\?\`, буква на диск, ADS „:“, NUL, „%“ (двойно кодиране),
 * запазени имена на Windows (CON, PRN, AUX, NUL, COM1–9, LPT1–9), непозволено разширение и всичко, което
 * след realpath (symlink, junction) излиза от корена. Сравнението е без значение на регистъра на Windows.
 */
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';

export class PathError extends Error {}

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
};
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function contentTypeOf(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Проверките по низа — преди да пипнем диска. Връща сегментите. */
function lexical(rel: string): string[] {
  if (typeof rel !== 'string' || !rel || rel.length > 400)
    throw new PathError('празен или твърде дълъг път');
  if (/[\u0000-\u001f%:*?"<>|]/.test(rel)) throw new PathError('непозволен знак в пътя');
  if (isAbsolute(rel) || /^[\\/]/.test(rel) || /^[a-z]:/i.test(rel))
    throw new PathError('абсолютен път');
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  if (!segs.length) throw new PathError('празен път');
  for (const s of segs) {
    if (s === '.' || s === '..') throw new PathError('излизане от корена');
    if (RESERVED.test(s)) throw new PathError('запазено име на Windows');
    if (/[. ]$/.test(s)) throw new PathError('име, завършващо с точка или интервал');
  }
  if (!(extname(segs[segs.length - 1]!).toLowerCase() in TYPES))
    throw new PathError('непозволено разширение');
  return segs;
}

const inside = (root: string, target: string): boolean => {
  const r = relative(
    process.platform === 'win32' ? root.toLowerCase() : root,
    process.platform === 'win32' ? target.toLowerCase() : target,
  );
  return r !== '' && !r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..');
};

/** Съществуващ файл под корена → реалният му път. */
export async function safeResolve(root: string, rel: string): Promise<string> {
  const segs = lexical(rel);
  const realRoot = await realpath(root);
  let real: string;
  try {
    real = await realpath(join(realRoot, ...segs));
  } catch {
    throw new PathError('файлът липсва');
  }
  if (!inside(realRoot, real)) throw new PathError('излизане от корена');
  const st = await stat(real);
  if (!st.isFile()) throw new PathError('не е файл');
  return real;
}

/** Изход на задача: файлът може да не съществува, папката му трябва да е реална и под корена. */
export async function safeOutput(root: string, rel: string): Promise<string> {
  const segs = lexical(rel);
  const realRoot = await realpath(root);
  const wanted = join(realRoot, ...segs);
  let dir: string;
  try {
    dir = await realpath(dirname(wanted));
  } catch {
    throw new PathError('папката липсва');
  }
  if (dir !== realRoot && !inside(realRoot, dir)) throw new PathError('излизане от корена');
  return join(dir, basename(wanted));
}
