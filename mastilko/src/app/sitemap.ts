import type { MetadataRoute } from "next";

const BASE = "https://mastilko-bg.com";

/**
 * Дата на последна СЪДЪРЖАТЕЛНА промяна по страници (`YYYY-MM-DD`).
 *
 * Преди тук стоеше `new Date()` — тоест моментът на билда за ВСИЧКИ адреси.
 * Такъв `lastmod` е безполезен сигнал: при всеки деплой целият сайт изглежда
 * „променен“, търсачките спират да му вярват и не преобхождат приоритетно
 * това, което наистина се е сменило.
 *
 * ПОДДРЪЖКА: когато смениш текста/функционалността на дадена страница, вдигни
 * нейната дата тук. Козметика (стил, вътрешни линкове) не изисква промяна.
 */
export const LAST_MODIFIED: Record<string, string> = {
  "": "2026-09-25",
  "/etiketi": "2026-10-22",
  "/vizitki": "2026-10-22",
  "/cv": "2026-10-22",
  "/pismo": "2026-10-22",
  "/gramoti": "2026-10-22",
  "/pokani": "2026-10-22",
  "/tabelki": "2026-10-22",
  "/wifi": "2026-10-22",
  "/badzhove": "2026-10-22",
  "/obyava": "2026-10-22",
  "/vaucheri": "2026-10-22",
  "/kalendar": "2026-10-22",
  "/menu": "2026-10-22",
  "/dokumentni-snimki": "2026-10-22",
  "/konektor": "2026-09-25",
  "/impresum": "2026-09-14",
  "/poveritelnost": "2026-09-25",
  "/usloviya": "2026-09-25",
};

const TOOLS = [
  "/etiketi", "/vizitki", "/cv", "/pismo", "/gramoti", "/pokani", "/tabelki",
  "/wifi", "/badzhove", "/obyava", "/vaucheri", "/kalendar", "/menu",
  "/dokumentni-snimki",
];
/** Информационни страници — не са инструменти, но си струва да се индексират. */
const INFO = ["/konektor"];
const LEGAL = ["/impresum", "/poveritelnost", "/usloviya"];

/** Всички адреси в картата — изнесено, за да го проверява seo.test.ts. */
export const SITEMAP_PATHS = ["", ...TOOLS, ...INFO, ...LEGAL];

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => {
    const date = LAST_MODIFIED[path];
    return {
      url: `${BASE}${path}`,
      // Липсваща дата → БЕЗ lastmod (не моментът на билда: той е еднакъв за
      // всички адреси и учи търсачките да пренебрегват полето). Тестът
      // seo.test.ts не допуска липсваща дата. Датата отива като `YYYY-MM-DD`
      // (W3C формат) — без фалшив час.
      ...(date ? { lastModified: date } : {}),
      changeFrequency: path === "" ? "weekly" : LEGAL.includes(path) ? "yearly" : "monthly",
      priority: path === "" ? 1 : LEGAL.includes(path) ? 0.3 : INFO.includes(path) ? 0.7 : 0.9,
    };
  });
}
