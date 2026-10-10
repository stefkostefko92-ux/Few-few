import { bufferSource } from './envelope.js';
import { decodeObject, encodeObject, PLAINTEXT_ONLY, type StoreCrypto } from './file-store.js';
import { assertKey } from './keys.js';

/**
 * Частното хранилище на прикачените файлове (FR-06, §15 „storage privato“). Никога публичен URL:
 * сваляне само през подписан краткотраен адрес и повторна проверка на достъпа (routes/attachments).
 * Ключът е `<tenantId>/<yyyy>/<mm>/<случаен id>` (keys.ts). Обектите са шифровани в покой
 * (envelope.ts, NFR-03): интерфейсът е в открит текст — шифроването е вътре в хранилището, така
 * всеки, който пише/чете през него (снимки, логове, PDF, файлове в разговорите), е покрит.
 */
export interface AttachmentStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** null → няма такъв файл (изтрит от ретенцията или след антивируса). */
  get(key: string): Promise<Buffer | null>;
  /** Идемпотентно: липсващ файл не е грешка. */
  delete(key: string): Promise<void>;
}

export { newObjectKey } from './keys.js';
export { FileAttachmentStore, type StoreCrypto } from './file-store.js';

/** В паметта — за тестовете (същата проверка на ключа и същият формат на шифроване). */
export class MemoryAttachmentStore implements AttachmentStore {
  /** Каквото би стояло на диска — шифротекст, щом има ключодържател. */
  readonly files = new Map<string, Buffer>();

  constructor(readonly crypto: StoreCrypto = PLAINTEXT_ONLY) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    assertKey(key);
    this.files.set(key, Buffer.concat([...encodeObject(key, bytes, this.crypto)]));
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    const file = this.files.get(key);
    return file ? decodeObject(key, bufferSource(file), this.crypto) : null;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    this.files.delete(key);
  }
}
