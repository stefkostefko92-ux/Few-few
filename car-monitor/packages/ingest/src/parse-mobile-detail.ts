// Парсер за детайлната страница на обява в mobile.bg.
// Селекторите са сверени срещу реалния DOM (виж __tests__/fixtures/mobile-detail.html).
// Забележка: mobile.bg НЕ показва VIN — идентификаторът е ID-то на обявата.

import { parse, type HTMLElement } from "node-html-parser";
import type { RawListing } from "./index.ts";

const FUEL: Record<string, string> = {
  бензинов: "petrol",
  дизелов: "diesel",
  хибриден: "hybrid",
  хибрид: "hybrid",
  електрически: "ev",
  "бензинов/газ(lpg)": "lpg",
  "бензинов/метан(cng)": "cng",
};
const GEARBOX: Record<string, string> = { автоматична: "automatic", ръчна: "manual" };
const BODY: Record<string, string> = {
  седан: "sedan",
  хечбек: "hatch",
  комби: "wagon",
  джип: "suv",
  купе: "coupe",
  кабрио: "convertible",
  миниван: "minivan",
  пикап: "pickup",
};

const MONTHS: Record<string, string> = {
  януари: "01", февруари: "02", март: "03", април: "04", май: "05", юни: "06",
  юли: "07", август: "08", септември: "09", октомври: "10", ноември: "11", декември: "12",
};

function txt(root: HTMLElement, sel: string): string | undefined {
  const t = root.querySelector(sel)?.text?.replace(/\s+/g, " ").trim();
  return t || undefined;
}

// Взима само ПЪРВИЯ числов блок (интервалите са разделител за хиляди),
// за да не залепва трейлинг цифри като „см³“ (sup 3).
function digits(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/\d[\d\s]*\d|\d/);
  if (!m) return undefined;
  const n = Number(m[0].replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function map(dict: Record<string, string>, v?: string): string | undefined {
  if (!v) return undefined;
  return dict[v.toLowerCase().trim()] ?? v.toLowerCase().trim();
}

/** Чете двойките етикет→стойност от техническите данни (и mainCarParams като fallback). */
function readParams(root: HTMLElement): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of root.querySelectorAll(".techData .items .item")) {
    const divs = item.querySelectorAll("div");
    if (divs.length >= 2) {
      const label = divs[0]!.text.replace(/\s+/g, " ").trim();
      const value = divs[1]!.text.replace(/\s+/g, " ").trim();
      if (label) out.set(label, value);
    }
  }
  for (const item of root.querySelectorAll(".mainCarParams .item")) {
    const label = item.querySelector(".mpLabel")?.text.trim();
    const value = item.querySelector(".mpInfo")?.text.trim();
    if (label && value && !out.has(label)) out.set(label, value);
  }
  return out;
}

export function parseMobileBgDetail(html: string, source = "mobile_bg"): RawListing {
  const root = parse(html);

  // ID на обявата.
  const obiavaText = txt(root, ".obTitle .obiava a");
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const sourceId =
    obiavaText?.replace(/\D/g, "") || canonical.match(/obiava-(\d+)/)?.[1] || "";

  // Марка/модел от трохите (breadcrumbs).
  const crumbs = root
    .querySelectorAll("trohi a")
    .map((a) => a.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const make = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : undefined;
  const model = crumbs.length >= 1 ? crumbs[crumbs.length - 1] : undefined;

  // Заглавие и комплектация (h1 без вложения "Обява:" блок).
  const h1 = root.querySelector(".obTitle h1");
  h1?.querySelector(".obiava")?.remove();
  const title = h1?.text.replace(/\s+/g, " ").trim();
  let variant: string | undefined;
  if (title && make && model) {
    variant = title.replace(new RegExp(`${make}\\s+${model}\\s*`, "i"), "").trim() || undefined;
  }

  // Цена (EUR частта преди „€").
  const priceText = txt(root, ".Price");
  const priceAmount = digits(priceText?.match(/([\d\s]+)\s*€/)?.[1]);

  // Локация.
  const settlement = txt(root, ".carLocation span")?.replace(/.*гр\.\s*/, "");

  // Продавач.
  const isPrivate = /Частно лице/i.test(root.querySelector(".contactsBox")?.text ?? root.text);
  const sellerPhone = root.querySelector('.contactsBox a[href^="tel:0"]')?.getAttribute("href")?.replace("tel:", "");

  // Технически данни.
  const p = readParams(root);
  const prod = p.get("Дата на производство");
  const modelYear = digits(prod?.match(/\d{4}/)?.[0]);

  // Снимки (малки галерийни → https).
  const photos = root
    .querySelectorAll(".newAdImages .smallPicturesGallery img")
    .map((img) => img.getAttribute("src"))
    .filter((s): s is string => !!s)
    .map((s) => (s.startsWith("//") ? `https:${s}` : s));

  // Статистики: брой видяния и дата на редакция.
  const stats = txt(root, ".statistiki .text");
  const views = digits(root.querySelector(".statistiki .text strong")?.text);
  const editedMatch = stats?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const editedAt = editedMatch ? `${editedMatch[3]}-${editedMatch[2]}-${editedMatch[1]}` : undefined;

  return {
    sourceId,
    source,
    url: canonical || undefined,
    title,
    make,
    model,
    variant,
    modelYear,
    fuelType: map(FUEL, p.get("Двигател")),
    gearbox: map(GEARBOX, p.get("Скоростна кутия")),
    bodyType: map(BODY, p.get("Категория")),
    powerHp: digits(p.get("Мощност")),
    engineCc: digits(p.get("Кубатура [куб.см]")),
    color: p.get("Цвят"),
    euroStandard: p.get("Евростандарт"),
    mileageKm: digits(p.get("Пробег [км]")),
    priceAmount,
    priceCurrency: "EUR",
    settlement,
    listedAt: editedAt,
    sellerKind: isPrivate ? "private" : "dealer",
    sellerPhone,
    description: txt(root, ".moreInfo .text"),
    photos,
    views,
    editedAt,
  };
}
