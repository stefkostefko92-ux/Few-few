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
const LAST_MODIFIED: Record<string, string> = {
  "": "2026-09-25",
  "/etiketi": "2026-09-18",
  "/vizitki": "2026-09-18",
  "/cv": "2026-09-25",
  "/pismo": "2026-09-25",
  "/gramoti": "2026-09-18",
  "/pokani": "2026-09-18",
  "/tabelki": "2026-09-18",
  "/wifi": "2026-09-18",
  "/badzhove": "2026-09-18",
  "/obyava": "2026-09-18",
  "/vaucheri": "2026-09-18",
  "/kalendar": "2026-09-18",
  "/menu": "2026-09-18",
  "/dokumentni-snimki": "2026-09-18",
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

export default function sitemap(): MetadataRoute.Sitemap {
  const build = new Date();
  return ["", ...TOOLS, ...INFO, ...LEGAL].map((path) => {
    const date = LAST_MODIFIED[path];
    return {
      url: `${BASE}${path}`,
      // Липсваща дата в картата → падаме на билда (по-добре груба, отколкото никаква).
      lastModified: date ? new Date(`${date}T00:00:00Z`) : build,
      changeFrequency: path === "" ? "weekly" : LEGAL.includes(path) ? "yearly" : "monthly",
      priority: path === "" ? 1 : LEGAL.includes(path) ? 0.3 : INFO.includes(path) ? 0.7 : 0.9,
    };
  });
}
