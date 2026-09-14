// Печатен handoff към Мастилко (mastilko-bg.com) — безплатно ателие в браузъра, където
// потребителят САМ оформя и си разпечатва визитката (ние не печатаме, няма поръчка).
// Vizitka подписва кратко-живеещ токен; Мастилко вика нашето API, за да изтегли
// структурираните данни на визитката и да попълни редактора вместо потребителя.
import crypto from 'node:crypto';
import { getLinks } from './links.js';

const prod = process.env.NODE_ENV === 'production';

// Партньорският печатен сайт (може да се смени през env без промяна в кода).
export const MASTILKO_URL = (process.env.MASTILKO_URL || 'https://mastilko-bg.com').replace(
  /\/+$/,
  ''
);

// Споделената тайна подписва handoff токена. В продукция е задължителна; иначе
// работи с тайна за текущата сесия (mint + verify са в същия процес) с warning.
const SECRET =
  process.env.PRINT_API_SECRET ||
  (prod
    ? (() => {
        throw new Error('PRINT_API_SECRET е задължителна в продукция (печатен handoff).');
      })()
    : (console.warn(
        '[Vizitka] PRINT_API_SECRET липсва — ползвам временна тайна (само за разработка).'
      ),
      crypto.randomBytes(32).toString('hex')));

const TTL_SECONDS = 30 * 60; // токенът важи 30 минути

export function signToken(slug, ttl = TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const data = `${slug}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${Buffer.from(slug).toString('base64url')}.${exp}.${sig}`;
}

export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [b64slug, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  let slug;
  try {
    slug = Buffer.from(b64slug, 'base64url').toString();
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', SECRET).update(`${slug}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { slug };
}

// URL, към който пращаме потребителя (mastilko après чете token-а и вика API-то).
export function mastilkoHandoffUrl(slug) {
  return `${MASTILKO_URL}/import?source=vizitka&token=${encodeURIComponent(signToken(slug))}`;
}

// Структурираните данни на визитката за печатната обработка.
export function buildPrintPayload(profile, base) {
  return {
    source: 'vizitka',
    version: 1,
    slug: profile.slug,
    card_url: `${base}/p/${profile.slug}`,
    qr_url: `${base}/p/${profile.slug}/qr.png`,
    vcard_url: `${base}/p/${profile.slug}/vizitka.vcf`,
    type: profile.type,
    display_name: profile.display_name,
    headline: profile.headline,
    company: profile.company,
    phone: profile.phone,
    email: profile.contact_email,
    website: profile.website,
    address: profile.address,
    bio: profile.bio,
    socials: {
      facebook: profile.facebook,
      instagram: profile.instagram,
      linkedin: profile.linkedin,
    },
    links: getLinks(profile.id).map((l) => ({ icon: l.icon, label: l.label, url: l.url })),
    style: {
      theme: profile.theme,
      accent: profile.accent,
      avatar_shape: profile.avatar_shape,
      font: profile.font,
    },
    photo_url: profile.photo ? `${base}/photo/${profile.photo}` : null,
    cover_url: profile.cover ? `${base}/photo/${profile.cover}` : null,
    generated_at: new Date().toISOString(),
  };
}
