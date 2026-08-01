/**
 * Публичният списък със сървъри на Cfx.re — откриване на българските сървъри
 * без някой да ги подава.
 *
 * ВНИМАНИЕ, две неща, които струват време, ако се научат по трудния начин:
 *  1. Старият `servers-frontend.fivem.net` е **мъртъв** (404 за всичко, с
 *     всякакви хедъри). Живият е `frontend.cfx-services.net` — намерен в
 *     бъндъла на `servers.fivem.net`, не в документация. Значи договорът е
 *     НЕофициален и може да се счупи без предупреждение → всичко тук е
 *     защитно, а провалът е мек.
 *  2. Потокът връща `content-type: application/json`, но тялото е двоично:
 *     кадри `[4-байтова LE дължина][protobuf съобщение]`. `JSON.parse` върху
 *     него хвърля — това не е грешка в мрежата, а грешно очакване.
 */

import {
  all,
  asMessage,
  asNumber,
  asString,
  decodeMessage,
  first,
  readFrames,
  type Fields,
} from './protobuf';

export const CFX_API_BASE = 'https://frontend.cfx-services.net/api/servers';

/**
 * Номерата на полетата в `ServerData`. Схемата не е публикувана — сверена е
 * байт по байт срещу `single/<id>` (който е чист JSON) и кръстосано срещу
 * отворената схема на `cfx-api`. Непознато поле се игнорира, затова добавка от
 * тяхна страна не ни чупи.
 */
const FIELD = {
  svMaxclients: 1,
  clients: 2,
  hostname: 4,
  gametype: 5,
  mapname: 6,
  resources: 8,
  server: 9,
  iconVersion: 11,
  vars: 12,
  connectEndPoints: 18,
} as const;

/** Външното съобщение: `{ EndPoint = 1, Data = 2 }`. */
const OUTER = { endPoint: 1, data: 2 } as const;

export type CfxServer = {
  /** Cfx идентификаторът (той е и join кодът: `cfx.re/join/<endPoint>`). */
  endPoint: string;
  hostname: string;
  clients: number;
  maxClients: number;
  gametype?: string;
  mapname?: string;
  resources: string[];
  vars: Record<string, string>;
  iconVersion?: number;
  connectEndPoints: string[];
};

function readVars(fields: Fields): Record<string, string> {
  const vars: Record<string, string> = {};
  // map<string,string> в protobuf е повторено съобщение { key = 1, value = 2 }.
  for (const entry of all(fields, FIELD.vars)) {
    const pair = asMessage(entry);
    if (!pair) continue;
    const key = asString(first(pair, 1));
    const value = asString(first(pair, 2));
    if (key !== undefined && value !== undefined) vars[key] = value;
  }
  return vars;
}

/** Декодира един кадър. Връща `null`, ако записът е неизползваем. */
export function parseServerFrame(frame: Uint8Array): CfxServer | null {
  let outer: Fields;
  try {
    outer = decodeMessage(frame);
  } catch {
    return null;
  }

  const endPoint = asString(first(outer, OUTER.endPoint));
  const data = asMessage(first(outer, OUTER.data));
  if (!endPoint || !data) return null;

  const hostname = asString(first(data, FIELD.hostname));
  if (!hostname) return null;

  return {
    endPoint,
    hostname,
    clients: asNumber(first(data, FIELD.clients)) ?? 0,
    maxClients: asNumber(first(data, FIELD.svMaxclients)) ?? 0,
    gametype: asString(first(data, FIELD.gametype)),
    mapname: asString(first(data, FIELD.mapname)),
    resources: all(data, FIELD.resources)
      .map((entry) => asString(entry))
      .filter((value): value is string => Boolean(value)),
    vars: readVars(data),
    iconVersion: asNumber(first(data, FIELD.iconVersion)),
    connectEndPoints: all(data, FIELD.connectEndPoints)
      .map((entry) => asString(entry))
      .filter((value): value is string => Boolean(value)),
  };
}

export function* parseServerStream(buf: Uint8Array): Generator<CfxServer> {
  for (const frame of readFrames(buf)) {
    const server = parseServerFrame(frame);
    if (server) yield server;
  }
}

// ── Кой сървър е български ──────────────────────────────────────────────────

const BULGARIA_WORD = /\bbulgaria\b|\bbulgarian\b|българ|българия/i;

/**
 * Разпознаването е ОБЕДИНЕНИЕ, не пресичане, и това е измерено, не усетено:
 * в реален снапшот от 33 824 сървъра 126 обявяват `locale = bg-BG`, а 55 се
 * хващат по име/етикет — но само 49 са и в двете, тоест филтър само по
 * `locale` изпуска 6 истински български сървъра.
 *
 * `root-AQ` е служебната стойност по подразбиране (близо една трета от целия
 * списък) — не е държава и никога не значи нищо.
 */
export function isBulgarian(server: CfxServer): boolean {
  const locale = server.vars.locale?.trim().toLowerCase();
  if (locale === 'bg-bg' || locale === 'bg') return true;

  const haystack = [
    server.hostname,
    server.vars.sv_projectName,
    server.vars.sv_projectDesc,
    server.vars.tags,
  ]
    .filter(Boolean)
    .join(' ');

  // ВНИМАНИЕ: кирилицата НЕ е признак за български сървър и „ъ/щ/ь“ също не са
  // (руският и украинският ги имат). Измерено на живо: този евристичен ред
  // вкарваше ru-RU и uk-UA сървъри в българския списък. Остават само двата
  // сигнала, които наистина значат България — обявеният локал и изричната
  // дума в името/описанието/етикетите.
  return BULGARIA_WORD.test(haystack);
}

/** Иконата на сървъра. `iconVersion` идва от записа — не е константа. */
export function serverIconUrl(server: CfxServer): string | null {
  if (server.iconVersion === undefined) return null;
  return `${CFX_API_BASE}/icon/${server.endPoint}/${server.iconVersion}.png`;
}

// ── Мрежа ───────────────────────────────────────────────────────────────────

const USER_AGENT = 'FiveMBulgaria/1.0 (+https://fivembulgaria.carbonstealth.eu)';

/** Пълният снапшот е около 19 MB — таванът е с голям запас, но го има. */
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

/**
 * Тегли пълния списък и връща само българските. Договорът е неофициален,
 * затова провалът е мек: празен масив, не изключение — cron-ът не бива да
 * пада, а вече откритите сървъри си остават в базата.
 *
 * Приличие: снапшотът е тежък. Тегли се на 30–60 минути, не по-често, и
 * НИКОГА при заявка на посетител.
 */
export async function fetchBulgarianServers(timeoutMs = 60_000): Promise<CfxServer[]> {
  let buf: Uint8Array;
  try {
    const res = await fetch(`${CFX_API_BASE}/streamRedir/`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[cfx] списъкът върна ${res.status}`);
      await res.body?.cancel();
      return [];
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
      console.error('[cfx] снапшотът е над тавана — пропуснат');
      return [];
    }
    buf = new Uint8Array(bytes);
  } catch (error) {
    console.error('[cfx] тегленето на списъка се провали', error);
    return [];
  }

  const found: CfxServer[] = [];
  for (const server of parseServerStream(buf)) {
    if (isBulgarian(server)) found.push(server);
  }
  return found;
}
