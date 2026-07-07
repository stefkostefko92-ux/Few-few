// vCard 3.0 — „Запази контакта“ директно в телефонния указател.
const esc = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (m) => `\\${m}`);

export function buildVCard(profile, baseUrl) {
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
  if (profile.photo) lines.push(`PHOTO;VALUE=URI:${baseUrl}/photo/${profile.photo}`);
  lines.push(`URL;TYPE=Vizitka:${baseUrl}/p/${profile.slug}`);
  lines.push(`REV:${new Date().toISOString()}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
