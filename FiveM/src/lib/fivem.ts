/**
 * Чисти функции около FiveM сървърите — нула мрежа, нула Prisma.
 * Мрежовата част е в `fivem-query.ts` (Node runtime, SSRF защита).
 *
 * Всичко, което идва от чужд сървър (`hostname`, `vars`, имена на ресурси),
 * е НЕДОВЕРЕНИ ДАННИ, не инструкции: санира се тук, преди да стигне до базата
 * или до React.
 */

import { z } from 'zod';

/** Портът по подразбиране на FiveM сървър. */
export const DEFAULT_FIVEM_PORT = 30120;

// ── Цветни кодове ───────────────────────────────────────────────────────────

/**
 * Маха оцветяването от `hostname`: `^1..^9` (FiveM/Quake стил) и `~r~`
 * (GTA текстови маркери). Свива и повторните интервали.
 */
export function stripColorCodes(input: string): string {
  return input
    .replace(/\^[0-9]/g, '')
    .replace(/~[a-z]{1,3}~/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Чисто име за показване: без цветни кодове, без управляващи символи, с
 * таван на дължината (за да не разбие оформлението). Ако след чистенето не
 * остане нищо, връща резервния текст.
 */
export function displayName(raw: string | null | undefined, fallback = 'Без име'): string {
  if (!raw) return fallback;
  // Управляващите символи падат нарочно — идват от чужд сървър.
  const cleaned = stripColorCodes(raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // Нулево-широки и двупосочни маркери: с тях чуждо име може да обърне
    // реда на текста наоколо или да се престори на друго.
    .replace(/[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  return cleaned.slice(0, 80) || fallback;
}

// ── Cfx.re join код ─────────────────────────────────────────────────────────

/** Кодът е кратък base32-подобен низ; приемаме само буквено-цифрен. */
const JOIN_CODE_RE = /^[a-z0-9]{4,12}$/i;

/**
 * Изважда join кода от каквото е поднесъл собственикът на сървъра:
 * `abcd12`, `cfx.re/join/abcd12`, `https://cfx.re/join/abcd12/`.
 * Връща `null`, ако не е валиден код.
 */
export function parseCfxJoinCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/(?:^|\/\/)(?:www\.)?cfx\.re\/join\/([a-z0-9]+)/i);
  const candidate = fromUrl ? fromUrl[1] : trimmed;
  return JOIN_CODE_RE.test(candidate) ? candidate.toLowerCase() : null;
}

/** Публичният линк за присъединяване. */
export function cfxJoinUrl(code: string): string {
  return `https://cfx.re/join/${code}`;
}

/** Директният протоколен линк, който отваря клиента на играча. */
export function fivemConnectUrl(addressOrCode: string): string {
  return `fivem://connect/${addressOrCode}`;
}

// ── Адрес „host:port“ ───────────────────────────────────────────────────────

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export type ServerAddress = { host: string; port: number };

/**
 * Нормализира въведен адрес до `{ host, port }`. Приема `1.2.3.4`,
 * `1.2.3.4:30120`, `rp.example.com:30120`. Връща `null` при невалиден вход.
 * IPv6 не се приема (не се среща при FiveM листингите и усложнява guard-а).
 */
export function parseServerAddress(input: string | null | undefined): ServerAddress | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!trimmed) return null;

  const [hostPart, portPart, ...rest] = trimmed.split(':');
  if (rest.length > 0) return null;

  let port = DEFAULT_FIVEM_PORT;
  if (portPart !== undefined) {
    if (!/^\d{1,5}$/.test(portPart)) return null;
    port = Number(portPart);
    if (port < 1 || port > 65535) return null;
  }

  const host = hostPart.toLowerCase();
  if (!isValidIpv4(host) && !HOSTNAME_RE.test(host)) return null;
  return { host, port };
}

export function formatServerAddress(address: ServerAddress): string {
  return `${address.host}:${address.port}`;
}

export function isValidIpv4(host: string): boolean {
  const m = host.match(IPV4_RE);
  if (!m) return false;
  // Водещите нули се отхвърлят нарочно: „0177.0.0.1“ се тълкува от някои
  // резолвери като октално и сочи към 127.0.0.1 — класическо заобикаляне на
  // SSRF филтър.
  return m.slice(1).every((octet) => {
    const n = Number(octet);
    return n >= 0 && n <= 255 && String(n) === octet;
  });
}

/**
 * Частен/локален/резервиран IPv4 — такъв адрес НИКОГА не се пингва.
 * Това е SSRF защитата: адресът идва от външен подател, а нашият сървър е в
 * частна мрежа с достъпни съседи (база, метаданни на облака).
 */
export function isPrivateIpv4(host: string): boolean {
  if (!isValidIpv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local (метаданни на облака)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

// ── Endpoint-и на сървъра ───────────────────────────────────────────────────

/** Трите публични endpoint-а, които всеки FiveM сървър излага. */
export function serverEndpoints(address: ServerAddress) {
  const base = `http://${formatServerAddress(address)}`;
  return {
    info: `${base}/info.json`,
    dynamic: `${base}/dynamic.json`,
    /** НЕ се ползва: връща имена и identifiers на играчи (лични данни). */
    players: `${base}/players.json`,
  };
}

// ── Схеми на отговорите ─────────────────────────────────────────────────────

/**
 * `/info.json` — метаданни (полетата са сверени срещу `InfoHttpHandler.cpp` в
 * citizenfx/fivem). Всичко е по избор: сървърите мълчат или лъжат.
 */
export const infoJsonSchema = z
  .object({
    server: z.string().optional(),
    version: z.coerce.number().optional(),
    enhancedHostSupport: z.boolean().optional(),
    requestSteamTicket: z.string().optional(),
    enforceSteamAuth: z.boolean().optional(),
    icon: z.string().optional(),
    resources: z.array(z.string()).optional(),
    vars: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/** `/dynamic.json` — живото състояние. */
export const dynamicJsonSchema = z
  .object({
    hostname: z.string().optional(),
    clients: z.coerce.number().int().min(0).optional(),
    sv_maxclients: z.coerce.number().int().min(0).optional(),
    gametype: z.string().optional(),
    mapname: z.string().optional(),
    iv: z.coerce.number().optional(),
  })
  .passthrough();

export type InfoJson = z.infer<typeof infoJsonSchema>;
export type DynamicJson = z.infer<typeof dynamicJsonSchema>;

// ── Класификация на отговора ────────────────────────────────────────────────

export type ProbeOutcome = 'ONLINE' | 'OFFLINE' | 'HIDDEN' | 'UNREACHABLE';

export type ProbeBody =
  | { kind: 'json'; value: unknown }
  /** `sv_requestParanoia >= 2` → сървърът връща текст „Nope.“ вместо JSON. */
  | { kind: 'hidden' }
  | { kind: 'invalid' };

/**
 * Разграничава трите отговора, които реално се срещат: валиден JSON, скрит
 * endpoint („Nope.“) и боклук. Скрит ≠ офлайн — сървърът работи, просто
 * собственикът е вдигнал `sv_requestParanoia`; ако ги слеем, показваме
 * „офлайн“ на жив сървър.
 */
export function classifyProbeBody(raw: string): ProbeBody {
  const text = raw.trim();
  if (!text) return { kind: 'invalid' };
  if (/^nope\.?$/i.test(text)) return { kind: 'hidden' };
  try {
    return { kind: 'json', value: JSON.parse(text) };
  } catch {
    return { kind: 'invalid' };
  }
}

// ── Разпознаване на рамка ───────────────────────────────────────────────────

export type FrameworkId = 'ESX' | 'QBCORE' | 'QBOX' | 'OX_CORE' | 'STANDALONE' | 'UNKNOWN';

/**
 * Маркерите са ИМЕНА НА РЕСУРСИ — надеждни са само точните имена на ядрата.
 * `ox_lib`, `oxmysql`, `es_extended`-подобни ползват всички, затова не са
 * маркер сами по себе си (ox_lib върви и с QBCore, и с ESX).
 * Редът има значение: Qbox форк-ва QBCore, затова се проверява първи.
 */
const FRAMEWORK_MARKERS: ReadonlyArray<readonly [FrameworkId, readonly string[]]> = [
  ['QBOX', ['qbx_core']],
  ['OX_CORE', ['ox_core']],
  ['QBCORE', ['qb-core']],
  ['ESX', ['es_extended']],
];

/**
 * Разпознава рамката от `resources[]` на `/info.json`.
 * Връща `UNKNOWN`, когато няма ясен маркер — по-добре празно, отколкото
 * грешно (сървърите се сърдят повече на грешен етикет, отколкото на липсващ).
 */
export function detectFramework(resources: readonly string[] | undefined): FrameworkId {
  if (!resources || resources.length === 0) return 'UNKNOWN';
  const set = new Set(resources.map((r) => r.toLowerCase()));
  for (const [id, markers] of FRAMEWORK_MARKERS) {
    if (markers.some((m) => set.has(m))) return id;
  }
  return 'UNKNOWN';
}

/** Етикетът, който показваме на потребителя. */
export const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  ESX: 'ESX',
  QBCORE: 'QBCore',
  QBOX: 'Qbox',
  OX_CORE: 'ox_core',
  STANDALONE: 'Собствена рамка',
  UNKNOWN: 'Неизвестна',
};

// ── Обобщение на пингa ──────────────────────────────────────────────────────

export type ServerStatus = {
  outcome: ProbeOutcome;
  online: boolean;
  players: number;
  maxPlayers: number;
  hostname: string | null;
  framework: FrameworkId;
};

/**
 * Сглобява статуса от двата отговора. Толерантно към липсващи полета —
 * `dynamic.json` е източникът за живото състояние, `info.json` за рамката.
 */
export function buildStatus(
  info: InfoJson | null,
  dynamic: DynamicJson | null,
  outcome: ProbeOutcome = dynamic ? 'ONLINE' : 'OFFLINE',
): ServerStatus {
  const framework = detectFramework(info?.resources);
  if (!dynamic || outcome !== 'ONLINE') {
    return { outcome, online: false, players: 0, maxPlayers: 0, hostname: null, framework };
  }
  const maxPlayers = clampCount(dynamic.sv_maxclients ?? 0);
  // Твърдият таван важи ВИНАГИ. `Math.min(x, cap || MAX_SAFE_INTEGER)` се
  // самоизключва, щом чуждият сървър пропусне `sv_maxclients` (falsy 0 отваря
  // безкрайния клон) — и `clients: 999999999999` препълва Postgres int4,
  // което сваля целия cron пробег, не само този сървър.
  const players = Math.min(clampCount(dynamic.clients ?? 0), maxPlayers || MAX_PLAYER_COUNT);
  return {
    outcome: 'ONLINE',
    online: true,
    players,
    maxPlayers,
    hostname: dynamic.hostname ? displayName(dynamic.hostname) : null,
    framework,
  };
}

/**
 * Таванът на всяка бройка от чужд сървър. FiveM поддържа до 2048 слота;
 * всичко над това е грешка или лъжа, а не рекорд.
 */
export const MAX_PLAYER_COUNT = 2048;

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.trunc(value), MAX_PLAYER_COUNT);
}

/** „7/64 играчи“, „статусът е скрит“ или „офлайн“. */
export function formatPlayers(
  status: Pick<ServerStatus, 'outcome' | 'players' | 'maxPlayers'>,
): string {
  switch (status.outcome) {
    case 'ONLINE':
      return `${status.players}/${status.maxPlayers || '?'} играчи`;
    case 'HIDDEN':
      return 'статусът е скрит';
    case 'UNREACHABLE':
      return 'няма отговор';
    default:
      return 'офлайн';
  }
}
