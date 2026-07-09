// Парсене на HTML листинг страница към RawListing[].
// Селекторите са конфигурируеми — за всеки източник се настройва мапинг,
// а нататък нормализацията (normalizeListing) е обща.

import { parse, type HTMLElement } from "node-html-parser";
import type { RawListing } from "./index.ts";

export interface ListingSelectors {
  /** Селектор за един елемент-обява в списъка. */
  item: string;
  /** Атрибут на item с id-то на обявата (по подразбиране data-id). */
  idAttr?: string;
  title?: string;
  make?: string;
  model?: string;
  year?: string;
  price?: string;
  /** Атрибут с валута върху price елемента (по подразбиране data-currency). */
  priceCurrencyAttr?: string;
  mileage?: string;
  fuel?: string;
  gearbox?: string;
  location?: string;
  /** Линк към обявата (взима href). */
  link?: string;
  seller?: string;
  sellerKindAttr?: string;
  sellerEikAttr?: string;
}

/** Мапинг по подразбиране (примерна, добре структурирана разметка). */
export const DEFAULT_SELECTORS: ListingSelectors = {
  item: ".listing",
  idAttr: "data-id",
  title: ".title",
  make: ".make",
  model: ".model",
  year: ".year",
  price: ".price",
  priceCurrencyAttr: "data-currency",
  mileage: ".mileage",
  fuel: ".fuel",
  gearbox: ".gearbox",
  location: ".location",
  link: ".title",
  seller: ".seller",
  sellerKindAttr: "data-kind",
  sellerEikAttr: "data-eik",
};

function text(root: HTMLElement, sel?: string): string | undefined {
  if (!sel) return undefined;
  const el = root.querySelector(sel);
  const t = el?.text?.trim();
  return t ? t : undefined;
}

function num(root: HTMLElement, sel?: string): number | undefined {
  const t = text(root, sel);
  if (!t) return undefined;
  const n = Number(t.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function attr(root: HTMLElement, sel: string | undefined, name: string): string | undefined {
  if (!sel) return undefined;
  const v = root.querySelector(sel)?.getAttribute(name);
  return v?.trim() || undefined;
}

/**
 * Превръща HTML на листинг страница в сурови обяви.
 * `source` отива в RawListing.source (mobile_bg | cars_bg | ...).
 */
export function parseListingsHtml(
  html: string,
  source: string,
  selectors: ListingSelectors = DEFAULT_SELECTORS,
): RawListing[] {
  const root = parse(html);
  const items = root.querySelectorAll(selectors.item);
  const out: RawListing[] = [];

  for (const [i, item] of items.entries()) {
    const sourceId = item.getAttribute(selectors.idAttr ?? "data-id") ?? String(i);
    const priceCurrency = attr(item, selectors.price, selectors.priceCurrencyAttr ?? "data-currency");
    const href = selectors.link ? item.querySelector(selectors.link)?.getAttribute("href") : undefined;

    out.push({
      sourceId,
      source,
      url: href ?? undefined,
      title: text(item, selectors.title),
      make: text(item, selectors.make),
      model: text(item, selectors.model),
      modelYear: num(item, selectors.year),
      priceAmount: num(item, selectors.price),
      priceCurrency: priceCurrency ?? "EUR",
      mileageKm: num(item, selectors.mileage),
      fuelType: text(item, selectors.fuel),
      gearbox: text(item, selectors.gearbox),
      settlement: text(item, selectors.location),
      sellerName: text(item, selectors.seller),
      sellerKind: attr(item, selectors.seller, selectors.sellerKindAttr ?? "data-kind"),
      sellerEik: attr(item, selectors.seller, selectors.sellerEikAttr ?? "data-eik"),
    });
  }

  return out;
}
