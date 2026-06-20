// @car-monitor/ingest — нормализация на сурови данни към доменния граф.
// Аналог на @sigma/ingest: сменя се само parser-ът на входа; нататък
// "продавач → обява → автомобил → събитие" е общо.

import {
  computeRisk,
  modelKey,
  normalizeEik,
  normalizePlate,
  normalizeVin,
  isValidVin,
  isValidEik,
  toEur,
  type QualityFlag,
  type RiskLevel,
} from "@car-monitor/shared";

// --- Сурови данни от източник (напр. обява от mobile.bg/cars.bg) ----------
export interface RawListing {
  sourceId: string;
  source: string; // mobile_bg | cars_bg | olx | ...
  url?: string;
  title?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  vin?: string;
  plate?: string;
  fuelType?: string;
  gearbox?: string;
  bodyType?: string;
  powerHp?: number;
  mileageKm?: number;
  priceAmount?: number;
  priceCurrency?: string;
  settlement?: string;
  locationNuts?: string;
  listedAt?: string;
  sellerName?: string;
  sellerKind?: string;
  sellerEik?: string;
  /** Известни отчети за пробег от външни източници (ГТП/обяви). */
  mileageHistory?: Array<{ date: string; km: number }>;
}

// --- Нормализиран граф ---------------------------------------------------
export interface NormalizedSeller {
  id: string;
  name: string;
  kind: string | null;
  eik: string | null;
  eik_normalized: string | null;
  eik_valid: number;
  settlement: string | null;
}

export interface NormalizedVehicle {
  id: string;
  vin: string | null;
  vin_normalized: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  model_key: string | null;
  model_year: number | null;
  fuel_type: string | null;
  gearbox: string | null;
  body_type: string | null;
  power_hp: number | null;
  current_seller_id: string;
  latest_mileage_km: number | null;
  latest_price_eur: number | null;
  status: string;
  mileage_flag: QualityFlag;
  price_flag: QualityFlag;
  vin_flag: QualityFlag;
  risk_level: RiskLevel;
  risk_reasons: string | null;
  last_seen: string | null;
}

export interface NormalizedListing {
  id: string;
  source_id: string;
  source: string;
  vehicle_id: string;
  seller_id: string;
  title: string | null;
  url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  price_eur: number | null;
  fx_converted: number;
  mileage_km: number | null;
  listed_at: string | null;
  location_nuts: string | null;
  settlement: string | null;
  price_flag: QualityFlag;
  is_active: number;
}

export interface NormalizedEvent {
  id: string;
  natural_key: string;
  vehicle_id: string;
  event_type: string;
  event_date: string;
  mileage_km: number | null;
  value_before: number | null;
  value_after: number | null;
  value_delta: number | null;
  source: string;
  description: string | null;
}

export interface NormalizedRecord {
  seller: NormalizedSeller;
  vehicle: NormalizedVehicle;
  listing: NormalizedListing;
  events: NormalizedEvent[];
}

export interface NormalizeContext {
  /** EUR за единица от валутата (от `fx_rates`). */
  eurPerUnit: (currency: string) => number | null;
  /** Медианна цена за модела (от `model_totals`). */
  modelMedianEur: (modelKey: string | null) => number | null;
  /** Има ли същото VIN активно другаде (клониране). */
  vinActiveElsewhere?: (vin: string) => boolean;
}

/** Превръща една сурова обява в свързан граф със сметнат риск. */
export function normalizeListing(raw: RawListing, ctx: NormalizeContext): NormalizedRecord {
  const sellerId = sellerIdFor(raw);
  const vehicleId = vehicleIdFor(raw);
  const vinNorm = normalizeVin(raw.vin);
  const mk = modelKey(raw.make, raw.model);

  const currency = (raw.priceCurrency ?? "EUR").toUpperCase();
  const priceEur = toEur(raw.priceAmount, currency, ctx.eurPerUnit(currency));
  const fxConverted = currency !== "EUR" && priceEur != null ? 1 : 0;

  // Отчети за пробег: историята + текущия от обявата.
  const readings = [...(raw.mileageHistory ?? [])];
  if (raw.mileageKm != null && raw.listedAt) {
    readings.push({ date: raw.listedAt, km: raw.mileageKm });
  }

  const risk = computeRisk({
    mileageReadings: readings,
    priceEur,
    modelMedianEur: ctx.modelMedianEur(mk),
    vinActiveElsewhere: vinNorm ? ctx.vinActiveElsewhere?.(vinNorm) : false,
    vinValid: raw.vin ? isValidVin(raw.vin) : undefined,
  });

  const seller: NormalizedSeller = {
    id: sellerId,
    name: raw.sellerName?.trim() || "Непознат продавач",
    kind: raw.sellerKind ?? null,
    eik: raw.sellerEik ?? null,
    eik_normalized: normalizeEik(raw.sellerEik),
    eik_valid: isValidEik(raw.sellerEik) ? 1 : 0,
    settlement: raw.settlement ?? null,
  };

  const vehicle: NormalizedVehicle = {
    id: vehicleId,
    vin: raw.vin ?? null,
    vin_normalized: vinNorm,
    plate: normalizePlate(raw.plate),
    make: raw.make ?? null,
    model: raw.model ?? null,
    model_key: mk,
    model_year: raw.modelYear ?? null,
    fuel_type: raw.fuelType ?? null,
    gearbox: raw.gearbox ?? null,
    body_type: raw.bodyType ?? null,
    power_hp: raw.powerHp ?? null,
    current_seller_id: sellerId,
    latest_mileage_km: raw.mileageKm ?? null,
    latest_price_eur: risk.priceFlag === "suspect" ? null : priceEur,
    status: "active",
    mileage_flag: risk.mileageFlag,
    price_flag: risk.priceFlag,
    vin_flag: risk.vinFlag,
    risk_level: risk.level,
    risk_reasons: risk.reasons.length ? JSON.stringify(risk.reasons) : null,
    last_seen: raw.listedAt ?? null,
  };

  const listing: NormalizedListing = {
    id: `l_${raw.source}_${raw.sourceId}`,
    source_id: raw.sourceId,
    source: raw.source,
    vehicle_id: vehicleId,
    seller_id: sellerId,
    title: raw.title ?? null,
    url: raw.url ?? null,
    price_amount: raw.priceAmount ?? null,
    price_currency: currency,
    price_eur: priceEur,
    fx_converted: fxConverted,
    mileage_km: raw.mileageKm ?? null,
    listed_at: raw.listedAt ?? null,
    location_nuts: raw.locationNuts ?? null,
    settlement: raw.settlement ?? null,
    price_flag: risk.priceFlag,
    is_active: 1,
  };

  const events: NormalizedEvent[] = [];
  // Засечен върнат пробег => събитие за времевата линия.
  if (risk.reasons.includes("mileage_rollback") && readings.length >= 2) {
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    const before = sorted[0]!;
    const after = sorted[sorted.length - 1]!;
    events.push({
      id: `e_${vehicleId}_rollback`,
      natural_key: `${vehicleId}|mileage_reading|${after.date}`,
      vehicle_id: vehicleId,
      event_type: "mileage_reading",
      event_date: after.date,
      mileage_km: after.km,
      value_before: before.km,
      value_after: after.km,
      value_delta: after.km - before.km,
      source: raw.source,
      description: "Обявен пробег по-нисък от предходен отчет — съмнение за връщане",
    });
  }

  return { seller, vehicle, listing, events };
}

function sellerIdFor(raw: RawListing): string {
  const eik = normalizeEik(raw.sellerEik);
  if (eik) return `s_eik_${eik}`;
  if (raw.sellerName) return `s_name_${hash(raw.sellerName)}`;
  return `s_src_${raw.source}_${hash(raw.sourceId)}`;
}

function vehicleIdFor(raw: RawListing): string {
  const vin = normalizeVin(raw.vin);
  if (vin) return `v_${vin}`;
  const plate = normalizePlate(raw.plate);
  if (plate) return `v_plate_${plate}`;
  return `v_src_${raw.source}_${hash(raw.sourceId)}`;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// --- Adapter интерфейс (по един на източник) -----------------------------
export interface SourceAdapter {
  id: string;
  /** Връща сурови обяви за даден времеви прозорец. */
  fetch(window: { since: string; until: string }): Promise<RawListing[]>;
}

export { parseListingsHtml, DEFAULT_SELECTORS, type ListingSelectors } from "./parse.ts";
