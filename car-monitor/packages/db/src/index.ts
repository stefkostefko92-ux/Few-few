// @car-monitor/db — типове на редовете и заявки върху D1 (по модела на @sigma/db).
// Explorer-ът чете директно от D1 през тези помощни функции.

import type {
  HomeTotals,
  Paged,
  SearchHit,
  VehicleDetail,
  VehicleEvent,
  VehicleListItem,
  ListingsQuery,
  SellerDetail,
  ModelDetail,
} from "@car-monitor/api-contract";
import type { RiskLevel, QualityFlag } from "@car-monitor/shared";

// --- Минимален структурен D1 интерфейс (за да не зависим от types пакета) ---
export interface D1Result<T = unknown> {
  results: T[];
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

const PAGE_SIZE = 24;

// --- Начална страница ----------------------------------------------------

export async function getHomeTotals(db: D1Database): Promise<HomeTotals> {
  const row = await db
    .prepare(
      `SELECT vehicles, listings, active_listings, sellers, red_vehicles,
              median_price_eur, as_of
       FROM home_totals WHERE id = 1`,
    )
    .first<{
      vehicles: number;
      listings: number;
      active_listings: number;
      sellers: number;
      red_vehicles: number;
      median_price_eur: number | null;
      as_of: string | null;
    }>();
  return {
    vehicles: row?.vehicles ?? 0,
    listings: row?.listings ?? 0,
    activeListings: row?.active_listings ?? 0,
    sellers: row?.sellers ?? 0,
    redVehicles: row?.red_vehicles ?? 0,
    medianPriceEur: row?.median_price_eur ?? null,
    asOf: row?.as_of ?? null,
  };
}

// --- Листинг на автомобили с филтри (фасети) -----------------------------

export async function listVehicles(
  db: D1Database,
  query: ListingsQuery,
): Promise<Paged<VehicleListItem>> {
  const page = Math.max(1, query.page ?? 1);
  const where: string[] = ["v.status != 'archived'"];
  const params: unknown[] = [];

  if (query.make) {
    where.push("v.make = ?");
    params.push(query.make);
  }
  if (query.fuel) {
    where.push("v.fuel_type = ?");
    params.push(query.fuel);
  }
  if (query.yearMin != null) {
    where.push("v.model_year >= ?");
    params.push(query.yearMin);
  }
  if (query.yearMax != null) {
    where.push("v.model_year <= ?");
    params.push(query.yearMax);
  }
  if (query.priceMax != null) {
    where.push("v.latest_price_eur <= ?");
    params.push(query.priceMax);
  }
  if (query.risk) {
    where.push("v.risk_level = ?");
    params.push(query.risk);
  }

  const orderBy =
    query.sort === "price_asc"
      ? "v.latest_price_eur ASC"
      : query.sort === "newest"
        ? "v.last_seen DESC"
        : "v.latest_price_eur DESC";

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM vehicles v ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `SELECT v.id, v.make, v.model, v.model_year, v.latest_mileage_km,
              v.latest_price_eur, s.settlement AS settlement, v.risk_level
       FROM vehicles v
       LEFT JOIN sellers s ON s.id = v.current_seller_id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<{
      id: string;
      make: string | null;
      model: string | null;
      model_year: number | null;
      latest_mileage_km: number | null;
      latest_price_eur: number | null;
      settlement: string | null;
      risk_level: RiskLevel;
    }>();

  return {
    items: rows.results.map((r) => ({
      id: r.id,
      make: r.make,
      model: r.model,
      modelYear: r.model_year,
      mileageKm: r.latest_mileage_km,
      priceEur: r.latest_price_eur,
      settlement: r.settlement,
      riskLevel: r.risk_level,
    })),
    total: totalRow?.n ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

// --- Профил на автомобил с пълна времева линия ---------------------------

export async function getVehicle(db: D1Database, id: string): Promise<VehicleDetail | null> {
  const v = await db
    .prepare(
      `SELECT v.*, s.id AS s_id, s.name AS s_name, s.kind AS s_kind, s.settlement AS s_settlement
       FROM vehicles v
       LEFT JOIN sellers s ON s.id = v.current_seller_id
       WHERE v.id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!v) return null;

  const events = await db
    .prepare(
      `SELECT id, event_type, event_date, mileage_km, description, source
       FROM events WHERE vehicle_id = ? ORDER BY event_date DESC`,
    )
    .bind(id)
    .all<{
      id: string;
      event_type: string | null;
      event_date: string | null;
      mileage_km: number | null;
      description: string | null;
      source: string | null;
    }>();

  const listings = await db
    .prepare(
      `SELECT id, source, title, url, price_eur, mileage_km, listed_at, is_active
       FROM listings WHERE vehicle_id = ? ORDER BY listed_at DESC`,
    )
    .bind(id)
    .all<{
      id: string;
      source: string | null;
      title: string | null;
      url: string | null;
      price_eur: number | null;
      mileage_km: number | null;
      listed_at: string | null;
      is_active: number;
    }>();

  const timeline: VehicleEvent[] = events.results.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    eventDate: e.event_date,
    mileageKm: e.mileage_km,
    description: e.description,
    source: e.source,
  }));

  return {
    id: String(v.id),
    make: (v.make as string) ?? null,
    model: (v.model as string) ?? null,
    modelYear: (v.model_year as number) ?? null,
    mileageKm: (v.latest_mileage_km as number) ?? null,
    priceEur: (v.latest_price_eur as number) ?? null,
    settlement: (v.s_settlement as string) ?? null,
    riskLevel: (v.risk_level as RiskLevel) ?? "green",
    vin: (v.vin as string) ?? null,
    plate: (v.plate as string) ?? null,
    variant: (v.variant as string) ?? null,
    fuelType: (v.fuel_type as string) ?? null,
    gearbox: (v.gearbox as string) ?? null,
    bodyType: (v.body_type as string) ?? null,
    powerHp: (v.power_hp as number) ?? null,
    engineCc: (v.engine_cc as number) ?? null,
    color: (v.color as string) ?? null,
    originCountry: (v.origin_country as string) ?? null,
    mileageFlag: (v.mileage_flag as QualityFlag) ?? "ok",
    priceFlag: (v.price_flag as QualityFlag) ?? "ok",
    vinFlag: (v.vin_flag as QualityFlag) ?? "ok",
    riskReasons: parseJsonArray(v.risk_reasons),
    seller: v.s_id
      ? {
          id: String(v.s_id),
          name: (v.s_name as string) ?? "",
          kind: (v.s_kind as string) ?? null,
          settlement: (v.s_settlement as string) ?? null,
        }
      : null,
    timeline,
    listings: listings.results.map((l) => ({
      id: l.id,
      source: l.source,
      title: l.title,
      url: l.url,
      priceEur: l.price_eur,
      mileageKm: l.mileage_km,
      listedAt: l.listed_at,
      isActive: l.is_active === 1,
    })),
  };
}

// --- Глобално търсене (FTS5) ---------------------------------------------

export async function search(db: D1Database, q: string, limit = 30): Promise<SearchHit[]> {
  const term = sanitizeFts(q);
  if (!term) return [];
  const rows = await db
    .prepare(
      `SELECT kind, ref, title, subtitle, amount
       FROM search_index WHERE search_index MATCH ? LIMIT ?`,
    )
    .bind(term, limit)
    .all<{
      kind: SearchHit["kind"];
      ref: string;
      title: string;
      subtitle: string | null;
      amount: string | null;
    }>();
  return rows.results;
}

// --- Профил на продавач --------------------------------------------------

export async function getSeller(db: D1Database, id: string): Promise<SellerDetail | null> {
  const t = await db
    .prepare(
      `SELECT seller_id, name, kind, settlement, region, listings, vehicles,
              median_price_eur, red_listings, suspect_share
       FROM seller_totals WHERE seller_id = ?`,
    )
    .bind(id)
    .first<{
      seller_id: string;
      name: string;
      kind: string | null;
      settlement: string | null;
      region: string | null;
      listings: number;
      vehicles: number;
      median_price_eur: number | null;
      red_listings: number;
      suspect_share: number;
    }>();
  if (!t) return null;

  const flows = await db
    .prepare(
      `SELECT model_key, make, model, listings, median_price_eur
       FROM seller_model_flows WHERE seller_id = ? ORDER BY listings DESC`,
    )
    .bind(id)
    .all<{
      model_key: string;
      make: string | null;
      model: string | null;
      listings: number;
      median_price_eur: number | null;
    }>();

  const inventory = await db
    .prepare(
      `SELECT v.id, v.make, v.model, v.model_year, v.latest_mileage_km,
              v.latest_price_eur, s.settlement AS settlement, v.risk_level
       FROM vehicles v LEFT JOIN sellers s ON s.id = v.current_seller_id
       WHERE v.current_seller_id = ? ORDER BY v.latest_price_eur DESC LIMIT 100`,
    )
    .bind(id)
    .all<VehicleRow>();

  return {
    id: t.seller_id,
    name: t.name,
    kind: t.kind,
    settlement: t.settlement,
    region: t.region,
    listings: t.listings,
    vehicles: t.vehicles,
    medianPriceEur: t.median_price_eur,
    redListings: t.red_listings,
    suspectShare: t.suspect_share,
    models: flows.results.map((f) => ({
      modelKey: f.model_key,
      make: f.make,
      model: f.model,
      listings: f.listings,
      medianPriceEur: f.median_price_eur,
    })),
    inventory: inventory.results.map(toVehicleListItem),
  };
}

// --- Профил на модел (с история на цените) -------------------------------

export async function getModel(db: D1Database, make: string, model: string): Promise<ModelDetail | null> {
  const key = `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
  const t = await db
    .prepare(
      `SELECT model_key, make, model, segment, listings, vehicles, median_price_eur,
              min_price_eur, max_price_eur, avg_mileage_km, suspect
       FROM model_totals WHERE model_key = ?`,
    )
    .bind(key)
    .first<{
      model_key: string;
      make: string | null;
      model: string | null;
      segment: string | null;
      listings: number;
      vehicles: number;
      median_price_eur: number | null;
      min_price_eur: number | null;
      max_price_eur: number | null;
      avg_mileage_km: number | null;
      suspect: number;
    }>();
  if (!t) return null;

  const history = await db
    .prepare(
      `SELECT period, median_price_eur, listings, avg_mileage_km
       FROM price_history WHERE model_key = ? ORDER BY period ASC`,
    )
    .bind(key)
    .all<{
      period: string;
      median_price_eur: number | null;
      listings: number;
      avg_mileage_km: number | null;
    }>();

  const inventory = await db
    .prepare(
      `SELECT v.id, v.make, v.model, v.model_year, v.latest_mileage_km,
              v.latest_price_eur, s.settlement AS settlement, v.risk_level
       FROM vehicles v LEFT JOIN sellers s ON s.id = v.current_seller_id
       WHERE v.model_key = ? ORDER BY v.latest_price_eur DESC LIMIT 100`,
    )
    .bind(key)
    .all<VehicleRow>();

  return {
    modelKey: t.model_key,
    make: t.make,
    model: t.model,
    segment: t.segment,
    listings: t.listings,
    vehicles: t.vehicles,
    medianPriceEur: t.median_price_eur,
    minPriceEur: t.min_price_eur,
    maxPriceEur: t.max_price_eur,
    avgMileageKm: t.avg_mileage_km,
    suspect: t.suspect,
    priceHistory: history.results.map((h) => ({
      period: h.period,
      medianPriceEur: h.median_price_eur,
      listings: h.listings,
      avgMileageKm: h.avg_mileage_km,
    })),
    inventory: inventory.results.map(toVehicleListItem),
  };
}

// --- Помощни -------------------------------------------------------------

interface VehicleRow {
  id: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  latest_mileage_km: number | null;
  latest_price_eur: number | null;
  settlement: string | null;
  risk_level: RiskLevel;
}

function toVehicleListItem(r: VehicleRow): VehicleListItem {
  return {
    id: r.id,
    make: r.make,
    model: r.model,
    modelYear: r.model_year,
    mileageKm: r.latest_mileage_km,
    priceEur: r.latest_price_eur,
    settlement: r.settlement,
    riskLevel: r.risk_level,
  };
}

function parseJsonArray(v: unknown): string[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Прави потребителския вход безопасен за FTS5 MATCH (prefix търсене). */
function sanitizeFts(q: string): string {
  const tokens = q
    .replace(/["*]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return "";
  return tokens.map((t) => `"${t}"*`).join(" ");
}
