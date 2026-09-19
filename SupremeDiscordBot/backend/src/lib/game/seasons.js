// backend/src/lib/game/seasons.js
// v50 — Server Season: сезоните живеят в базата (game_seasons), не в кода —
// собственикът ги управлява от админ конзолата (routes/adminOps.js → Season).
// „Текущ“ = най-новият със startsAt ≤ сега, иначе най-ранният предстоящ.
// Празна таблица → S1 по подразбиране се записва при първо четене (seed).
// Кеш 60 s — сезонът се чете при всяка поява/списък; админ промяна го инвалидира.
import { prisma } from "../prisma.js";
import { DEFAULT_SEASON, COMPANIONS, seasonActive } from "./companions.js";

export const SEASON_CACHE_TTL_MS = 60 * 1000;
export const SEASON_CODE = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;
const CATALOG_IDS = new Set(COMPANIONS.map((c) => c.id));

let cache = { season: null, at: 0 };

export function invalidateSeasonCache() { cache = { season: null, at: 0 }; }

/** Плоското публично представяне (id = code за съвместимост с таблото/бота). */
export function publicSeason(row, now = new Date()) {
  if (!row) return null;
  return {
    id: row.code, code: row.code, name: row.name,
    startsAt: row.startsAt, endsAt: row.endsAt,
    companionIds: [...(row.companionIds || [])],
    active: seasonActive(now, row),
    ended: now >= new Date(row.endsAt),
  };
}

/** Кой е текущият сред подадените редове (чиста функция — тестваема). */
export function pickCurrent(rows, now = new Date()) {
  const sorted = [...(rows || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  if (!sorted.length) return null;
  const started = sorted.filter((r) => new Date(r.startsAt) <= now);
  return started.length ? started[started.length - 1] : sorted[0];
}

export async function listSeasons() {
  return (await prisma.gameSeason.findMany({ orderBy: { startsAt: "desc" }, take: 100 })) || [];
}

/** Текущият сезон (с кеш). Празна таблица → записва S1 и го връща. */
export async function getCurrentSeason({ now = new Date(), fresh = false } = {}) {
  if (!fresh && cache.season && Date.now() - cache.at < SEASON_CACHE_TTL_MS) return cache.season;
  let rows = await listSeasons();
  if (!rows.length) {
    let seeded = null;
    try {
      seeded = await prisma.gameSeason.upsert({
        where: { code: DEFAULT_SEASON.code },
        update: {},
        create: { code: DEFAULT_SEASON.code, name: DEFAULT_SEASON.name, startsAt: new Date(DEFAULT_SEASON.startsAt), endsAt: new Date(DEFAULT_SEASON.endsAt), companionIds: [...DEFAULT_SEASON.companionIds] },
      });
    } catch { /* надпревара при първо четене или недостъпна база → seed-ът в паметта */ }
    rows = [seeded || { ...DEFAULT_SEASON, startsAt: new Date(DEFAULT_SEASON.startsAt), endsAt: new Date(DEFAULT_SEASON.endsAt), companionIds: [...DEFAULT_SEASON.companionIds] }];
  }
  const season = pickCurrent(rows, now);
  cache = { season, at: Date.now() };
  return season;
}

/** Последният ПРИКЛЮЧИЛ сезон (за затварянето в season.js). */
export async function latestEndedSeason(now = new Date()) {
  const rows = await listSeasons();
  const ended = rows.filter((r) => new Date(r.endsAt) <= now).sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt));
  return ended[0] || null;
}

/** Валидация, обща за create/update. Връща { ok, error } без да пипа базата. */
export function validateSeasonInput({ code, name, startsAt, endsAt, companionIds }, { requireCode = true } = {}) {
  if (requireCode && !SEASON_CODE.test(String(code || ""))) return { ok: false, error: "code: A–Z, 0–9, _ или -, до 16 знака (напр. S2)" };
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 80)) return { ok: false, error: "name: 1–80 знака" };
  const s = startsAt !== undefined ? new Date(startsAt) : null;
  const e = endsAt !== undefined ? new Date(endsAt) : null;
  if (s && Number.isNaN(s.getTime())) return { ok: false, error: "startsAt: невалидна дата" };
  if (e && Number.isNaN(e.getTime())) return { ok: false, error: "endsAt: невалидна дата" };
  if (s && e && e <= s) return { ok: false, error: "endsAt трябва да е след startsAt" };
  if (companionIds !== undefined) {
    if (!Array.isArray(companionIds) || companionIds.length > COMPANIONS.length) return { ok: false, error: "companionIds: списък от id-та от каталога" };
    const unknown = companionIds.filter((id) => !CATALOG_IDS.has(id));
    if (unknown.length) return { ok: false, error: `companionIds: непознати — ${unknown.slice(0, 5).join(", ")}` };
    if (new Set(companionIds).size !== companionIds.length) return { ok: false, error: "companionIds: дублирани id-та" };
  }
  return { ok: true };
}

export async function createSeason({ code, name, startsAt, endsAt, companionIds = [] }) {
  const v = validateSeasonInput({ code, name, startsAt, endsAt, companionIds });
  if (!v.ok) return { ok: false, code: "INVALID", error: v.error };
  try {
    const row = await prisma.gameSeason.create({ data: { code, name: name.trim(), startsAt: new Date(startsAt), endsAt: new Date(endsAt), companionIds } });
    invalidateSeasonCache();
    return { ok: true, season: row };
  } catch (err) {
    if (err?.code === "P2002") return { ok: false, code: "DUPLICATE", error: `Сезон с код ${code} вече съществува` };
    throw err;
  }
}

export async function updateSeason(code, patch) {
  const existing = await prisma.gameSeason.findUnique({ where: { code } });
  if (!existing) return { ok: false, code: "NOT_FOUND", error: "Няма такъв сезон" };
  const merged = { startsAt: patch.startsAt ?? existing.startsAt, endsAt: patch.endsAt ?? existing.endsAt, name: patch.name, companionIds: patch.companionIds };
  const v = validateSeasonInput(merged, { requireCode: false });
  if (!v.ok) return { ok: false, code: "INVALID", error: v.error };
  const data = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.startsAt !== undefined) data.startsAt = new Date(patch.startsAt);
  if (patch.endsAt !== undefined) data.endsAt = new Date(patch.endsAt);
  if (patch.companionIds !== undefined) data.companionIds = patch.companionIds;
  const row = await prisma.gameSeason.update({ where: { code }, data });
  invalidateSeasonCache();
  return { ok: true, season: row };
}
