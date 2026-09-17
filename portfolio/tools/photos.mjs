#!/usr/bin/env node
// photos.mjs — реални безплатни снимки за демотата (Pexels API, лиценз Pexels) → webp + credits.
// Пуска се РЪЧНО на машина с интернет; резултатът (public/img/<demo>/) се проследява в git.
//   PEXELS_API_KEY=… node tools/photos.mjs             # всички демота
//   PEXELS_API_KEY=… node tools/photos.mjs burger      # само едно
//   node tools/photos.mjs --from ./my-photos burger    # без API: локални файлове hero.jpg, about.jpg, g1..g6.jpg
// Билдът засича public/img/<demo>/credits.json и включва снимките; без него демото ползва
// генеративната графика. Авторите се показват под галерията (изискване на лиценза: не, но е коректно).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "photos.manifest.json"), "utf8"));
const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const FROM = fromIdx >= 0 ? args[fromIdx + 1] : null;
const only = args.filter((a, i) => !a.startsWith("--") && i !== fromIdx + 1);
const KEY = process.env.PEXELS_API_KEY;
if (!FROM && !KEY) { console.error("Нужен е PEXELS_API_KEY (https://www.pexels.com/api/) или --from <папка>."); process.exit(2); }

const sharp = (await import("sharp")).default;
const SLOTS = ["hero", "about", "g1", "g2", "g3", "g4", "g5", "g6"];
const sizeOf = (slot) => MANIFEST.sizes[slot.startsWith("g") ? "g" : slot];
const used = new Set();

async function searchPexels(query, orientation = "landscape") {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=6&size=large`;
  const r = await fetch(url, { headers: { Authorization: KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status} за „${query}“`);
  const data = await r.json();
  const photo = (data.photos || []).find((p) => !used.has(p.id));
  if (!photo) throw new Error(`нула резултати за „${query}“`);
  used.add(photo.id);
  return photo;
}

async function convert(buf, dest, width) {
  await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest);
  await sharp(buf).rotate().resize({ width: Math.round(width / 2), withoutEnlargement: true }).webp({ quality: 78 }).toFile(dest.replace(/\.webp$/, "-sm.webp"));
}

for (const [id, spec] of Object.entries(MANIFEST.demos)) {
  if (only.length && !only.includes(id)) continue;
  const dir = join(ROOT, "public/img", id);
  mkdirSync(dir, { recursive: true });
  const credits = [];
  const queries = { hero: spec.hero, about: spec.about, ...Object.fromEntries(spec.gallery.map((q, i) => [`g${i + 1}`, q])) };
  for (const slot of SLOTS) {
    const dest = join(dir, `${slot}.webp`);
    let buf, credit;
    if (FROM) {
      const src = [".jpg", ".jpeg", ".png", ".webp"].map((e) => join(FROM, id, slot + e)).concat([".jpg", ".jpeg", ".png", ".webp"].map((e) => join(FROM, slot + e))).find(existsSync);
      if (!src) { console.warn(`  – ${id}/${slot}: няма локален файл, пропускам`); continue; }
      buf = readFileSync(src); credit = { slot, photographer: "—", photographer_url: "", url: "", source: "local" };
    } else {
      const p = await searchPexels(queries[slot]);
      buf = Buffer.from(await (await fetch(p.src.large2x || p.src.original)).arrayBuffer());
      credit = { slot, id: p.id, photographer: p.photographer, photographer_url: p.photographer_url, url: p.url, alt: p.alt || queries[slot], source: "pexels" };
    }
    await convert(buf, dest, sizeOf(slot));
    credits.push(credit);
    console.log(`  ✓ ${id}/${slot}.webp ← ${credit.photographer}`);
  }
  if (credits.length) writeFileSync(join(dir, "credits.json"), JSON.stringify({ license: FROM ? "local" : "https://www.pexels.com/license/", generated: new Date().toISOString().slice(0, 10), photos: credits }, null, 2) + "\n");
  console.log(`✓ ${id}: ${credits.length} снимки`);
}
