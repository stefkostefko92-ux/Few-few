import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { keyBuffer } from '../crypto.js';

/**
 * Каталогът от магазините е в репото само шифрован: `sealed/catalog.json.enc` (AES-256-GCM върху
 * gzip-нат JSON). Ключът `CATALOG_KEY` е само в .env на сървъра — без него файлът е безполезен, затова
 * репото може да е публично. Формат: „RDC1“ | iv (12) | tag (16) | шифрован текст; „RDC1“ влиза и в
 * удостоверените данни на GCM, значи подменен префикс също не минава.
 */
export const SEALED_CATALOG = 'sealed/catalog.json.enc';

const MAGIC = Buffer.from('RDC1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEAD = MAGIC.length + IV_BYTES + TAG_BYTES;

export function sealCatalog(json: string, hexKey: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(hexKey), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, 'utf8'))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** JSON текстът на каталога. Грешен ключ, подменен или повреден файл → грешка, никога празен каталог. */
export function openSealedCatalog(sealed: Buffer, hexKey: string): string {
  if (sealed.length <= HEAD || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('шифрованият каталог е с непознат формат');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBuffer(hexKey),
    sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(sealed.subarray(MAGIC.length + IV_BYTES, HEAD));
  let zipped: Buffer;
  try {
    zipped = Buffer.concat([decipher.update(sealed.subarray(HEAD)), decipher.final()]);
  } catch {
    throw new Error('каталогът не се разшифрова — грешен CATALOG_KEY или повреден файл');
  }
  return gunzipSync(zipped).toString('utf8');
}
