#!/usr/bin/env node
// Изпича статични 3D икони за всеки предмет в catalog.json — headless Chromium (Playwright)
// рендерира client/bake.html?slug=<slug> (студийната сцена от combat/engine/items/renderScene.ts,
// същото кадриране/осветление като живия преглед), после каптира еднакъв 256px WebP с прозрачен
// фон. Изисква Vite dev сървъра да работи на localhost (BAKE_URL, по подразбиране :5175).
//
// Идемпотентен: манифестът пази sha256(entry JSON + GENERATOR_VERSION) по slug — непроменен
// предмет/генератор се прескача при повторно пускане (бутни GENERATOR_VERSION при промяна на
// геометрията/материалите, за да пресвежиш всички икони наведнъж).
//
//   node client/scripts/bake-item-icons.mjs [--force] [--only=slug1,slug2]
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATOR_VERSION = 8; // ↑ при промяна на geometry/materials/motif — пресвежава всички икони

// Огледало на support.ts supports3DIcon() — Node скрипт не може да import-не .ts директно.
// buildItem.test.js гейтва двете да не се разминат (весди слот/тип оръжие тест).
const SUPPORTED_WEAPON_ICONS = new Set(['sword', 'dagger', 'staff', 'bow', 'mace']);
const UNSUPPORTED_CATEGORIES = new Set(['ring', 'amulet', 'armor', 'boots', 'cloak']);
function supports3DIcon(entry) {
  if (UNSUPPORTED_CATEGORIES.has(entry.category)) return false;
  if (entry.category === 'weapon') return SUPPORTED_WEAPON_ICONS.has(entry.icon || entry.sub_type || 'sword');
  return true;
}

const ROOT = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'public', 'assets', 'items3d', 'catalog.json');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'items3d');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const BAKE_URL = process.env.BAKE_URL || 'http://127.0.0.1:5175/bake.html';
const CHROMIUM_PATH = process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

function entryHash(entry) {
  return createHash('sha256').update(JSON.stringify(entry) + `::v${GENERATOR_VERSION}`).digest('hex').slice(0, 16);
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return { generatedAt: null, hashes: {}, slugs: [] };
  }
}

async function fileExists(p) {
  try { await readFile(p); return true; } catch { return false; }
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const manifest = await loadManifest();
  await mkdir(OUT_DIR, { recursive: true });

  // Предмети без boy 3D геометрия (пръстен/амулет, брадва/копие) — никога не се изпичат;
  // почисти стари webp/manifest записи от предишни (отхвърлени) генератори, старият JPG остава.
  let cleaned = 0;
  for (const entry of catalog) {
    if (supports3DIcon(entry)) continue;
    if (manifest.hashes[entry.slug] !== undefined) { delete manifest.hashes[entry.slug]; cleaned++; }
    await rm(path.join(OUT_DIR, `${entry.slug}.webp`)).catch(() => {});
  }
  if (cleaned) console.log(`почистени ${cleaned} стари икони за слотове без boy геометрия (пръстен/амулет/брадва/копие)`);

  const targets = (only ? catalog.filter((e) => only.has(e.slug)) : catalog).filter(supports3DIcon);
  const todo = [];
  for (const entry of targets) {
    const h = entryHash(entry);
    const webpPath = path.join(OUT_DIR, `${entry.slug}.webp`);
    if (!force && manifest.hashes[entry.slug] === h && (await fileExists(webpPath))) continue;
    todo.push({ entry, hash: h });
  }

  console.log(`каталог: ${catalog.length} предмета · за изпичане: ${todo.length} (кеш пропуска останалите)`);
  if (todo.length === 0) {
    manifest.slugs = Object.keys(manifest.hashes);
    manifest.generatedAt = new Date().toISOString();
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log('нищо за правене');
    return;
  }

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 540 } });
  const failures = [];

  for (const [i, { entry, hash }] of todo.entries()) {
    try {
      await page.goto(`${BAKE_URL}?slug=${encodeURIComponent(entry.slug)}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__bakeReady === true || window.__bakeError, { timeout: 20000 });
      const err = await page.evaluate(() => window.__bakeError || null);
      if (err) throw new Error(err);
      const skip = await page.evaluate(() => window.__bakeSkip === true);
      if (skip) {
        delete manifest.hashes[entry.slug];
        await rm(path.join(OUT_DIR, `${entry.slug}.webp`)).catch(() => {});
        continue;
      }
      const dataUrl = await page.evaluate(() => window.__bakeWebp);
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      await writeFile(path.join(OUT_DIR, `${entry.slug}.webp`), buf);
      manifest.hashes[entry.slug] = hash;
      if ((i + 1) % 20 === 0 || i === todo.length - 1) console.log(`  ${i + 1}/${todo.length} — ${entry.slug} (${buf.length}B)`);
    } catch (e) {
      failures.push({ slug: entry.slug, error: String(e) });
      console.error(`  ГРЕШКА ${entry.slug}: ${e}`);
    }
  }
  await browser.close();

  manifest.slugs = Object.keys(manifest.hashes);
  manifest.generatedAt = new Date().toISOString();
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`готово: ${manifest.slugs.length} икони в манифеста${failures.length ? `, ${failures.length} провала` : ''}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
