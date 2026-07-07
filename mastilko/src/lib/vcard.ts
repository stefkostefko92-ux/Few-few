// vCard 3.0 за QR кода на визитките — сканираш и контактът влиза в телефона.
// Чиста функция (тестваема с node:test).

export interface VCardData {
  name: string;
  role?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
}

/** Екранира , ; \ и нови редове по RFC 2426. */
function esc(s: string): string {
  return s.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
}

export function vCard(d: VCardData): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(d.name)}`];
  if (d.role) lines.push(`TITLE:${esc(d.role)}`);
  if (d.company) lines.push(`ORG:${esc(d.company)}`);
  if (d.phone) lines.push(`TEL;TYPE=CELL:${esc(d.phone)}`);
  if (d.email) lines.push(`EMAIL:${esc(d.email)}`);
  if (d.website) {
    const url = /^https?:\/\//i.test(d.website)
      ? d.website
      : `https://${d.website}`;
    lines.push(`URL:${esc(url)}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
