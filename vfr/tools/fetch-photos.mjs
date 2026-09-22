#!/usr/bin/env node
// fetch-photos.mjs — сваля курираните безплатни снимки от images/photos.json, оптимизира ги
// (jpg + webp, точен размер на слота) и по избор (--apply) ги вгражда в index.html на мястото на
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

const ALLOWED_HOSTS = new Set(["unsplash.com", "images.unsplash.com", "images.pexels.com"]);

function downloadUrl(p) {
  if (p.source === "unsplash") return `https://unsplash.com/photos/${p.id}/download?force=true&w=1920`;
  if (p.source === "pexels") return `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg?auto=compress&cs=tinysrgb&w=1920`;
  throw new Error(`непознат източник: ${p.source}`);
}

async function fetchImage(url, hops = 0) {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`домейнът не е в allowlist: ${u.hostname}`);
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "manual" });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    if (hops > 5) throw new Error("твърде много пренасочвания");
    return fetchImage(new URL(r.headers.get("location"), url).href, hops + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} за ${url}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) throw new Error(`не е изображение (${ct}) за ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  const manifest = JSON.parse(await readFile(join(ROOT, "images", "photos.json"), "utf8"));
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { throw new Error("липсва sharp — пусни `npm i` в vfr/"); }
  await mkdir(OUT, { recursive: true });

  const done = {};
  for (const [slot, p] of Object.entries(manifest.slots)) {
    const jpg = join(OUT, `${slot}.jpg`), webp = join(OUT, `${slot}.webp`);
    if (!FORCE && (await exists(jpg)) && (await exists(webp))) { console.log(`= ${slot}: вече е свалена`); done[slot] = p; continue; }
    const url = downloadUrl(p);
    process.stdout.write(`↓ ${slot} ← ${p.source}/${p.id} (${p.author}) … `);
    const buf = await fetchImage(url);
    const img = sharp(buf).rotate().resize(p.width * 2, p.height * 2, { fit: p.fit || "cover", position: "attention" });
    await img.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(jpg);
    await img.clone().webp({ quality: 76 }).toFile(webp);
    console.log(`ok (${Math.round(buf.length / 1024)} KB → jpg+webp @${p.width * 2}×${p.height * 2})`);
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
    const picture = `<picture>
        <source srcset="images/photos/${slot}.webp" type="image/webp">
        <img src="images/photos/${slot}.jpg" alt="${p.alt}" width="${p.width * 2}" height="${p.height * 2}" loading="lazy" decoding="async">
      </picture>`;
    const open = wrapperOpen.replace(' aria-hidden="true"', "");
    html = html.replace(re, `$1\n    ${open}\n      ${picture}\n    </div>\n    $3`);
    replaced++;
  }
  await writeFile(htmlPath, html);
  console.log(`\n✓ вградени ${replaced} снимки в index.html. Пусни гейта: npm run check`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
