// Общото на раздела „Интеграция с helpdesk“: видовете, полетата по вид и превода на кодовете,
// които сървърът връща (грешки на доставката/теста — само кодове, никога текст от отсрещната страна).

import { has, t } from '../i18n.js';

export const KINDS = ['WEBHOOK', 'ZENDESK', 'JSM'];
export const LANGS = ['it', 'en'];
export const STATUSES = ['PENDING', 'SENDING', 'DELIVERED', 'SKIPPED', 'DEAD'];

/** Неповерителните полета по вид (влизат в `settings`). */
export const SETTINGS_FIELDS = {
  WEBHOOK: ['url'],
  ZENDESK: ['subdomain', 'authMode'],
  JSM: ['baseUrl', 'serviceDeskId', 'requestTypeId'],
};

/** Тайните по вид (само за запис); при Zendesk — според начина на удостоверяване. */
export function secretFields(kind, authMode) {
  if (kind === 'WEBHOOK') return ['signingSecret', 'inboundSecret'];
  if (kind === 'JSM') return ['email', 'apiToken', 'inboundSecret'];
  return authMode === 'api_token'
    ? ['email', 'apiToken', 'inboundSecret']
    : ['accessToken', 'inboundSecret'];
}

/** Тайните, които ChatChat може да генерира сам (HMAC ключовете; токените идват от helpdesk-а). */
export function canGenerate(kind, field) {
  return field === 'signingSecret' || (field === 'inboundSecret' && kind !== 'ZENDESK');
}

/** Името на поле (настройка или тайна) за етикет и за съобщението „липсват: …“. */
export const fieldLabel = (name) => t(`admin.integrations.field.${name}`);

/** Код от сървъра → преведен текст; непознатият се показва суров (никога не се крие). */
export function codeText(code) {
  if (!code) return '';
  const http = /^http_(\d{3})$/.exec(code);
  if (http) return t('helpdesk.err.http', { status: http[1] });
  return has(`helpdesk.err.${code}`) ? t(`helpdesk.err.${code}`) : code;
}

export const eventLabel = (type) =>
  has(`helpdesk.event.${type}`) ? t(`helpdesk.event.${type}`) : type;

/** Случаен HMAC ключ (32 байта, base64url) — генерира се в браузъра, сървърът не го връща. */
export function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
