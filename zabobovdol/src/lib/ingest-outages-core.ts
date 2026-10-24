import { timingSafeEqual } from "crypto";
import { z } from "zod";

// Чистата логика на вноса на прекъсвания на тока от ЕРМ Запад — без база и без
// мрежа, за да се тества (src/lib/__tests__/ingest-outages.test.ts). Свалянето и
// записът са в ingest-outages.ts (server-only).
//
// Източник (проверен на 23.10.2026): публичната карта „Справка аварии и
// планирани ремонти“ на ЕРМ Запад — https://info.ermzapad.bg/webint/vok/avplan.php?PLAN=FYI
// (бутонът „Планирани прекъсвания“ на https://ermzapad.bg/bg/za-klienta/prekusvania/).
// Самата страница прави POST към avplan.php с `action=draw&gm_obstina=<код>` и
// получава JSON: обект с ключове „1“, „2“… — по един запис на засегнат
// трафопост (ceo), с typedist („планирано“/„непланирано“), begin_event,
// end_event („дд.мм.гггг чч:мм“), city_name (с главни букви) и др.
// Когато в общината няма прекъсвания, отговорът е {"1":{"cities":""}}; при
// много заявки — текстът „tomuch“. Подробности: docs/outages-ingest.md.

export const ERM_SOURCE = "ЕРМ Запад";
export const ERM_HOST = "info.ermzapad.bg";
export const ERM_ENDPOINT = "https://info.ermzapad.bg/webint/vok/avplan.php";
// Страницата, която самата ЕРМ показва на хората (от нея се стига до картата).
export const ERM_PUBLIC_URL = "https://ermzapad.bg/bg/za-klienta/prekusvania/";
export const ERM_MAP_URL = "https://info.ermzapad.bg/webint/vok/avplan.php?PLAN=FYI";
// Код на община Бобов дол по ЕКАТТЕ (НСИ, nsi.bg/nrnm/ekatte/municipalities).
// ЕРМ ползва същите кодове (напр. SFO26 = Костинброд, PVN10 = Долна Митрополия).
export const ERM_MUNICIPALITY = "KNL04";
export const ERM_EXTERNAL_PREFIX = `erm:${ERM_MUNICIPALITY}:`;

// Над това отговорът не е „картата на една община“ — отказваме го.
export const MAX_RESPONSE_CHARS = 2_000_000;

// Населените места в община Бобов дол — по ЕКАТТЕ (НСИ, „Териториални единици“,
// obshtina = KNL04, 18 броя). Внасяме САМО прекъсвания в тях.
export type Settlement = { ekatte: string; kind: "гр." | "с."; name: string; label: string };

const RAW_SETTLEMENTS: ReadonlyArray<[string, "гр." | "с.", string]> = [
  ["04501", "гр.", "Бобов дол"],
  ["02049", "с.", "Бабино"],
  ["02052", "с.", "Бабинска река"],
  ["04371", "с.", "Блато"],
  ["15446", "с.", "Голема Фуча"],
  ["15535", "с.", "Големо село"],
  ["15457", "с.", "Голям Върбовник"],
  ["16242", "с.", "Горна Козница"],
  ["21974", "с.", "Долистово"],
  ["38635", "с.", "Коркина"],
  ["44210", "с.", "Локвата"],
  ["46262", "с.", "Мала Фуча"],
  ["46317", "с.", "Мали Върбовник"],
  ["46824", "с.", "Мало село"],
  ["48711", "с.", "Мламолово"],
  ["52297", "с.", "Новоселяне"],
  ["55364", "с.", "Паничарево"],
  ["83082", "с.", "Шатрово"],
];

export const BOBOV_DOL_SETTLEMENTS: readonly Settlement[] = RAW_SETTLEMENTS.map(
  ([ekatte, kind, name]) => ({ ekatte, kind, name, label: `${kind} ${name}` }),
);

/** „с.  Голема   фуча“ → „ГОЛЕМА ФУЧА“ (без „гр.“/„с.“/„град“/„село“). */
export function normalizeSettlement(s: string): string {
  return s
    .toLocaleUpperCase("bg-BG")
    .replace(/[ \s]+/g, " ")
    .trim()
    // „гр.“/„с.“ и без интервал след точката („ГР.БОБОВ ДОЛ“).
    .replace(/^(?:(?:ГР|С)\.\s*|(?:ГР|ГРАД|С|СЕЛО)\s+)/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

const BY_NAME = new Map(BOBOV_DOL_SETTLEMENTS.map((s) => [normalizeSettlement(s.name), s]));

export function findSettlement(cityName: string): Settlement | null {
  const key = normalizeSettlement(cityName ?? "");
  if (!key) return null;
  return BY_NAME.get(key) ?? null;
}

// --- Дати ---------------------------------------------------------------------
//
// В целия сайт времената на прекъсванията се пазят като „стенно“ време на
// София в UTC полетата: сървърът е TZ=UTC и админ формата записва
// datetime-local като UTC (виж src/lib/admin/format.ts). Внесените от ЕРМ
// записи следват същата конвенция, за да се показват еднакво с ръчните и да
// се редактират правилно в админа. Затова и „сега“ за сравнение е sofiaWallNow().

const DT_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** „23.10.2026 22:14“ → Date с UTC полета 2026-10-23 22:14 (стенно време на София). */
export function parseErmDateTime(s: string): Date | null {
  const m = DT_RE.exec((s ?? "").trim());
  if (!m) return null;
  const [d, mo, y, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, sec);
  const dt = new Date(t);
  // Отхвърля 31.02 и подобни (Date би ги „прехвърлил“ в следващия месец).
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return null;
  return dt;
}

/** Текущото стенно време на София, записано в UTC полета (за сравнение с startAt/endAt). */
export function sofiaWallNow(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

// Собствено изписване (а не Intl), за да е едно и също на всеки сървър/ICU.
function wallText(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} в ${hh}:${mm}`;
}

/** Час на прекъсване (стенно време в UTC полета) → „23 октомври в 22:14“. */
export function formatOutageTime(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return wallText(d);
}

/** Истински момент (напр. кога е проверено) → „23 октомври в 22:14“ по часа на София. */
export function formatSofiaInstant(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return wallText(sofiaWallNow(d));
}

// --- Разпознаване на отговора --------------------------------------------------

const RecordSchema = z
  .object({
    typedist: z.string(),
    begin_event: z.string(),
    end_event: z.string(),
    city_name: z.string(),
    ceo: z.string().optional().default(""),
  })
  .passthrough();

export type ErmRecord = z.infer<typeof RecordSchema>;

export type ErmParse =
  | { kind: "events"; records: ErmRecord[] }
  | { kind: "empty" }
  | { kind: "rate_limited" }
  | { kind: "unrecognized"; reason: string };

function isEmptyMarker(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === "cities" && (v as { cities: unknown }).cities === "";
}

// Строг разбор: всичко, което не е точно познатият формат, е „unrecognized“ —
// тогава вносът не записва и не затваря нищо (само се отбелязва грешка).
export function parseErmResponse(text: string): ErmParse {
  if (typeof text !== "string") return { kind: "unrecognized", reason: "not text" };
  if (text.length > MAX_RESPONSE_CHARS) return { kind: "unrecognized", reason: "too large" };
  const t = text.replace(/^﻿/, "").trim();
  if (!t) return { kind: "unrecognized", reason: "empty body" };
  if (t === "tomuch") return { kind: "rate_limited" };
  if (!t.startsWith("{")) return { kind: "unrecognized", reason: "not a JSON object" };

  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    return { kind: "unrecognized", reason: "invalid JSON" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { kind: "unrecognized", reason: "not a JSON object" };
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return { kind: "unrecognized", reason: "no entries" };
  if (!entries.every(([k]) => /^[1-9]\d{0,4}$/.test(k))) {
    return { kind: "unrecognized", reason: "unexpected keys" };
  }

  if (entries.length === 1 && isEmptyMarker(entries[0][1])) return { kind: "empty" };

  const records: ErmRecord[] = [];
  for (const [k, v] of entries.sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const r = RecordSchema.safeParse(v);
    if (!r.success) return { kind: "unrecognized", reason: `record ${k}: unexpected shape` };
    if (!parseErmDateTime(r.data.begin_event)) {
      return { kind: "unrecognized", reason: `record ${k}: bad begin_event` };
    }
    if (r.data.end_event.trim() && !parseErmDateTime(r.data.end_event)) {
      return { kind: "unrecognized", reason: `record ${k}: bad end_event` };
    }
    records.push(r.data);
  }
  return { kind: "events", records };
}

// --- От записи (по трафопост) към прекъсвания (по населено място) --------------

export type OutageDraft = {
  externalId: string;
  slug: string;
  utility: "ELECTRICITY";
  area: string;
  startAt: Date;
  endAt: Date | null;
  planned: boolean;
  note: string;
  source: string;
  sourceUrl: string;
  /** Брой засегнати трафопоста в населеното място. */
  stations: number;
};

export type DraftResult = {
  drafts: OutageDraft[];
  /** Записи извън община Бобов дол (не се внасят). */
  otherArea: number;
  otherAreaNames: string[];
  /** Записи с непознат тип (не „планирано“/„непланирано“) — пропуснати. */
  unknownType: number;
};

function typeOf(typedist: string): "p" | "u" | null {
  const v = typedist.trim().toLocaleLowerCase("bg-BG");
  if (v === "планирано") return "p";
  if (v === "непланирано") return "u";
  return null;
}

function stamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace(/[-T:]/g, "");
}

export function outageNote(stations: number): string {
  const tp = stations === 1 ? "1 трафопост" : `${stations} трафопоста`;
  return (
    `Спира токът в част или в цялото населено място (засегнати: ${tp}). ` +
    `Точните улици и обновеното време са на картата на ЕРМ Запад. ` +
    `Часът на края е очакван — може да се промени.`
  );
}

// Едно прекъсване = едно населено място + тип + начало. Ключът (externalId) НЕ
// включва края, защото ЕРМ го обновява — така нов край обновява записа, а не
// прави нов. Различните трафопостове с едно начало се сливат (по-лесно за
// четене от „5 еднакви картички“); краят е най-късният.
export function buildOutageDrafts(records: readonly ErmRecord[]): DraftResult {
  const groups = new Map<string, OutageDraft>();
  const other = new Set<string>();
  let otherArea = 0;
  let unknownType = 0;

  for (const r of records) {
    const settlement = findSettlement(r.city_name);
    if (!settlement) {
      otherArea++;
      if (r.city_name.trim()) other.add(r.city_name.trim().slice(0, 60));
      continue;
    }
    const tp = typeOf(r.typedist);
    if (!tp) {
      unknownType++;
      continue;
    }
    const startAt = parseErmDateTime(r.begin_event);
    if (!startAt) continue; // parseErmResponse вече го е проверил
    const endAt = r.end_event.trim() ? parseErmDateTime(r.end_event) : null;

    const key = `${settlement.ekatte}:${tp}:${stamp(startAt)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.stations++;
      if (endAt && (!existing.endAt || endAt > existing.endAt)) existing.endAt = endAt;
      existing.note = outageNote(existing.stations);
      continue;
    }
    groups.set(key, {
      externalId: `${ERM_EXTERNAL_PREFIX}${key}`,
      slug: `erm-${settlement.ekatte}-${tp}-${stamp(startAt)}`,
      utility: "ELECTRICITY",
      area: settlement.label,
      startAt,
      endAt,
      planned: tp === "p",
      note: outageNote(1),
      source: ERM_SOURCE,
      sourceUrl: ERM_PUBLIC_URL,
      stations: 1,
    });
  }

  const drafts = [...groups.values()].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime() || a.area.localeCompare(b.area, "bg"),
  );
  return { drafts, otherArea, otherAreaNames: [...other].slice(0, 10), unknownType };
}

// Заявката към ЕРМ вече е само за общината (gm_obstina=KNL04). Затова запис
// „извън общината“ или с непознат тип НЕ е шум в данните, а знак, че ЕРМ е
// сменила стойностите си (напр. „Планирано прекъсване“ или друго изписване на
// мястото). Тогава не знаем кои прекъсвания още текат: ако продължим, списъкът
// „видени“ остава непълен и вносът би затворил като „възстановени“ прекъсвания,
// при които токът още е спрян. Затова — като при непознат отговор: нищо не се
// записва и нищо не се затваря, отбелязва се грешка (fail closed).
/** Текст на грешката, ако групирането показва смяна на формата; иначе null. */
export function draftsFormatProblem(
  found: number,
  r: Pick<DraftResult, "otherArea" | "otherAreaNames" | "unknownType">,
): string | null {
  if (found <= 0 || (r.otherArea <= 0 && r.unknownType <= 0)) return null;
  const parts: string[] = [];
  if (r.unknownType > 0) parts.push(`${r.unknownType} с непознат тип`);
  if (r.otherArea > 0) {
    const names = r.otherAreaNames.length ? ` (${r.otherAreaNames.slice(0, 3).join(", ")})` : "";
    parts.push(`${r.otherArea} с непознато място${names}`);
  }
  return `Непознати стойности в отговора: ${parts.join("; ")} от ${found} записа.`;
}

// --- Флаг и достъп --------------------------------------------------------------

/** Вносът е ИЗКЛЮЧЕН по подразбиране — работи само при ERM_INGEST_ENABLED=1. */
export function isIngestEnabled(v: string | undefined): boolean {
  return v === "1";
}

/** Само „Authorization: Bearer <INGEST_TOKEN>“, сравнено в постоянно време. */
export function bearerMatches(header: string | null | undefined, token: string | undefined): boolean {
  if (!token) return false;
  const h = (header ?? "").trim();
  if (!/^bearer\s+/i.test(h)) return false;
  const provided = h.replace(/^bearer\s+/i, "").trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- Състояние на вноса (пази се като JSON в SiteSetting) ----------------------

export const STATUS_SETTING_KEY = "erm_ingest_status";
/** Над толкова без успешна проверка показваме „може да е остаряла“. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
/** Най-малко време между две извиквания към ЕРМ (пазим лимита им). */
export const MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Толкова грешки подред → имейл до админа (веднъж). */
export const ALERT_AFTER_FAILS = 2;

export type IngestCounts = { found: number; created: number; updated: number; closed: number };

export type IngestStatus = {
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  failStreak: number;
  lastError: string | null;
  lastCounts: IngestCounts | null;
};

const CountsSchema = z.object({
  found: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
});

const StatusSchema = z.object({
  lastAttemptAt: z.string().nullable(),
  lastOkAt: z.string().nullable(),
  failStreak: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  lastCounts: CountsSchema.nullable(),
});

const EMPTY_STATUS: IngestStatus = {
  lastAttemptAt: null,
  lastOkAt: null,
  failStreak: 0,
  lastError: null,
  lastCounts: null,
};

export function parseStatus(raw: string | null | undefined): IngestStatus {
  if (!raw) return { ...EMPTY_STATUS };
  try {
    const r = StatusSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : { ...EMPTY_STATUS };
  } catch {
    return { ...EMPTY_STATUS };
  }
}

export type IngestOutcome = { ok: true; counts: IngestCounts } | { ok: false; error: string };

export function nextStatus(prev: IngestStatus, outcome: IngestOutcome, now: Date): IngestStatus {
  const at = now.toISOString();
  if (outcome.ok) {
    return { lastAttemptAt: at, lastOkAt: at, failStreak: 0, lastError: null, lastCounts: outcome.counts };
  }
  return {
    ...prev,
    lastAttemptAt: at,
    failStreak: prev.failStreak + 1,
    lastError: outcome.error.slice(0, 200),
  };
}

/** Тревога точно веднъж — когато поредицата от грешки стигне прага. */
export function shouldAlert(s: IngestStatus): boolean {
  return s.failStreak === ALERT_AFTER_FAILS;
}

export function isStale(lastOkAt: string | null, now: Date, maxAgeMs = STALE_AFTER_MS): boolean {
  if (!lastOkAt) return true;
  const t = Date.parse(lastOkAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeMs;
}
