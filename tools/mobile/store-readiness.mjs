#!/usr/bin/env node
// tools/mobile/store-readiness.mjs — статичен детектор за готовност за магазина (Мобилджията v2.0).
//
// Употреба:
//   node tools/mobile/store-readiness.mjs <папка>   # напр. medqr/mobile или zabobovdol/android
//
// Евристичен — НЕ замества App Review / Play pre-launch report. Цел: да хване най-скъпите
// откази преди да си загубил ден в опашката на ревюто. Връща exit 1 при HIGH находка.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const JSON_OUT = process.argv.includes("--json"); // CI-гейтваем изход: {pass, fails, warnings}
const root = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!root || !existsSync(root)) {
  console.error("Употреба: node tools/mobile/store-readiness.mjs <папка> [--json]");
  process.exit(2);
}

const findings = [];
const add = (sev, id, msg) => findings.push({ sev, id, msg });

function readJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function walk(dir, acc = [], depth = 0) {
  if (depth > 4) return acc;
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "Pods" || e === "build") continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc, depth + 1);
    else acc.push(p);
  }
  return acc;
}

const files = walk(root);

// ─── 1. Capacitor: отдалечен server.url без нативна стойност (Apple 4.2) ───────
const capCfg = files.find((f) => /capacitor\.config\.(json|ts|js)$/.test(f));
if (capCfg) {
  const raw = readFileSync(capCfg, "utf8");
  const remote = /["']?server["']?\s*[:=][\s\S]*?url["']?\s*[:=]\s*["']https?:\/\//.test(raw);
  const pkg = readJSON(join(root, "package.json")) || {};
  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  const nativePlugins = deps.filter((d) => /capacitor/.test(d) && !/(core|android|ios|cli|assets)$/.test(d));
  if (remote && nativePlugins.length === 0) {
    add("HIGH", "cap-4.2-thin-wrapper",
      `Capacitor зарежда отдалечен server.url БЕЗ нативни плъгини → тънка обвивка, рискова по Apple Guideline 4.2. ` +
      `Добави нативна стойност (NFC/push/biometrics/offline/share). (${capCfg})`);
  } else if (remote) {
    add("INFO", "cap-remote",
      `Capacitor зарежда отдалечен server.url; нативни плъгини: ${nativePlugins.join(", ") || "няма"}. ` +
      `Увери се, че нативната стойност е достатъчна за 4.2.`);
  }
}

// ─── 2. Тайни в бъндъла/конфига ───────────────────────────────────────────────
const secretRe = /\b((sk|rk|pk)_(live|test|prod)_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_\-]{20,}|ghp_[A-Za-z0-9]{20,})\b/;
for (const f of files) {
  if (!/\.(json|js|ts|jsx|tsx|java|kt|swift|plist|xml|env|html)$/.test(f)) continue;
  if (/\.(png|jpg|jpeg|webp|svg)$/.test(f)) continue;
  let txt = ""; try { txt = readFileSync(f, "utf8"); } catch { continue; }
  const m = txt.match(secretRe);
  if (m) add("HIGH", "secret-in-bundle", `Възможна тайна в бъндъла: ${m[0].slice(0, 12)}… → не е тайна (декомпилира се). Махни/ротирай. (${f})`);
}

// ─── 3. iOS Privacy Manifest ──────────────────────────────────────────────────
const hasIOS = files.some((f) => /\/(ios|App)\//.test(f) || f.endsWith(".xcodeproj") || /Info\.plist$/.test(f)) ||
  (capCfg && /ios/.test(readFileSync(capCfg, "utf8")));
const hasPrivacyManifest = files.some((f) => /PrivacyInfo\.xcprivacy$/.test(f));
if (hasIOS && !hasPrivacyManifest) {
  add("MED", "ios-privacy-manifest",
    "iOS проект без `PrivacyInfo.xcprivacy` (Privacy Manifest + required-reason APIs) — App Store го изисква.");
}

// ─── 4. Info.plist usage descriptions за чувствителни API ─────────────────────
const plists = files.filter((f) => /Info\.plist$/.test(f));
for (const p of plists) {
  const txt = readFileSync(p, "utf8");
  const refs = files.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  if (/NFCNDEFReaderSession|NFCTagReaderSession|nfc/i.test(refs) && !/NFCReaderUsageDescription/.test(txt))
    add("MED", "missing-nfc-usage", `Ползва NFC, но липсва NFCReaderUsageDescription в Info.plist. (${p})`);
  if (/Face ?ID|LAPolicy|evaluatePolicy/.test(refs) && !/NSFaceIDUsageDescription/.test(txt))
    add("MED", "missing-faceid-usage", `Ползва Face ID, но липсва NSFaceIDUsageDescription в Info.plist. (${p})`);
}

// ─── 5. TWA Digital Asset Links ───────────────────────────────────────────────
const twa = files.find((f) => /twa-manifest\.json$/.test(f));
if (twa) {
  add("INFO", "twa-assetlinks",
    "TWA: assetlinks.json трябва да носи **production SHA-256 на Google Play App Signing** (не upload key-а), " +
    "иначе се появява URL лента. Провери и Lighthouse ≥ 80.");
}

// ─── 6. @capacitor/preferences за чувствителни данни (евристика) ─────────────
for (const f of files) {
  if (!/\.(js|ts|jsx|tsx|vue|html)$/.test(f)) continue;
  let txt = ""; try { txt = readFileSync(f, "utf8"); } catch { continue; }
  if (/@capacitor\/preferences/.test(txt) && /(token|password|secret|pin|medical|health|patient)/i.test(txt))
    add("MED", "insecure-preferences",
      `@capacitor/preferences НЕ е криптиран, а изглежда пази чувствително. Ползвай secure-storage плъгин (Keychain/Keystore). (${f})`);
}

// ─── доклад ───────────────────────────────────────────────────────────────────
const order = { HIGH: 0, MED: 1, INFO: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev]);
if (JSON_OUT) {
  const fails = findings.filter((f) => f.sev === "HIGH");
  const warnings = findings.filter((f) => f.sev !== "HIGH");
  console.log(JSON.stringify({ pass: fails.length === 0, fails, warnings }, null, 2));
  process.exit(fails.length ? 1 : 0);
}
if (!findings.length) { console.log(`✅ store-readiness: чисто (${files.length} файла в ${root}).`); process.exit(0); }
console.log(`store-readiness: ${findings.length} находки (${root})\n`);
for (const f of findings) console.log(`[${f.sev}] (${f.id}) ${f.msg}`);
const high = findings.filter((f) => f.sev === "HIGH").length;
console.log(`\n${high} HIGH · ${findings.length - high} по-ниски. (Евристично — потвърди ръчно.)`);
process.exit(high > 0 ? 1 : 0);
