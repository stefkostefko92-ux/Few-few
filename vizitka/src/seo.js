// SEO: robots.txt, sitemap.xml и JSON-LD за публичните визитки.
import db from './db.js';

// Данни на доставчика (импресум) — както в medqr.
export const COMPANY = {
  name: 'Carbon Stealth VCC',
  legalForm: 'дружество с променлив капитал (VCC)',
  url: 'https://carbonstealth.eu',
  uic: '208725180', // ЕИК
  vat: 'BG208725180', // ДДС №
  address: 'ул. „Самуил“ 3, 2670 Бобов дол, България',
  manager: 'Стефан Костадинов',
  email: 'info@carbonstealth.eu',
  privacyEmail: 'privacy@carbonstealth.eu',
  securityEmail: 'security@carbonstealth.eu',
  phone: '+359 877 414 874',
};

export function robotsTxt(base) {
  return [
    'User-agent: *',
    'Disallow: /dashboard',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /photo/',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Статичните страници + публичните визитки (публикувани по избор на потребителя).
export function sitemapXml(base) {
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/privacy`, priority: '0.3' },
    { loc: `${base}/terms`, priority: '0.3' },
  ];
  const profiles = db
    .prepare('SELECT slug, updated_at FROM profiles WHERE is_public = 1 ORDER BY updated_at DESC')
    .all();
  for (const p of profiles) {
    urls.push({
      loc: `${base}/p/${p.slug}`,
      lastmod: p.updated_at.slice(0, 10),
      priority: '0.7',
    });
  }
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${xmlEsc(u.loc)}</loc>` +
        (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
        `<priority>${u.priority}</priority></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// JSON-LD (schema.org Person/Organization) за публичната визитка.
export function cardJsonLd(profile, publicUrl, base) {
  const data = {
    '@context': 'https://schema.org',
    '@type': profile.type === 'company' ? 'Organization' : 'Person',
    name: profile.display_name,
    url: publicUrl,
  };
  if (profile.type === 'personal' && profile.headline) data.jobTitle = profile.headline;
  if (profile.type === 'personal' && profile.company)
    data.worksFor = { '@type': 'Organization', name: profile.company };
  if (profile.type === 'company' && profile.headline) data.description = profile.headline;
  if (profile.phone) data.telephone = profile.phone;
  if (profile.contact_email) data.email = profile.contact_email;
  if (profile.address) data.address = profile.address;
  if (profile.photo) data.image = `${base}/photo/${profile.photo}`;
  const sameAs = [profile.website, profile.facebook, profile.instagram, profile.linkedin].filter(
    Boolean
  );
  if (sameAs.length) data.sameAs = sameAs;
  return JSON.stringify(data);
}
