/**
 * Мрежовият слой към чуждите FiveM сървъри. САМО Node runtime (ползва `dns`).
 *
 * Три правила, които не се нарушават:
 *  1. **SSRF** — адресът идва от външен подател, затова се резолвира и всяко
 *     получено IP се проверява срещу частните диапазони ПРЕДИ заявката.
 *  2. **Таймаут на всичко** — чужд сървър може да държи връзката вечно.
 *  3. **`players.json` не се пипа** — връща имена и identifiers (steam:/
 *     license:/discord:) на реални хора. Нужна ни е само бройката, а тя е в
 *     `dynamic.json`.
 */

import { lookup } from 'node:dns/promises';

import {
  buildStatus,
  classifyProbeBody,
  dynamicJsonSchema,
  formatServerAddress,
  infoJsonSchema,
  isPrivateIpv4,
  isValidIpv4,
  parseServerAddress,
  serverEndpoints,
  type DynamicJson,
  type InfoJson,
  type ProbeOutcome,
  type ServerAddress,
  type ServerStatus,
} from './fivem';

/** Таван на тялото — 512 KB стигат; `info.json` на голям сървър е ~100 KB. */
const MAX_BODY_BYTES = 512 * 1024;

const USER_AGENT = 'FiveMBulgaria/1.0 (+https://fivembulgaria.carbonstealth.eu)';

function timeoutMs(): number {
  const raw = Number(process.env.FIVEM_PING_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}

/**
 * Резолвира хоста и отказва, ако сочи към частна/локална мрежа.
 * Проверяват се ВСИЧКИ върнати адреса (DNS може да върне и публичен, и
 * частен — иначе остава дупка за rebinding в момента на заявката).
 */
export async function assertPublicHost(host: string): Promise<void> {
  if (isValidIpv4(host)) {
    if (isPrivateIpv4(host)) throw new Error(`Частен адрес не се пингва: ${host}`);
    return;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error(`Хостът не се резолвира: ${host}`);
  for (const record of records) {
    if (record.family === 6) throw new Error(`IPv6 не се поддържа: ${host}`);
    if (isPrivateIpv4(record.address)) {
      throw new Error(`Хостът сочи към частна мрежа: ${host} → ${record.address}`);
    }
  }
}

type FetchOutcome =
  | { kind: 'json'; value: unknown }
  | { kind: 'hidden' }
  | { kind: 'unreachable' };

async function fetchProbe(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { kind: 'unreachable' };

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { kind: 'unreachable' };

    const text = (await res.text()).slice(0, MAX_BODY_BYTES);
    const body = classifyProbeBody(text);
    if (body.kind === 'hidden') return { kind: 'hidden' };
    if (body.kind === 'invalid') return { kind: 'unreachable' };
    return { kind: 'json', value: body.value };
  } catch {
    // Таймаут, отказана връзка, DNS, TLS — за нас е едно и също: няма отговор.
    return { kind: 'unreachable' };
  }
}

export type ProbeResult = ServerStatus & { address: string };

/**
 * Пингва един сървър. Никога не хвърля — статусът на чужда машина не е
 * причина да падне цялото опресняване.
 */
export async function probeServer(rawAddress: string): Promise<ProbeResult> {
  const address = parseServerAddress(rawAddress);
  if (!address) {
    return { ...offline('UNREACHABLE'), address: rawAddress };
  }
  const formatted = formatServerAddress(address);
  try {
    await assertPublicHost(address.host);
  } catch {
    return { ...offline('UNREACHABLE'), address: formatted };
  }

  const endpoints = serverEndpoints(address);
  const [dynamicRes, infoRes] = await Promise.all([
    fetchProbe(endpoints.dynamic),
    fetchProbe(endpoints.info),
  ]);

  // Скритият endpoint значи жив сървър с вдигнат `sv_requestParanoia`,
  // а не мъртъв сървър — не го показваме като „офлайн“.
  if (dynamicRes.kind === 'hidden' || infoRes.kind === 'hidden') {
    return { ...offline('HIDDEN'), address: formatted };
  }
  if (dynamicRes.kind === 'unreachable') {
    return { ...offline('OFFLINE'), address: formatted };
  }

  const dynamic = safeParse<DynamicJson>(dynamicJsonSchema, dynamicRes.value);
  const info = infoRes.kind === 'json' ? safeParse<InfoJson>(infoJsonSchema, infoRes.value) : null;
  return { ...buildStatus(info, dynamic), address: formatted };
}

function offline(outcome: ProbeOutcome): ServerStatus {
  return {
    outcome,
    online: false,
    players: 0,
    maxPlayers: 0,
    hostname: null,
    framework: 'UNKNOWN',
  };
}

function safeParse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? (parsed.data as T) : null;
}

// ── Cfx.re join код → адрес ─────────────────────────────────────────────────

/**
 * Резолвира `cfx.re/join/<code>` към „host:port“.
 *
 * ВНИМАНИЕ: endpoint-ът `servers-frontend.fivem.net` е **неофициален** и
 * недокументиран от CFX — може да смени формата си без предупреждение.
 * Затова четенето е защитно (всяко поле е по избор) и провалът е мек:
 * връщаме `null`, а модераторът въвежда адреса ръчно.
 */
export async function resolveJoinCode(code: string): Promise<ServerAddress | null> {
  try {
    const res = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${code}`, {
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const connectEndPoints = readConnectEndPoints(body);
    for (const endpoint of connectEndPoints) {
      const parsed = parseServerAddress(endpoint);
      if (parsed && !isPrivateIpv4(parsed.host)) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Защитно четене на `Data.connectEndPoints[]` без да вярваме на формата. */
function readConnectEndPoints(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const data = (body as { Data?: unknown }).Data;
  if (typeof data !== 'object' || data === null) return [];
  const endpoints = (data as { connectEndPoints?: unknown }).connectEndPoints;
  if (!Array.isArray(endpoints)) return [];
  return endpoints.filter((e): e is string => typeof e === 'string');
}
