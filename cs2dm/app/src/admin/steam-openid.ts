import { z } from 'zod';

/**
 * Вход със Steam (OpenID 2.0, CONTRACT.md §10). Steam е единственият доставчик: адресът е твърд,
 * никога от вход. Отговорът се приема само след `check_authentication` (POST към Steam) — подписът
 * на Steam не се проверява локално, а от самия Steam, затова няма асоциации и тайни за пазене.
 */
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
/** Полетата, които Steam трябва да е подписал — иначе някое може да е подменено по пътя. */
const MUST_BE_SIGNED = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
];
/** Отговорът на Steam е валиден толкова дълго (и толкова часовниково разминаване търпим). */
export const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
const NONCE_MAX_FUTURE_MS = 60 * 1000;
export const STEAM_TIMEOUT_MS = 5000;

export function steamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

const responseSchema = z.object({
  'openid.ns': z.literal(NS),
  'openid.mode': z.literal('id_res'),
  'openid.op_endpoint': z.literal(STEAM_OPENID_ENDPOINT),
  'openid.claimed_id': z.string().regex(CLAIMED_ID),
  'openid.identity': z.string().regex(CLAIMED_ID),
  'openid.return_to': z.string().min(1).max(512),
  'openid.response_nonce': z
    .string()
    .max(255)
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/),
  'openid.assoc_handle': z.string().min(1).max(255),
  'openid.signed': z.string().min(1).max(512),
  'openid.sig': z.string().min(1).max(255),
});

export type SteamFailure =
  'malformed' | 'mismatch' | 'unsigned' | 'stale' | 'rejected' | 'unreachable';

export type SteamResult = { ok: true; steamId: string } | { ok: false; reason: SteamFailure };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Само полетата `openid.*` от отговора, точно както са дошли (за `check_authentication`). */
function openidFields(query: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {};
  const entries = Object.entries(query).filter(([key]) => key.startsWith('openid.'));
  if (entries.length > 40) return null;
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.length > 1024) return null;
    out[key] = value;
  }
  return out;
}

/** Отговорът на Steam е във формат key:value по редове (OpenID 2.0, 5.1.2). */
export function parseKeyValue(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const index = line.indexOf(':');
    if (index > 0) out[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  return out;
}

export async function verifySteamResponse(input: {
  query: Record<string, unknown>;
  expectedReturnTo: string;
  fetch: FetchLike;
  now: number;
}): Promise<SteamResult> {
  const fields = openidFields(input.query);
  const parsed = fields ? responseSchema.safeParse(fields) : null;
  if (!fields || !parsed?.success) return { ok: false, reason: 'malformed' };
  const data = parsed.data;

  const claimed = CLAIMED_ID.exec(data['openid.claimed_id']);
  if (!claimed || data['openid.identity'] !== data['openid.claimed_id']) {
    return { ok: false, reason: 'mismatch' };
  }
  // return_to трябва да е ТОЧНО нашият адрес с нашия еднократен nonce — иначе отговор, издаден за
  // друг сайт или друг опит за вход, би минал.
  if (data['openid.return_to'] !== input.expectedReturnTo) return { ok: false, reason: 'mismatch' };

  const signed = new Set(data['openid.signed'].split(','));
  if (!MUST_BE_SIGNED.every((field) => signed.has(field))) return { ok: false, reason: 'unsigned' };

  const issuedAt = Date.parse(data['openid.response_nonce'].slice(0, 20));
  if (
    !Number.isFinite(issuedAt) ||
    input.now - issuedAt > NONCE_MAX_AGE_MS ||
    issuedAt - input.now > NONCE_MAX_FUTURE_MS
  ) {
    return { ok: false, reason: 'stale' };
  }

  const body = new URLSearchParams({ ...fields, 'openid.mode': 'check_authentication' });
  let text: string;
  try {
    const response = await input.fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/plain',
      },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'unreachable' };
    text = (await response.text()).slice(0, 4096);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  const answer = parseKeyValue(text);
  if (answer.ns !== NS || answer.is_valid !== 'true') return { ok: false, reason: 'rejected' };
  return { ok: true, steamId: claimed[1]! };
}
