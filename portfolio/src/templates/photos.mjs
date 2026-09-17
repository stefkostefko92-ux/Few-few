// photos.mjs — снимките на демо: чете public/img/<id>/credits.json (пише го tools/photos.mjs).
// Няма ли снимки → демото ползва генеративната графика; има ли → <picture> с webp + srcset,
// галерия с lightbox и ред с авторите. Билдът никога не пада заради липсваща снимка.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { esc } from "../lib/html.mjs";

const IMG_DIR = fileURLToPath(new URL("../../public/img/", import.meta.url));

/** @returns {{slots: Record<string, {alt: string, photographer: string, url: string}>, license: string} | null} */
export function photosOf(demoId) {
  const file = join(IMG_DIR, demoId, "credits.json");
  if (!existsSync(file)) return null;
  const data = JSON.parse(readFileSync(file, "utf8"));
  const slots = {};
  for (const p of data.photos) if (existsSync(join(IMG_DIR, demoId, `${p.slot}.webp`))) slots[p.slot] = p;
  return Object.keys(slots).length ? { slots, license: data.license } : null;
}

/** <picture> за слот: -sm.webp до 720px, пълният над това; изрични размери срещу CLS. */
export function picture(demoId, slot, photo, { w, h, alt, cls = "", eager = false }) {
  const base = `/img/${demoId}/${slot}`;
  return `<picture class="${cls}"><source media="(max-width:720px)" srcset="${base}-sm.webp" type="image/webp"><img src="${base}.webp" alt="${esc(alt || photo.alt || "")}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}></picture>`;
}

/** Ред с авторите под галерията (Pexels: „Photo by X on Pexels"). */
export function creditsLine(photos, label) {
  const names = [...new Map(Object.values(photos.slots).filter((p) => p.url).map((p) => [p.photographer, p])).values()];
  if (!names.length) return "";
  return `<p class="credits">${esc(label)}: ${names.map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener nofollow">${esc(p.photographer)}</a>`).join(", ")} · <a href="${esc(photos.license)}" target="_blank" rel="noopener nofollow">Pexels</a></p>`;
}
