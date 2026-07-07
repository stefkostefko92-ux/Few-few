// vCard 3.0 — „Запази контакта“ директно в телефонния указател.
const esc = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (m) => `\\${m}`);

// RFC 2426: редовете се сгъват на ~75 октета; продължението започва с интервал.
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
  return parts.join('\r\n');
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
