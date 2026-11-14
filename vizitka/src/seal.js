// Шифроване в покой (AES-256-GCM, ключ през HKDF) — за тайните в базата: 2FA тайната (totp.js) и
// ключа на SMTP сървъра (mailsettings.js). Всяка цел има собствен `info` за HKDF → собствен ключ:
// шифротекст от едната цел не се разшифрова като другата.
//
// Изходният ключ е ACCOUNT_SECRET, а ако го няма — PRINT_API_SECRET (задължителен в продукция).
// Шифротекстът носи етикет кой ключ е ползван (`v1a:` / `v1p:`), затова по-късното добавяне на
// ACCOUNT_SECRET не прави старите записи нечетими.
import crypto from 'node:crypto';

function keyFor(tag, info) {
  const source =
    tag === 'a' ? process.env.ACCOUNT_SECRET : tag === 'p' ? process.env.PRINT_API_SECRET : null;
  if (!source) return null;
  return Buffer.from(crypto.hkdfSync('sha256', source, 'vizitka', info, 32));
}
const activeTag = () =>
  process.env.ACCOUNT_SECRET ? 'a' : process.env.PRINT_API_SECRET ? 'p' : null;

export const sealAvailable = () => Boolean(activeTag());

export function seal(info, plain) {
  const tag = activeTag();
  if (!tag) throw new Error('Няма ключ за шифроване (ACCOUNT_SECRET/PRINT_API_SECRET).');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(tag, info), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1${tag}:${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')}`;
}

// null при грешен/липсващ ключ или подправен шифротекст — извикващият отказва (fail closed).
export function unseal(info, stored) {
  const m = /^v1([ap]):(.+)$/.exec(String(stored || ''));
  if (!m) return null;
  const key = keyFor(m[1], info);
  if (!key) return null;
  try {
    const raw = Buffer.from(m[2], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
