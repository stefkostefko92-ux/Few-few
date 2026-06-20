// Инкрементален refresh: източник → нормализация → upsert → пресъздаване на rollups.
// Аналог на Workflow `sigma-refresh` в СИГМА (малък скорошен прозорец).

import { normalizeListing, type NormalizeContext, type NormalizedRecord } from "@car-monitor/ingest";
import ROLLUPS_SQL from "@car-monitor/db/rollups.sql";
import { enabledAdapters } from "./adapters.ts";

export interface Env {
  DB: D1Database;
}

export interface RefreshWindow {
  since: string;
  until: string;
}

export interface RefreshResult {
  fetched: number;
  upserted: number;
  window: RefreshWindow;
}

export async function runRefresh(env: Env, window: RefreshWindow): Promise<RefreshResult> {
  const db = env.DB;

  // 1) Курсове и медиани (контекст за нормализацията и риска).
  const fx = await loadFxRates(db);
  const medians = await loadModelMedians(db);
  const ctx: NormalizeContext = {
    eurPerUnit: (c) => (c === "EUR" ? 1 : (fx.get(c) ?? null)),
    modelMedianEur: (mk) => (mk ? (medians.get(mk) ?? null) : null),
    vinActiveElsewhere: () => false, // изисква cross-check заявка; извън скоупа на демото
  };

  // 2) Събиране от всички активни адаптери за прозореца (feature flag-ове от env).
  let fetched = 0;
  let upserted = 0;
  const adapters = enabledAdapters(env as unknown as Record<string, string | undefined>);
  for (const adapter of adapters) {
    const raws = await adapter.fetch(window);
    fetched += raws.length;
    for (const raw of raws) {
      const rec = normalizeListing(raw, ctx);
      await upsert(db, rec);
      upserted++;
    }
  }

  // 3) Пресъздаване на derived таблиците.
  await rebuildRollups(db);

  return { fetched, upserted, window };
}

async function loadFxRates(db: D1Database): Promise<Map<string, number>> {
  const rows = await db
    .prepare(
      `SELECT base_currency, eur_per_unit FROM fx_rates
       WHERE rate_date = (SELECT MAX(rate_date) FROM fx_rates)`,
    )
    .all<{ base_currency: string; eur_per_unit: number }>();
  return new Map(rows.results.map((r) => [r.base_currency, r.eur_per_unit]));
}

async function loadModelMedians(db: D1Database): Promise<Map<string, number>> {
  const rows = await db
    .prepare(`SELECT model_key, median_price_eur FROM model_totals WHERE median_price_eur IS NOT NULL`)
    .all<{ model_key: string; median_price_eur: number }>();
  return new Map(rows.results.map((r) => [r.model_key, r.median_price_eur]));
}

async function upsert(db: D1Database, rec: NormalizedRecord): Promise<void> {
  const { seller, vehicle, listing, events } = rec;

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sellers (id, name, kind, eik, eik_normalized, eik_valid, settlement)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind,
           settlement=excluded.settlement`,
      )
      .bind(seller.id, seller.name, seller.kind, seller.eik, seller.eik_normalized, seller.eik_valid, seller.settlement),
    db
      .prepare(
        `INSERT INTO vehicles (id, vin, vin_normalized, plate, make, model, model_key,
           model_year, fuel_type, gearbox, body_type, power_hp, current_seller_id,
           latest_mileage_km, latest_price_eur, status, mileage_flag, price_flag,
           vin_flag, risk_level, risk_reasons, last_seen, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           latest_mileage_km=excluded.latest_mileage_km,
           latest_price_eur=excluded.latest_price_eur,
           current_seller_id=excluded.current_seller_id,
           mileage_flag=excluded.mileage_flag, price_flag=excluded.price_flag,
           vin_flag=excluded.vin_flag, risk_level=excluded.risk_level,
           risk_reasons=excluded.risk_reasons, last_seen=excluded.last_seen,
           updated_at=datetime('now')`,
      )
      .bind(
        vehicle.id, vehicle.vin, vehicle.vin_normalized, vehicle.plate, vehicle.make,
        vehicle.model, vehicle.model_key, vehicle.model_year, vehicle.fuel_type,
        vehicle.gearbox, vehicle.body_type, vehicle.power_hp, vehicle.current_seller_id,
        vehicle.latest_mileage_km, vehicle.latest_price_eur, vehicle.status,
        vehicle.mileage_flag, vehicle.price_flag, vehicle.vin_flag, vehicle.risk_level,
        vehicle.risk_reasons, vehicle.last_seen,
      ),
    db
      .prepare(
        `INSERT INTO listings (id, source_id, source, vehicle_id, seller_id, title, url,
           price_amount, price_currency, price_eur, fx_converted, mileage_km, listed_at,
           location_nuts, settlement, price_flag, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(source_id) DO UPDATE SET
           price_amount=excluded.price_amount, price_eur=excluded.price_eur,
           mileage_km=excluded.mileage_km, is_active=excluded.is_active`,
      )
      .bind(
        listing.id, listing.source_id, listing.source, listing.vehicle_id, listing.seller_id,
        listing.title, listing.url, listing.price_amount, listing.price_currency,
        listing.price_eur, listing.fx_converted, listing.mileage_km, listing.listed_at,
        listing.location_nuts, listing.settlement, listing.price_flag, listing.is_active,
      ),
  ];

  for (const e of events) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO events (id, natural_key, vehicle_id, event_type, event_date,
             mileage_km, value_before, value_after, value_delta, source, description)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(natural_key) DO NOTHING`,
        )
        .bind(
          e.id, e.natural_key, e.vehicle_id, e.event_type, e.event_date, e.mileage_km,
          e.value_before, e.value_after, e.value_delta, e.source, e.description,
        ),
    );
  }

  await db.batch(stmts);
}

/** Изпълнява rollups.sql изявление по изявление през D1 batch. */
async function rebuildRollups(db: D1Database): Promise<void> {
  const statements = splitSql(ROLLUPS_SQL);
  await db.batch(statements.map((s) => db.prepare(s)));
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) =>
      s
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}
