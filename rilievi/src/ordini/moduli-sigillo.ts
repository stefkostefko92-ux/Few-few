import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Модулите на доставчиците са в публичното репо само шифровани (собственикът, 26 ноември 2026 — „Направи
 * всичко възможно да няма бъдещи спорове“): `assets/moduli/sigillati/<файл>.enc`, AES-256-GCM. Ключът
 * `MODULI_KEY` е само в .env на сървъра и при собственика — без него файлът е безполезен. Формат: „RIM1“ | iv
 * (12) | tag (16) | шифрован текст. В удостоверените данни на GCM влизат „RIM1“ и името на файла: подменен
 * префикс или шифрован файл на друг модул не се отварят.
 */
const MAGIC = Buffer.from('RIM1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEAD = MAGIC.length + IV_BYTES + TAG_BYTES;

/** Ключът: 32 байта в hex. */
export const CHIAVE_MODULI = /^[0-9a-fA-F]{64}$/;

function chiave(hex: string): Buffer {
  if (!CHIAVE_MODULI.test(hex)) throw new Error('MODULI_KEY трябва да е 64 hex знака (32 байта)');
  return Buffer.from(hex, 'hex');
}

const aad = (nome: string) => Buffer.concat([MAGIC, Buffer.from(nome, 'utf8')]);

export function sigillaModulo(pdf: Uint8Array, chiaveHex: string, nome: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', chiave(chiaveHex), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(nome));
  const corpo = Buffer.concat([cipher.update(pdf), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), corpo]);
}

/** Празният PDF на модула. Грешен ключ, друго име, подменен или повреден файл → грешка, никога нещо друго. */
export function apriModulo(sigillato: Uint8Array, chiaveHex: string, nome: string): Buffer {
  const k = chiave(chiaveHex);
  const s = Buffer.from(sigillato.buffer, sigillato.byteOffset, sigillato.byteLength);
  if (s.length <= HEAD || !s.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error(`${nome}: непознат формат на шифрования модул`);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    k,
    s.subarray(MAGIC.length, MAGIC.length + IV_BYTES),
    {
      authTagLength: TAG_BYTES,
    },
  );
  decipher.setAAD(aad(nome));
  decipher.setAuthTag(s.subarray(MAGIC.length + IV_BYTES, HEAD));
  try {
    return Buffer.concat([decipher.update(s.subarray(HEAD)), decipher.final()]);
  } catch {
    throw new Error(`${nome}: модулът не се отваря — грешен MODULI_KEY или повреден файл`);
  }
}
