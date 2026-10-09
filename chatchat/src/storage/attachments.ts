import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Частното хранилище на прикачените файлове (FR-06, §15 „storage privato“). Никога публичен URL:
 * сваляне само през подписан краткотраен адрес и повторна проверка на достъпа (routes/attachments).
 * Ключът е `<tenantId>/<yyyy>/<mm>/<случаен id>` — сглобява го сървърът, вход от клиента в пътя
 * няма (името на файла е само за показване, в базата).
 */
export interface AttachmentStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** null → няма такъв файл (изтрит от ретенцията или след антивируса). */
  get(key: string): Promise<Buffer | null>;
  /** Идемпотентно: липсващ файл не е грешка. */
  delete(key: string): Promise<void>;
}

/** tenantId е cuid (малки букви и цифри); последната част — 128 случайни бита в hex. */
const KEY = /^[a-z0-9]{1,40}\/\d{4}\/\d{2}\/[a-f0-9]{32}$/;

export function newObjectKey(tenantId: string, now = new Date()): string {
  if (!/^[a-z0-9]{1,40}$/.test(tenantId)) throw new Error('Невалиден tenantId за ключ.');
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${yyyy}/${mm}/${randomBytes(16).toString('hex')}`;
}

function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error('Невалиден ключ на прикачен файл.');
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

/**
 * Файлове на диска: папки 700, файлове 600, атомарен запис (временен файл → fsync → rename),
 * за да не се вижда наполовина записан файл. Пътят се проверява и след сглобяването.
 */
export class FileAttachmentStore implements AttachmentStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathOf(key: string): string {
    assertKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Ключът излиза от хранилището.');
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, target);
    } catch (err) {
      // Пълен диск или отказ — без недописан временен файл.
      await rm(temp, { force: true });
      throw err;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}

/** В паметта — за тестовете (същата проверка на ключа). */
export class MemoryAttachmentStore implements AttachmentStore {
  readonly files = new Map<string, Buffer>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    assertKey(key);
    this.files.set(key, Buffer.from(bytes));
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    const file = this.files.get(key);
    return file ? Buffer.from(file) : null;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    this.files.delete(key);
  }
}
