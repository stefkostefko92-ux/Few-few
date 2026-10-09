// Общото за административната конзола: сесията, способностите, обвивката около API-то,
// форматиране. Основното приложение се ползва само за четене/импорт (api.js, i18n.js, store.js).

import { api, ApiError } from '../api.js';
import { getLang } from '../i18n.js';
import { state } from '../store.js';

export { ApiError };

/** Кой е вписан и какво може; попълва се веднъж от main.js след GET /auth/me. */
export const me = { user: null, caps: new Set() };

/** Ролите, които конзолата познава; редът е и редът в падащите списъци. */
export const ROLES = [
  'PORTAL_TECHNICIAN',
  'INTERNAL_TECHNICIAN',
  'SUPPORT',
  'ENGINEERING',
  'KNOWLEDGE_OWNER',
  'TENANT_ADMIN',
  'PLATFORM_ADMIN',
];

/** Огледало на `roleRank` от сървъра — само за да скрием действия, които сървърът и без това отказва. */
export function roleRank(role) {
  return role === 'PLATFORM_ADMIN' ? 2 : role === 'TENANT_ADMIN' ? 1 : 0;
}

export function setSession(session) {
  me.user = session.user;
  me.caps = new Set(Array.isArray(session.capabilities) ? session.capabilities : []);
  state.user = session.user;
  state.csrf = session.csrfToken;
}

export const can = (capability) => me.caps.has(capability);

/** Втори фактор не е минат/настроен или сесията е изтекла: входът е в основното приложение. */
const LOGIN_CODES = new Set(['login_required', 'mfa_required', 'mfa_setup_required']);

export function goToLogin() {
  location.replace('/');
}

/** JSON към /api/v1 с пренасочване към входа при липсваща сесия/MFA. */
export async function call(method, path, body) {
  try {
    return await api(method, path, body);
  } catch (err) {
    if (err instanceof ApiError && err.code && LOGIN_CODES.has(err.code)) goToLogin();
    throw err;
  }
}

/** Низ за адреса от обект; празните стойности се пропускат. */
export function query(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Сурово тяло (PDF) — с бисквитката и CSRF, без JSON. Връща JSON отговора или хвърля ApiError. */
export async function uploadRaw(path, file) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': state.csrf ?? '', 'Content-Type': 'application/pdf' },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw withBody(new ApiError(res.status, data?.code, data?.error), data);
  return data;
}

/** Целият отговор за грешка (напр. `models`, `reason`, `issues`) — за подробно обяснение в UI. */
function withBody(err, body) {
  err.body = body;
  return err;
}

/** JSON като `call`, но грешката носи и тялото на отговора (`err.body`). */
export async function callDetailed(method, path, body) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': state.csrf ?? '',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = withBody(new ApiError(res.status, data?.code, data?.error), data);
    if (res.status === 401) goToLogin();
    throw err;
  }
  return data;
}

/** GET → файл за сваляне (JSON експорт). Blob адресът се освобождава веднага след клика. */
export async function downloadJson(path, filename) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new ApiError(res.status, data?.code, data?.error);
  }
  const blob = new Blob([await res.text()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Форматиране ──────────────────────────────────────────────────────────────────────────────

const dateTime = (opts) => new Intl.DateTimeFormat(getLang(), opts);

export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : dateTime({ dateStyle: 'medium' }).format(d);
}

export function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : dateTime({ dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Крайният час на избрания ден (локално) като ISO — срокът на акаунта важи през целия ден. */
export function endOfDayIso(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

/** Стойност за `<input type="date">` от ISO дата (локален ден). */
export function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayInput() {
  return toDateInput(new Date());
}

/** Обхват на фърмуера за показване: „4.0 – 4.9“, „от 5.0“, „—“. */
export function fwRange(min, max) {
  if (min && max) return `${min} – ${max}`;
  if (min) return `≥ ${min}`;
  if (max) return `≤ ${max}`;
  return '—';
}
