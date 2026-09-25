// vCard 3.0 — „Запази контакта“ директно в телефонния указател.
// ВАЖНО: екранира се ВСЯКА форма на нов ред — включително самостоятелен `\r`.
// Пропуснатият CR позволяваше инжекция: стойност с `\r` разцепваше файла и
// добавяше втори, изцяло контролиран от подателя контакт в указателя на посетителя.
const esc = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|[\r\n]/g, '\\n')
    .replace(/[,;]/g, (m) => `\\${m}`);

// RFC 2426: редовете се сгъват на 75 ОКТЕТА (не знака); продължението започва с
// интервал. Кирилицата е 2 байта/знак, затова броенето по знаци даваше двойно
// по-дълги редове; рязането по кодови точки пази емоджи да не се счупи наполовина.
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let current = '';
  let limit = 75; // първият ред е 75; продълженията са 74 + водещия интервал
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > limit) {
      parts.push(current);
      current = ch;
      limit = 74;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.map((p, i) => (i === 0 ? p : ' ' + p)).join('\r\n');
}

const PHOTO_TYPE = { jpg: 'JPEG', png: 'PNG', webp: 'WEBP' };

export function buildVCard(profile, baseUrl, photo = null) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const isCompany = profile.type === 'company';

  lines.push(`FN:${esc(profile.display_name)}`);
  if (isCompany) {
    lines.push(`ORG:${esc(profile.display_name)}`);
    lines.push('X-ABShowAs:COMPANY');
  } else {
    // Опростено разделяне: последната дума → фамилия.
    const parts = profile.display_name.trim().split(/\s+/);
    const family = parts.length > 1 ? parts.pop() : '';
    lines.push(`N:${esc(family)};${esc(parts.join(' '))};;;`);
    if (profile.company) lines.push(`ORG:${esc(profile.company)}`);
  }
  if (profile.headline) lines.push(`TITLE:${esc(profile.headline)}`);
  if (profile.phone) lines.push(`TEL;TYPE=CELL:${esc(profile.phone)}`);
  if (profile.contact_email) lines.push(`EMAIL;TYPE=INTERNET:${esc(profile.contact_email)}`);
  if (profile.website) lines.push(`URL:${esc(profile.website)}`);
  if (profile.address) lines.push(`ADR;TYPE=WORK:;;${esc(profile.address)};;;;`);
  if (profile.bio) lines.push(`NOTE:${esc(profile.bio)}`);
  // Снимката се вгражда base64 (работи офлайн, без заявка към сървъра).
  if (photo?.buffer?.length) {
    const type = PHOTO_TYPE[photo.ext] || 'JPEG';
    lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${photo.buffer.toString('base64')}`);
  } else if (profile.photo) {
    lines.push(`PHOTO;VALUE=URI:${baseUrl}/photo/${profile.photo}`);
  }
  lines.push(`URL;TYPE=Vizitka:${baseUrl}/p/${profile.slug}`);
  lines.push(`REV:${new Date().toISOString()}`);
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n') + '\r\n';
}
