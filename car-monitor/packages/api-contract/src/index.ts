// @car-monitor/api-contract — публични форми на отговорите (по модела на @sigma/api-contract).

import type { QualityFlag, RiskLevel } from "@car-monitor/shared";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VehicleListItem {
  id: string;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  mileageKm: number | null;
  priceEur: number | null;
  settlement: string | null;
  riskLevel: RiskLevel;
}

export interface VehicleDetail extends VehicleListItem {
  vin: string | null;
  plate: string | null;
  variant: string | null;
  fuelType: string | null;
  gearbox: string | null;
  bodyType: string | null;
  powerHp: number | null;
  engineCc: number | null;
  color: string | null;
  originCountry: string | null;
  mileageFlag: QualityFlag;
  priceFlag: QualityFlag;
  vinFlag: QualityFlag;
  riskReasons: string[];
  seller: SellerRef | null;
  timeline: VehicleEvent[];
  listings: ListingRef[];
}

export interface SellerRef {
  id: string;
  name: string;
  kind: string | null;
  settlement: string | null;
}

export interface ListingRef {
  id: string;
  source: string | null;
  title: string | null;
  url: string | null;
  priceEur: number | null;
  mileageKm: number | null;
  listedAt: string | null;
  isActive: boolean;
}

export interface VehicleEvent {
  id: string;
  eventType: string | null;
  eventDate: string | null;
  mileageKm: number | null;
  description: string | null;
  source: string | null;
}

export interface HomeTotals {
  vehicles: number;
  listings: number;
  activeListings: number;
  sellers: number;
  redVehicles: number;
  medianPriceEur: number | null;
  asOf: string | null;
}

export interface SearchHit {
  kind: "vehicle" | "seller" | "owner" | "listing";
  ref: string;
  title: string;
  subtitle: string | null;
  amount: string | null;
}

export interface ModelFlow {
  modelKey: string;
  make: string | null;
  model: string | null;
  listings: number;
  medianPriceEur: number | null;
}

export interface SellerDetail {
  id: string;
  name: string;
  kind: string | null;
  settlement: string | null;
  region: string | null;
  listings: number;
  vehicles: number;
  medianPriceEur: number | null;
  redListings: number;
  suspectShare: number;
  models: ModelFlow[];
  inventory: VehicleListItem[];
}

export interface PricePoint {
  period: string; // YYYY-MM
  medianPriceEur: number | null;
  listings: number;
  avgMileageKm: number | null;
}

export interface ModelDetail {
  modelKey: string;
  make: string | null;
  model: string | null;
  segment: string | null;
  listings: number;
  vehicles: number;
  medianPriceEur: number | null;
  minPriceEur: number | null;
  maxPriceEur: number | null;
  avgMileageKm: number | null;
  suspect: number;
  priceHistory: PricePoint[];
  inventory: VehicleListItem[];
}

export type ListingsQuery = {
  q?: string;
  make?: string;
  fuel?: string;
  yearMin?: number;
  yearMax?: number;
  priceMax?: number;
  risk?: RiskLevel;
  sort?: "price_asc" | "price_desc" | "newest";
  page?: number;
};
