// Google Wallet — „generic" визитна карта. Даваме подписан JWT за бутона
// „Запази в Google Wallet"; при промяна PATCH-ваме обекта и то се разпространява до
// запазилите го устройства. Подписване RS256 през node:crypto; API токен през
// JWT-bearer grant. Без външни зависимости (Node 20 има глобален fetch).
import crypto from 'node:crypto';
import { getLinks } from '../links.js';
import {
  cardBgHex,
  googleServiceAccount,
  googleIssuerId,
  googleClassId,
  googleEnabled,
} from './shared.js';

const SAVE_BASE = 'https://pay.google.com/gp/v/save/';
const API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

const b64url = (s) => Buffer.from(s).toString('base64url');

function signRs256(header, payload, privateKey) {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  return `${data}.${sig}`;
}

const objectId = (slug) => `${googleIssuerId()}.${slug.replace(/[^\w.-]/g, '_')}`;

// Дефиниция на класа (създава се при първото запазване през JWT).
function genericClass() {
  return { id: googleClassId(), classTemplateInfo: {} };
}

// Обектът за конкретна визитка.
function genericObject(profile, base) {
  const cardUrl = `${base}/p/${profile.slug}`;
  const text = [];
  if (profile.headline) text.push({ id: 'headline', header: 'Позиция', body: profile.headline });
  if (profile.company) text.push({ id: 'company', header: 'Фирма', body: profile.company });
  if (profile.phone) text.push({ id: 'phone', header: 'Телефон', body: profile.phone });
  if (profile.contact_email)
    text.push({ id: 'email', header: 'Имейл', body: profile.contact_email });

  const uris = [{ uri: cardUrl, description: 'Онлайн визитка' }];
  if (profile.website) uris.push({ uri: profile.website, description: 'Уебсайт' });
  if (profile.phone) uris.push({ uri: `tel:${profile.phone}`, description: 'Обади се' });
  if (profile.contact_email)
    uris.push({ uri: `mailto:${profile.contact_email}`, description: 'Имейл' });
  for (const l of getLinks(profile.id)) uris.push({ uri: l.url, description: l.label });

  return {
    id: objectId(profile.slug),
    classId: googleClassId(),
    state: 'ACTIVE',
    hexBackgroundColor: cardBgHex(profile),
    logo: { sourceUri: { uri: `${base}/logo.png` } },
    cardTitle: { defaultValue: { language: 'bg', value: 'Vizitka' } },
    header: { defaultValue: { language: 'bg', value: profile.display_name } },
    ...(profile.headline
      ? { subheader: { defaultValue: { language: 'bg', value: profile.headline } } }
      : {}),
    textModulesData: text,
    linksModuleData: { uris },
    barcode: { type: 'QR_CODE', value: cardUrl, alternateText: profile.slug },
  };
}

// URL за бутона „Запази в Google Wallet".
export function googleSaveUrl(profile, base) {
  const sa = googleServiceAccount();
  const claims = {
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [base],
    payload: { genericClasses: [genericClass()], genericObjects: [genericObject(profile, base)] },
  };
  const jwt = signRs256({ alg: 'RS256', typ: 'JWT' }, claims, sa.private_key);
  return SAVE_BASE + jwt;
}

// --- Auto-update: PATCH на обекта (разпространява се до запазилите го устройства) --
let accessToken = null;
let accessAt = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && now - accessAt < 3000) return accessToken;
  const sa = googleServiceAccount();
  const assertion = signRs256(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token грешка: ${res.status}`);
  const j = await res.json();
  accessToken = j.access_token;
  accessAt = now;
  return accessToken;
}

// Обновява вече запазения обект. Ако още не е запазван (404) — тихо пропуска.
export async function patchGoogleObject(profile, base) {
  if (!googleEnabled()) return;
  const token = await getAccessToken();
  const id = objectId(profile.slug);
  const res = await fetch(`${API_BASE}/genericObject/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(genericObject(profile, base)),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Google PATCH грешка: ${res.status}`);
}
