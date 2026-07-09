// Парсер за листинг (резултати/грид от карти) на mobile.bg.
// Сверен срещу реалната структура на картите-обяви (.item > a > .ime/.cena/.km/.grad),
// виж __tests__/fixtures/mobile-list.html. Една карта няма отделни полета за марка/
// модел/година — името е слято в .ime, цената е в EUR+BGN, пробегът е „(NNNNN км)".
//
// Забележка: таргетира card-grid подредбата. Ако пълната страница с резултати ползва
// друга разметка, селекторите се сверяват наново (както при детайла).

import { parse } from "node-html-parser";
import type { RawListing } from "./index.ts";

function num(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/\d[\d\s]*\d|\d/);
  if (!m) return undefined;
  const n = Number(m[0].replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseMobileBgList(html: string, source = "mobile_bg", baseUrl = "https://www.mobile.bg"): RawListing[] {
  const root = parse(html);
  const out: RawListing[] = [];

  // Картите са линкове към обяви, които съдържат име (.ime).
  const cards = root
    .querySelectorAll('a[href*="obiava-"]')
    .filter((a) => a.querySelector(".ime"));

  const seen = new Set<string>();
  for (const a of cards) {
    const href = a.getAttribute("href") ?? "";
    const sourceId = href.match(/obiava-(\d+)/)?.[1];
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const ime = a.querySelector(".ime")?.text.replace(/\s+/g, " ").trim() ?? "";
    const [make, ...rest] = ime.split(/\s+/);
    const model = rest.join(" ") || undefined;

    const cena = a.querySelector(".cena")?.text.replace(/\s+/g, " ").trim() ?? "";
    const priceAmount = num(cena.match(/([\d\s]+)\s*€/)?.[1]); // EUR частта; иначе „Попитай"

    const km = num(a.querySelector(".km")?.text); // „(16173 км)"
    const settlement = a.querySelector(".grad")?.text.replace(/\s+/g, " ").trim() || undefined;

    // Реалната снимка (пропуска промо-баджа в .pic).
    const photo = a
      .querySelectorAll(".pic img")
      .map((img) => img.getAttribute("src") ?? "")
      .find((src) => /focus\.bg|mobistatic/.test(src) && !src.includes("/icons/"));

    const url = href.startsWith("//") ? `https:${href}` : new URL(href, baseUrl).toString();

    out.push({
      sourceId,
      source,
      url,
      title: ime || undefined,
      make: make || undefined,
      model,
      priceAmount,
      priceCurrency: "EUR",
      mileageKm: km,
      settlement,
      photos: photo ? [photo.startsWith("//") ? `https:${photo}` : photo] : undefined,
    });
  }

  return out;
}
