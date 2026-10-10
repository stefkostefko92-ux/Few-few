import { createHmac } from 'node:crypto';

/**
 * Ключодържателят на файловете (NFR-03): текущият главен ключ (KEK, `FILES_KEK`) пише, предишните
 * (`FILES_KEK_PREVIOUS`) само четат до `npm run files:rekey`. Заглавката на всеки обект носи
 * отпечатъка на KEK (id), не самия ключ.
 */

const KEY_BYTES = 32;
const ID_BYTES = 8;

/** Отпечатъкът на KEK — по него заглавката казва с кой ключ е опакован DEK. */
export function kekId(kek: Uint8Array): Buffer {
  return createHmac('sha256', kek)
    .update('chatchat/files/kek-id/v1')
    .digest()
    .subarray(0, ID_BYTES);
}

/** Текущият KEK (с него се пише) и предишните (само за четене до `files:rekey`). */
export class Keyring {
  readonly currentId: string;
  private readonly current: Buffer;
  private readonly byId = new Map<string, Buffer>();

  constructor(current: Uint8Array, previous: readonly Uint8Array[] = []) {
    for (const k of [current, ...previous]) {
      if (k.byteLength !== KEY_BYTES) throw new Error('KEK трябва да е 32 байта');
    }
    this.current = Buffer.from(current);
    this.currentId = kekId(this.current).toString('hex');
    for (const k of [current, ...previous]) this.byId.set(kekId(k).toString('hex'), Buffer.from(k));
  }

  get size(): number {
    return this.byId.size;
  }

  find(id: string): Buffer | undefined {
    return this.byId.get(id);
  }

  writer(): { id: Buffer; key: Buffer } {
    return { id: Buffer.from(this.currentId, 'hex'), key: this.current };
  }
}
