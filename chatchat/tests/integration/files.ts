import type { Scanner, ScanVerdict } from '../../src/storage/antivirus.js';
import { MemoryAttachmentStore } from '../../src/storage/attachments.js';
import { EICAR } from '../file-fixtures.js';
import { db, type Client } from './helpers.js';

/**
 * Помощници за прикачените файлове: фалшив антивирус (EICAR → INFECTED, по желание FAILED),
 * хранилище в паметта, което записва дали редът още е в базата при триене на файла (ретенцията
 * трие файла ПРЕДИ реда), и кратки извиквания на API-то.
 */

export const URL_KEY = 'attachment-url-key-for-tests-0123456789abcdef';

export class FakeScanner implements Scanner {
  mode: 'auto' | 'failed' = 'auto';
  scanned = 0;

  async scan(bytes: Uint8Array): Promise<ScanVerdict> {
    this.scanned += 1;
    if (this.mode === 'failed') return { status: 'FAILED', reason: 'timeout' };
    return Buffer.from(bytes).toString('latin1').includes(EICAR)
      ? { status: 'INFECTED', signature: 'Eicar-Test-Signature' }
      : { status: 'CLEAN' };
  }
}

export class SpyStore extends MemoryAttachmentStore {
  /** За всяко триене: имаше ли още ред с този ключ в базата в момента на триенето. */
  readonly deletions: Array<{ key: string; rowExisted: boolean }> = [];

  override async delete(key: string): Promise<void> {
    const rowExisted = (await db.attachment.count({ where: { objectKey: key } })) > 0;
    this.deletions.push({ key, rowExisted });
    await super.delete(key);
  }

  reset(): void {
    this.files.clear();
    this.deletions.length = 0;
  }
}

export function uploadTo(
  c: Client,
  caseId: string,
  kind: 'PHOTO' | 'LOG',
  bytes: Uint8Array,
  name = 'file.bin',
  contentType?: string,
) {
  const q = `kind=${kind}&name=${encodeURIComponent(name)}`;
  return c.upload(`/api/v1/cases/${caseId}/attachments?${q}`, bytes, contentType);
}

export function uploadPdf(c: Client, bytes: Uint8Array, name = 'manuale.pdf') {
  return c.upload(
    `/api/v1/admin/attachments?name=${encodeURIComponent(name)}`,
    bytes,
    'application/pdf',
  );
}

/** id на CLEAN файл (иначе тестът пада с отговора). */
export async function cleanUpload(
  c: Client,
  caseId: string,
  kind: 'PHOTO' | 'LOG',
  bytes: Uint8Array,
  name?: string,
): Promise<string> {
  const res = await uploadTo(c, caseId, kind, bytes, name);
  if (res.status !== 201) throw new Error(`качването: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.attachment.id as string;
}

export async function signedUrl(c: Client, id: string): Promise<string> {
  const res = await c.get(`/api/v1/attachments/${id}/url`);
  if (res.status !== 200) throw new Error(`адресът: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.url as string;
}
