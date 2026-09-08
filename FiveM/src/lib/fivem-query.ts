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
 *  3. **От `players.json` се четат САМО имената.** Отговорът съдържа и
 *     `identifiers` (`steam:`/`license:`/`discord:`/`ip:`) — трайни
 *     идентификатори през услуги. Те не се четат, не се предават нататък и
 *     нямат поле в схемата; `readPlayerNames` връща низове и нищо друго.
 *     Дърпа се само при `withPlayers` и само след като сървърът е отговорил
 *     жив. Това е единственият вход на ЛИЧНИ ДАННИ от чужд сървър — режимът
 *     му е описан в `/privacy`.
 */

import { lookup } from 'node:dns/promises';

import { CFX_API_BASE } from './cfx';

import {
  buildStatus,
  classifyProbeBody,
  dynamicJsonSchema,
  formatServerAddress,
  infoJsonSchema,
  isPrivateIpv4,
  isPrivatePlaceholder,
  isValidIpv4,
  parseServerAddress,
  readPlayerNames,
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

  /**
   * IPv6 записите се ПРОПУСКАТ, не отхвърлят хоста. Разликата е измерена: по
   * 40 реални FiveM хоста 10 бяха отказвани САМО защото имат AAAA — всеки зад
   * Cloudflare е двустеков. Тоест старото `if (family === 6) throw` правеше
   * четвърт от живите сървъри вечно „няма отговор“.
   *
   * Сигурността не страда: ние никога не се свързваме по IPv6, защото връщаме
   * IPv4 адрес и заявката отива към него. AAAA запис, до който не отиваме, не
   * е SSRF вектор.
   */
  const ipv4 = records.filter((record) => record.family === 4);
  if (ipv4.length === 0) throw new Error(`Хостът има само IPv6, а IPv6 не се поддържа: ${host}`);

  // ВСЕКИ IPv4 се проверява, не само първият: DNS може да върне и публичен, и
  // частен адрес, а вторият пробег би хванал другия ред.
  for (const record of ipv4) {
    if (!isValidIpv4(record.address) || isPrivateIpv4(record.address)) {
      throw new Error(`Хостът сочи към частна мрежа: ${host} → ${record.address}`);
    }
  }
  return ipv4[0].address;
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
 * Една заявка към чужд сървър. `ip` е вече проверен.
 *
 * ВНИМАНИЕ, `hostHeader` НЕ работи и това е измерено, не предположено:
 * undici (fetch-ът на Node 22) МАХА зададения `host` хедър и слага Host от
 * URL-а, тоест чуждият сървър вижда `Host: <ip>:<port>`. Обявената по-рано
 * „поддръжка на vhost“ не съществува. Оставяме го подаден, защото не вреди, но
 * НЕ разчитай на него: сървър, който маршрутизира по име, ще отговори с
 * грешния vhost или с 404.
 *
 * Поправката, ако някога потрябва, е `node:http.request({ headers: { Host } })`
 * — той изпраща хедъра. Днес не е нужна: FiveM сървърите слушат на IP:порт.
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

export type ProbeResult = ServerStatus & {
  address: string;
  /**
   * Имената на играчите онлайн, или `null` когато не знаем (сървърът е скрил
   * `players.json`, отговорил е с боклук, или изобщо не сме питали).
   *
   * `null` и `[]` НЕ са едно и също и точно затова е nullable: празен масив
   * значи „проверено, няма никого“, а `null` — „нямаме видимост“. Слеем ли ги,
   * страницата ще твърди „никой не играе“ за сървър, който просто не ни казва.
   */
  playerNames: string[] | null;
};

/**
 * Пингва един сървър. Никога не хвърля — статусът на чужда машина не е
 * причина да падне цялото опресняване.
 */
export async function probeServer(
  rawAddress: string,
  { withPlayers = false }: { withPlayers?: boolean } = {},
): Promise<ProbeResult> {
  const address = parseServerAddress(rawAddress);
  if (!address) return { ...offline('UNREACHABLE'), address: rawAddress, playerNames: null };

  const formatted = formatServerAddress(address);
  let ip: string;
  try {
    ip = await resolvePublicIpv4(address.host);
  } catch {
    return { ...offline('UNREACHABLE'), address: formatted, playerNames: null };
  }

  const [dynamicRes, infoRes] = await Promise.all([
    fetchProbe(ip, address.port, '/dynamic.json', formatted),
    fetchProbe(ip, address.port, '/info.json', formatted),
  ]);

  // Скритият endpoint значи жив сървър с вдигнат `sv_requestParanoia`, а не
  // мъртъв сървър. Решава го само `dynamic.json` — ако той е дал данни, а е
  // скрит само `info.json`, показваме реалните числа и рамка UNKNOWN.
  if (dynamicRes.kind === 'hidden')
    return { ...offline('HIDDEN'), address: formatted, playerNames: null };
  if (dynamicRes.kind === 'unreachable')
    return { ...offline('OFFLINE'), address: formatted, playerNames: null };

  const dynamic = safeParse<DynamicJson>(dynamicJsonSchema, dynamicRes.value);
  const info = infoRes.kind === 'json' ? safeParse<InfoJson>(infoJsonSchema, infoRes.value) : null;

  // `players.json` се дърпа ЧАК СЛЕД като знаем, че сървърът е жив — трета
  // заявка към мъртъв адрес е чист хазарт с чуждия и с нашия ресурс. Той е и
  // най-голямото от трите тела, затова не върви в `Promise.all` по-горе.
  let playerNames: string[] | null = null;
  if (withPlayers) {
    const res = await fetchProbe(ip, address.port, '/players.json', formatted);
    // Скрит или счупен → `null` („не знаем“), никога `[]` („няма никого“).
    playerNames = res.kind === 'json' ? readPlayerNames(res.value) : null;
  }

  return { ...buildStatus(info, dynamic), address: formatted, playerNames };
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
 * ВНИМАНИЕ: `servers-frontend.fivem.net` е **МЪРТЪВ** и този код го биеше.
 * Измерено с реален join код (`j4r9zmk`, взет от живия списък) на 01.08.2026:
 * старият хост връща `404 not found`, а `frontend.cfx-services.net` връща 200
 * с `Data.connectEndPoints`. Тоест функцията винаги връщаше `null` и сървър,
 * подаден само с cfx код, никога не получаваше адрес — оттам и мигането
 * онлайн/офлайн. Същият хост е и в `cfx.ts`; един източник, не два.
 *
 * Договорът остава неофициален и недокументиран, затова четенето е защитно
 * (всяко поле е по избор) и провалът е мек: `null`, а модераторът въвежда
 * адреса ръчно. Ползва се САМО от модераторския път, никога от cron-а.
 */
export async function resolveJoinCode(code: string): Promise<ServerAddress | null> {
  try {
    const res = await fetch(`${CFX_API_BASE}/single/${encodeURIComponent(code)}`, {
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
      // `isPrivatePlaceholder` ПРЕДИ парсването: заместителят на Cfx за
      // „private“ сървър се парсва като напълно валиден адрес, а
      // `isPrivateIpv4` не го лови (измерено — за име връща `false`). Без този
      // ред функцията връщаше `private-placeholder.cfx.re:30120` като истински
      // адрес и го заключваше в базата.
      if (isPrivatePlaceholder(endpoint)) continue;
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
