#!/usr/bin/env node
// fetch-photos.mjs — сваля курираните безплатни снимки от images/photos.json, оптимизира ги
// (jpg + avif, точен размер на слота) и по избор (--apply) ги вгражда в index.html на мястото на
// векторните илюстрации на трите услуги между маркерите <!-- photo:<slot> --> … <!-- /photo:<slot> -->.
//
// Защо отделен скрипт: средата, в която се гради сайтът, може да няма достъп до Unsplash/Pexels
// (egress policy). Скриптът се пуска там, където мрежата позволява (лаптоп/VPS):
//
//   cd vfr && npm i && npm run photos            # само сваля + оптимизира → images/photos/
//   cd vfr && npm run photos:apply               # + вгражда <picture> в index.html (идемпотентно)
//
// Сигурност: allowlist на домейните, приема само image/* отговори, нищо не се изпълнява.
// Лиценз: Unsplash License / Pexels License — безплатни за търговска употреба, без атрибуция.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "images", "photos");
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const UA = "vfr-fetch-photos/1.0 (+https://carbonstealth.eu)";
const MAX_BYTES = 15 * 1024 * 1024; // таван: снимка за сайт не е по-голяма; пази паметта от безкраен отговор

const ALLOWED_HOSTS = new Set(["unsplash.com", "images.unsplash.com", "images.pexels.com"]);

function downloadUrl(p) {
  if (p.source === "unsplash") return `https://unsplash.com/photos/${p.id}/download?force=true&w=1920`;
  if (p.source === "pexels") return `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg?auto=compress&cs=tinysrgb&w=1920`;
  throw new Error(`непознат източник: ${p.source}`);
}

async function fetchImage(url, hops = 0) {
  const u = new URL(url);
  // Само https (пренасочване към http би позволило подмяна по пътя) и само познати хостове.
  if (u.protocol !== "https:") throw new Error(`само https: ${u.protocol}//${u.hostname}`);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`домейнът не е в allowlist: ${u.hostname}`);
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "manual" });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    if (hops > 5) throw new Error("твърде много пренасочвания");
    return fetchImage(new URL(r.headers.get("location"), url).href, hops + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} за ${url}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) throw new Error(`не е изображение (${ct}) за ${url}`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error(`твърде голям файл (${len} B > ${MAX_BYTES} B) за ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`твърде голям файл (${buf.length} B) за ${url}`);
  return buf;
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

// alt идва от photos.json — екранираме го, за да не може текст с кавички да счупи атрибута.
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SIZES = "(max-width: 1080px) min(100vw, 640px), 400px";

async function main() {
  const manifest = JSON.parse(await readFile(join(ROOT, "images", "photos.json"), "utf8"));
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { throw new Error("липсва sharp — пусни `npm i` в vfr/"); }
  await mkdir(OUT, { recursive: true });

  const done = {};
  for (const [slot, p] of Object.entries(manifest.slots)) {
    const jpg = join(OUT, `${slot}.jpg`), avif = join(OUT, `${slot}.avif`);
    if (!FORCE && (await exists(jpg)) && (await exists(avif))) { console.log(`= ${slot}: вече е свалена`); done[slot] = p; continue; }
    const url = downloadUrl(p);
    process.stdout.write(`↓ ${slot} ← ${p.source}/${p.id} (${p.author}) … `);
    const buf = await fetchImage(url);
    const img = sharp(buf).rotate().resize(p.width * 2, p.height * 2, { fit: p.fit || "cover", position: "attention" });
    // AVIF + JPG (mozjpeg). Без WebP: на шумни снимки (скрап, мебели) libwebp q76 излизаше ПО-ГОЛЯМ
    // от mozjpeg q80, а браузърът взима първия <source> без оглед на размера. AVIF е с ~30% под JPG.
    const small = sharp(buf).rotate().resize(640, Math.round((640 * p.height) / p.width), { fit: p.fit || "cover", position: "attention" });
    await img.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(jpg);
    await img.clone().avif({ quality: 60, effort: 6 }).toFile(avif);
    await small.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(join(OUT, `${slot}-640.jpg`));
    await small.clone().avif({ quality: 60, effort: 6 }).toFile(join(OUT, `${slot}-640.avif`));
    console.log(`ok (${Math.round(buf.length / 1024)} KB → jpg+avif @${p.width * 2}×${p.height * 2} и 640w)`);
    done[slot] = p;
  }

  if (!APPLY) { console.log("\nСнимките са в images/photos/. За вграждане: npm run photos:apply"); return; }

  const htmlPath = join(ROOT, "index.html");
  let html = await readFile(htmlPath, "utf8");
  let replaced = 0;
  for (const [slot, p] of Object.entries(done)) {
    const re = new RegExp(`(<!-- photo:${slot} -->)([\\s\\S]*?)(<!-- /photo:${slot} -->)`);
    const m = html.match(re);
    if (!m) { console.warn(`! няма маркер за слот ${slot}`); continue; }
    // Запазваме обвиващия елемент (класовете му носят оформлението), сменяме само вътрешността.
    const wrapperOpen = m[2].match(/^\s*<div[^>]*>/)?.[0] ?? "<div>";
    const w = p.width * 2, h = p.height * 2, f = `images/photos/${slot}`;
    const picture = `<picture>
        <source type="image/avif" srcset="${f}-640.avif 640w, ${f}.avif ${w}w" sizes="${SIZES}">
        <img src="${f}.jpg" srcset="${f}-640.jpg 640w, ${f}.jpg ${w}w" sizes="${SIZES}" alt="${escAttr(p.alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">
      </picture>`;
    const open = wrapperOpen.replace(' aria-hidden="true"', "");
    html = html.replace(re, `$1\n    ${open}\n      ${picture}\n    </div>\n    $3`);
    replaced++;
  }
  await writeFile(htmlPath, html);
  console.log(`\n✓ вградени ${replaced} снимки в index.html. Пусни гейта: npm run check`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
