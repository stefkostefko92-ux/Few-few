import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Безопасно четене на ZIP (DOCX/XLSX са ZIP пакети, §4.1) — файлът е ВРАЖДЕБЕН. Нула зависимости:
 * собственият разбор на централната директория + истинско разархивиране с таван (`maxOutputLength`)
 * — декларираните размери могат да лъжат, затова се мери изходът, не заглавката. Отказ при:
 *  - твърде много записи, ZIP64, многотомен архив, шифрован запис, метод извън stored/deflate;
 *  - записи, чиито данни се застъпват (бомба със застъпване) или излизат извън файла;
 *  - общ разархивиран размер / размер на запис над тавана, съотношение на компресия на бомба;
 *  - несъответствие на размер или CRC-32 с централната директория; повторени или опасни имена.
 * Библиотеките (mammoth) получават НЕ оригинала, а `repackStored` — нов архив само с проверените
 * записи, БЕЗ компресия: каквото и да прави вътрешният им разархиватор, няма какво да „надуе“.
 */

export interface ZipLimits {
  maxEntries: number;
  /** Сумата на разархивираните записи. */
  maxTotalBytes: number;
  maxEntryBytes: number;
  /** Над това съотношение (разархивиран/компресиран) записът е бомба — само над `ratioFloor`. */
  maxRatio: number;
  ratioFloor: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 2000,
  maxTotalBytes: 200 * 1024 * 1024,
  maxEntryBytes: 100 * 1024 * 1024,
  maxRatio: 1000,
  ratioFloor: 1024 * 1024,
};

export type ZipFailure =
  | 'not_zip'
  | 'too_many_entries'
  | 'zip64'
  | 'encrypted'
  | 'unsupported_method'
  | 'bad_name'
  | 'duplicate_name'
  | 'overlap'
  | 'truncated'
  | 'bomb'
  | 'too_large'
  | 'corrupt';

export class ZipError extends Error {
  constructor(readonly reason: ZipFailure) {
    super(`zip: ${reason}`);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  name: string;
  /** Флагът за UTF-8 име (бит 11) — запазва се при препакетирането. */
  utf8: boolean;
  data: Buffer;
  crc: number;
}

interface CentralRecord {
  name: string;
  utf8: boolean;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  localOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Краят на централната директория: последните 22 байта + коментар до 64 KB. */
function findEocd(b: Buffer): number {
  const min = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= min; i -= 1) {
    if (b.readUInt32LE(i) === EOCD) return i;
  }
  return -1;
}

/** Име на запис: относителен път без „..“, обратни наклонени, NUL и контролни знаци. */
function safeName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return false;
  if (name.startsWith('/') || name.includes('\\') || /[\u0000-\u001f]/.test(name)) return false;
  return !name.split('/').some((part) => part === '..');
}

function readCentral(b: Buffer, limits: ZipLimits): CentralRecord[] {
  if (b.length < 22 || b.readUInt32LE(0) !== LOCAL) throw new ZipError('not_zip');
  const eocd = findEocd(b);
  if (eocd < 0) throw new ZipError('not_zip');
  const disk = b.readUInt16LE(eocd + 4);
  const cdDisk = b.readUInt16LE(eocd + 6);
  const onDisk = b.readUInt16LE(eocd + 8);
  const total = b.readUInt16LE(eocd + 10);
  const cdSize = b.readUInt32LE(eocd + 12);
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipError('zip64');
  }
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) throw new ZipError('corrupt');
  if (total > limits.maxEntries) throw new ZipError('too_many_entries');
  if (cdOffset + cdSize > eocd) throw new ZipError('truncated');

  const records: CentralRecord[] = [];
  const seen = new Set<string>();
  let p = cdOffset;
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > eocd || b.readUInt32LE(p) !== CENTRAL) throw new ZipError('corrupt');
    const flags = b.readUInt16LE(p + 8);
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const compressed = b.readUInt32LE(p + 20);
    const size = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const localOffset = b.readUInt32LE(p + 42);
    if (compressed === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError('zip64');
    }
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > eocd) throw new ZipError('truncated');
    const utf8 = (flags & 0x800) !== 0;
    const name = b.toString(utf8 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    if (flags & 0x1) throw new ZipError('encrypted');
    if (method !== 0 && method !== 8) throw new ZipError('unsupported_method');
    if (!safeName(name)) throw new ZipError('bad_name');
    const key = name.toLowerCase();
    if (seen.has(key)) throw new ZipError('duplicate_name');
    seen.add(key);
    records.push({ name, utf8, flags, method, crc, compressed, size, localOffset });
    p = end;
  }
  return records;
}

/** Къде започват данните на записа (след локалната заглавка) — с проверка на границите. */
function dataStart(b: Buffer, r: CentralRecord): number {
  const at = r.localOffset;
  if (at + 30 > b.length || b.readUInt32LE(at) !== LOCAL) throw new ZipError('corrupt');
  const start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28);
  if (start + r.compressed > b.length) throw new ZipError('truncated');
  return start;
}

/**
 * Разархивира и проверява всички записи (папките — без данни — се пропускат). Хвърля ZipError;
 * друга грешка от zlib (повреден поток) също става ZipError('corrupt').
 */
export function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = readCentral(b, limits);
  // Застъпване: подредени по отместване, всеки запис свършва преди следващата локална заглавка.
  const spans = records
    .map((r) => ({ r, start: dataStart(b, r) }))
    .sort((x, y) => x.r.localOffset - y.r.localOffset);
  for (let i = 1; i < spans.length; i += 1) {
    const prev = spans[i - 1];
    const cur = spans[i];
    if (prev && cur && prev.start + prev.r.compressed > cur.r.localOffset) {
      throw new ZipError('overlap');
    }
  }
  let total = 0;
  const entries: ZipEntry[] = [];
  for (const { r, start } of spans) {
    if (r.name.endsWith('/')) continue;
    if (r.size > limits.maxEntryBytes) throw new ZipError('too_large');
    if (total + r.size > limits.maxTotalBytes) throw new ZipError('too_large');
    if (r.size > limits.ratioFloor && r.size / Math.max(r.compressed, 1) > limits.maxRatio) {
      throw new ZipError('bomb');
    }
    const raw = b.subarray(start, start + r.compressed);
    let data: Buffer;
    if (r.method === 0) {
      data = Buffer.from(raw);
    } else {
      try {
        // Таванът е ДЕКЛАРИРАНИЯТ размер + 1: по-дълъг изход = лъжа в заглавката = бомба.
        data = inflateRawSync(raw, { maxOutputLength: r.size + 1 });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new ZipError('bomb');
        }
        throw new ZipError('corrupt');
      }
    }
    if (data.length !== r.size) throw new ZipError(data.length > r.size ? 'bomb' : 'corrupt');
    if (crc32(data) !== r.crc) throw new ZipError('corrupt');
    total += data.length;
    entries.push({ name: r.name, utf8: r.utf8, data, crc: r.crc });
  }
  return entries;
}

/** Записите по име (за разбора на OOXML частите). */
export function entryMap(entries: readonly ZipEntry[]): Map<string, ZipEntry> {
  return new Map(entries.map((e) => [e.name, e]));
}

/** DOS дата/час: фиксирани (1.1.1980) — препакетираният архив не носи време от оригинала. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Нов ZIP само с проверените записи, без компресия (метод 0) — за библиотеките. */
export function repackStored(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, e.utf8 ? 'utf8' : 'latin1');
    const flags = e.utf8 ? 0x800 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, e.data);
    centrals.push(central, name);
    offset += local.length + name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/**
 * Само имената от централната директория (без разархивиране) — за разпознаване на формата при
 * качването. null → не е четим ZIP (или е извън таваните на имената).
 */
export function zipNames(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): string[] | null {
  try {
    const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return readCentral(b, limits).map((r) => r.name);
  } catch {
    return null;
  }
}
