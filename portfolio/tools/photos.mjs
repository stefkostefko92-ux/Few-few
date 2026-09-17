#!/usr/bin/env node
// photos.mjs — реални безплатни снимки за демотата → webp + credits. Три източника:
//   node tools/photos.mjs --openimages [demo]          # ръчният подбор в photos.picks.json (Open Images /
//                                                      # Flickr, CC BY 2.0) — сваля от S3 (open-images-dataset)
//   PEXELS_API_KEY=… node tools/photos.mjs [demo]       # Pexels API по заявките в photos.manifest.json
//   node tools/photos.mjs --from ./my-photos [demo]     # локални файлове hero.jpg, about.jpg, g1..g6.jpg
// Пуска се РЪЧНО на машина с интернет; резултатът (public/img/<demo>/) се проследява в git.
// Всеки слот се изрязва на 3:2 (fit cover, position attention) и минава лек „киношен" грейд (контраст +
// острота), за да стоят еднакво снимки от различни автори. Билдът засича public/img/<demo>/credits.json;
// без него демото ползва генеративната графика. Авторите се показват под галерията (CC BY го изисква).
// OPENIMAGES_CACHE=<папка с <id>.jpg> прескача свалянето при повторно пускане.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "photos.manifest.json"), "utf8"));
const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const FROM = fromIdx >= 0 ? args[fromIdx + 1] : null;
const OI = args.includes("--openimages");
const only = args.filter((a, i) => !a.startsWith("--") && i !== fromIdx + 1);
const KEY = process.env.PEXELS_API_KEY;
if (!FROM && !OI && !KEY) { console.error("Нужен е --openimages, PEXELS_API_KEY (https://www.pexels.com/api/) или --from <папка>."); process.exit(2); }

const sharp = (await import("sharp")).default;
const SLOTS = ["hero", "about", "g1", "g2", "g3", "g4", "g5", "g6"];
const sizeOf = (slot) => MANIFEST.sizes[slot.startsWith("g") ? "g" : slot];
const PICKS = OI ? JSON.parse(readFileSync(join(ROOT, "photos.picks.json"), "utf8")).demos : null;
const OI_URL = (p) => `https://open-images-dataset.s3.amazonaws.com/${p.subset}/${p.id}.jpg`;
const CACHE = process.env.OPENIMAGES_CACHE || "";
const LICENSE = OI ? { license: "https://creativecommons.org/licenses/by/2.0/", licenseName: "CC BY 2.0" }
  : FROM ? { license: "local", licenseName: "local" } : { license: "https://www.pexels.com/license/", licenseName: "Pexels" };
const used = new Set();

async function fetchBuf(url, what) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} за ${what} (${url})`);
  return Buffer.from(await r.arrayBuffer());
}

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

async function openImage(p) {
  const cached = CACHE && join(CACHE, `${p.id}.jpg`);
  if (cached && existsSync(cached)) return readFileSync(cached);
  return fetchBuf(OI_URL(p), p.id);
}

/** 3:2 изрязване по „вниманието" в кадъра + лек грейд; -sm е половин ширина за телефони. */
async function convert(buf, dest, width) {
  const base = sharp(buf).rotate().linear(1.06, -6).sharpen({ sigma: 0.8 });
  const height = Math.round((width * 2) / 3);
  await base.clone().resize({ width, height, fit: "cover", position: sharp.strategy.attention, withoutEnlargement: false }).webp({ quality: 80 }).toFile(dest);
  await base.clone().resize({ width: Math.round(width / 2), height: Math.round(height / 2), fit: "cover", position: sharp.strategy.attention }).webp({ quality: 78 }).toFile(dest.replace(/\.webp$/, "-sm.webp"));
}

for (const [id, spec] of Object.entries(MANIFEST.demos)) {
  if (only.length && !only.includes(id)) continue;
  if (OI && !PICKS[id]) { console.warn(`  – ${id}: няма подбор в photos.picks.json, пропускам`); continue; }
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
    } else if (OI) {
      const p = PICKS[id][slot];
      if (!p) continue; // слот без подбор → демото го няма (галерията показва наличните)
      buf = await openImage(p);
      credit = { slot, id: p.id, photographer: p.author, photographer_url: p.authorUrl, url: p.landing, source: "openimages" };
    } else {
      const p = await searchPexels(queries[slot]);
      buf = await fetchBuf(p.src.large2x || p.src.original, p.id);
      credit = { slot, id: p.id, photographer: p.photographer, photographer_url: p.photographer_url, url: p.url, alt: p.alt || queries[slot], source: "pexels" };
    }
    await convert(buf, dest, sizeOf(slot));
    credits.push(credit);
    console.log(`  ✓ ${id}/${slot}.webp ← ${credit.photographer}`);
  }
  if (credits.length) writeFileSync(join(dir, "credits.json"), JSON.stringify({ ...LICENSE, generated: new Date().toISOString().slice(0, 10), photos: credits }, null, 2) + "\n");
  console.log(`✓ ${id}: ${credits.length} снимки`);
}
