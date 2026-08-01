/**
 * Мрежовият слой към чуждите FiveM сървъри. САМО Node runtime (ползва `dns`).
 *
 * Три правила, които не се нарушават:
 *  1. **SSRF** — адресът идва от външен подател, затова хостът се резолвира,
 *     проверява се, и заявката отива към **проверения IP**, не към името.
 *     (`fetch(host)` резолвира ВТОРИ път при connect — предварителна проверка
 *     на името не се пренася върху заявката. Това е DNS rebinding и е
 *     доказано с PoC: guard-ът вижда 8.8.8.8, fetch отива на 127.0.0.1.)
 *  2. **Таван на всичко** — таймаут И поточно четене с броене на байтовете.
 *     `(await res.text()).slice(0, CAP)` НЕ е таван: буферира цялото тяло,
 *     преди да реже (измерено: 40 MB за 315 ms).
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
  type DynamicJson,
  type InfoJson,
  type ProbeOutcome,
  type ServerAddress,
  type ServerStatus,
} from './fivem';

/** Таван на тялото — 512 KB стигат; `info.json` на голям сървър е ~100 KB. */
export const MAX_BODY_BYTES = 512 * 1024;

const USER_AGENT = 'FiveMBulgaria/1.0 (+https://fivembulgaria.carbonstealth.eu)';

function timeoutMs(): number {
  const raw = Number(process.env.FIVEM_PING_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}

/**
 * Резолвира хоста и връща **проверения IPv4**, към който да се направи
 * заявката. Проверяват се ВСИЧКИ върнати адреса: DNS може да върне и публичен,
 * и частен — иначе остава дупка.
 *
 * Връща IP (а не `void`) нарочно: викащият трябва да ползва точно този адрес,
 * за да няма втора резолюция между проверката и заявката.
 */
export async function resolvePublicIpv4(host: string): Promise<string> {
  if (isValidIpv4(host)) {
    if (isPrivateIpv4(host)) throw new Error(`Частен адрес не се пингва: ${host}`);
    return host;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error(`Хостът не се резолвира: ${host}`);
  for (const record of records) {
    if (record.family === 6) throw new Error(`IPv6 не се поддържа: ${host}`);
    if (!isValidIpv4(record.address) || isPrivateIpv4(record.address)) {
      throw new Error(`Хостът сочи към частна мрежа: ${host} → ${record.address}`);
    }
  }
  return records[0].address;
}

type FetchOutcome =
  | { kind: 'json'; value: unknown }
  | { kind: 'hidden' }
  | { kind: 'unreachable' };

/**
 * Чете тялото поточно и прекъсва в мига, в който надхвърли тавана. Връща
 * `null`, ако сървърът е препълнил тавана — недоверен източник не бива да
 * решава колко памет ще заемем.
 */
export async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Една заявка към чужд сървър. `ip` е вече проверен; `hostHeader` носи
 * оригиналното име, за да работят сървърите зад vhost.
 */
async function fetchProbe(ip: string, port: number, path: string, hostHeader: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(`http://${ip}:${port}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { host: hostHeader, 'user-agent': USER_AGENT, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { kind: 'unreachable' };
    }

    const declared = Number(res.headers.get('content-length'));
    // Внимание: `Number(null) === 0` — затова проверката важи само когато
    // хедърът реално присъства. Истинският таван е в readCapped.
    if (res.headers.has('content-length') && Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      await res.body?.cancel();
      return { kind: 'unreachable' };
    }

    const text = await readCapped(res);
    if (text === null) return { kind: 'unreachable' };

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
  if (!address) return { ...offline('UNREACHABLE'), address: rawAddress };

  const formatted = formatServerAddress(address);
  let ip: string;
  try {
    ip = await resolvePublicIpv4(address.host);
  } catch {
    return { ...offline('UNREACHABLE'), address: formatted };
  }

  const [dynamicRes, infoRes] = await Promise.all([
    fetchProbe(ip, address.port, '/dynamic.json', formatted),
    fetchProbe(ip, address.port, '/info.json', formatted),
  ]);

  // Скритият endpoint значи жив сървър с вдигнат `sv_requestParanoia`, а не
  // мъртъв сървър. Решава го само `dynamic.json` — ако той е дал данни, а е
  // скрит само `info.json`, показваме реалните числа и рамка UNKNOWN.
  if (dynamicRes.kind === 'hidden') return { ...offline('HIDDEN'), address: formatted };
  if (dynamicRes.kind === 'unreachable') return { ...offline('OFFLINE'), address: formatted };

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

function safeParse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } },
  value: unknown,
): T | null {
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
 * връщаме `null`, а модераторът въвежда адреса ръчно. Ползва се САМО от
 * модераторския път, никога от cron-а — обемът е част от добросъвестността.
 */
export async function resolveJoinCode(code: string): Promise<ServerAddress | null> {
  try {
    const res = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${code}`, {
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const text = await readCapped(res);
    if (text === null) return null;
    const body: unknown = JSON.parse(text);
    for (const endpoint of readConnectEndPoints(body)) {
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
