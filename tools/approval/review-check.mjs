#!/usr/bin/env node
// tools/approval/review-check.mjs — „ръката" на Тайния агент (v1.0).
//
// Статичен скан за чести спъвания пред ревютата на Apple / Google / Meta / Chrome.
// Zero-dep, near-zero-FP: докладва СИГНАЛИ (не присъда) с точен file:line и правилото.
// Fail-closed по желание: с --strict връща ненулев код при намерени блокери (CI gate).
//
// Употреба:
//   node tools/approval/review-check.mjs <път>        # четим отчет
//   node tools/approval/review-check.mjs <път> --json  # машинен изход
//   node tools/approval/review-check.mjs <път> --strict # exit 1 при блокери (CI)
//
// Не заменя живата проверка на официалните политики — допълва я.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const JSON_OUT = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", "Pods", ".gradle"]);
const TEXT_EXT = new Set([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".json", ".plist", ".xml", ".html", ".md", ".txt", ".yml", ".yaml", ".gradle", ".kt", ".swift"]);

const files = [];
(function walk(dir) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith(".") && e.name !== ".well-known") { if (SKIP_DIR.has(e.name)) continue; }
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p); }
    else if (TEXT_EXT.has(extname(e.name)) || basename(e.name) === "apple-app-site-association") files.push(p);
  }
})(ROOT);

const findings = [];
const add = (severity, rule, platform, file, line, msg) =>
  findings.push({ severity, rule, platform, file: relative(ROOT, file) || file, line, msg });

const readSafe = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const lineOf = (txt, idx) => txt.slice(0, idx).split("\n").length;

// --- Проектни сигнали (агрегати) ---
let hasManifestJson = false, manifestPath = "", manifestTxt = "";
let hasPrivacyManifest = false, hasAASA = false, hasAssetlinks = false;
let mentionsPrivacyPolicy = false, mentionsDataDeletion = false;
let capacitorRemoteUrl = null;

for (const f of files) {
  const name = basename(f);
  const txt = readSafe(f);
  const low = txt.toLowerCase();

  if (name === "PrivacyInfo.xcprivacy") hasPrivacyManifest = true;
  if (name === "apple-app-site-association") hasAASA = true;
  if (name === "assetlinks.json") hasAssetlinks = true;
  if (/privacy[\s_-]?policy/i.test(txt) && /https?:\/\//.test(txt)) mentionsPrivacyPolicy = true;
  if (/data[\s_-]?deletion|delete[\s_-]?(my|your|account|data)/i.test(txt)) mentionsDataDeletion = true;

  // Chrome MV3 manifest
  if (name === "manifest.json" && /"manifest_version"\s*:\s*3/.test(txt)) {
    hasManifestJson = true; manifestPath = f; manifestTxt = txt;
    if (/"host_permissions"\s*:\s*\[[^\]]*(<all_urls>|"\*:\/\/\*\/\*"|\*:\/\/\*\/)/.test(txt))
      add("warn", "chrome-broad-host", "Chrome", f, lineOf(txt, txt.indexOf("host_permissions")), "Широки host_permissions (<all_urls>/*://*/*) → по-строг преглед; стесни до нужните match patterns с обосновка.");
    const perms = (txt.match(/"permissions"\s*:\s*\[([\s\S]*?)\]/) || [])[1] || "";
    for (const risky of ["tabs", "webRequest", "cookies", "history", "management", "debugger", "proxy", "downloads"])
      if (new RegExp(`"${risky}"`).test(perms)) add("info", "chrome-sensitive-perm", "Chrome", f, lineOf(txt, txt.indexOf("permissions")), `Чувствително permission "${risky}" → искай само ако single-purpose го изисква; обоснови в privacy tab.`);
  }
  if (name === "manifest.json" && /"manifest_version"\s*:\s*2/.test(txt))
    add("block", "chrome-mv2", "Chrome", f, lineOf(txt, txt.indexOf("manifest_version")), "Manifest V2 → Chrome Web Store приема само MV3. Мигрирай (виж Хромаджията).");

  // Capacitor тънка обвивка (Apple 4.2)
  if (name === "capacitor.config.json" || name === "capacitor.config.ts") {
    const m = txt.match(/["']?url["']?\s*:\s*["'](https?:\/\/[^"']+)["']/);
    if (m) capacitorRemoteUrl = { file: f, line: lineOf(txt, m.index), url: m[1] };
  }

  // Cloaking / reviewer-sniffing (всички платформи — бан-ниво)
  const cloak = /(isreviewer|is_review|reviewmode|review_mode|app[\s_]?review|apple\s*review)/i;
  if (cloak.test(txt) && /(user[\s_-]?agent|navigator\.userAgent|req\.ip|x-forwarded-for|geoip|country\s*[=!]=)/i.test(low)) {
    const idx = txt.search(cloak);
    add("block", "cloaking", "Всички", f, lineOf(txt, idx), "Възможно cloaking: различно поведение при ревю (UA/IP/geo снифинг). БАН-ниво (Apple 2.3.1 / Google Deception). Махни всяко review-gating.");
  }

  // „test/beta/coming soon" в store metadata
  if (/fastlane\/metadata|store[\s_-]?listing|app_?store|play[\s_-]?listing/i.test(f) || /(description|full_description|short_description|subtitle)\.(txt|md)$/i.test(f)) {
    for (const bad of ["coming soon", "beta", "test version", "placeholder", "lorem ipsum", "not final"]) {
      const i = low.indexOf(bad);
      if (i >= 0) add("warn", "metadata-placeholder", "Apple/Google", f, lineOf(txt, i), `Metadata съдържа „${bad}" → Apple 2.1/2.3, Google Store Listing. Махни преди submit.`);
    }
  }

  // Тайни в клиентски бъндъл (сигнал; вж. secret-scan за пълно)
  if (/(AIza[0-9A-Za-z_\-]{10,}|sk_live_[0-9A-Za-z]{10,}|EAACEdEose0cBA|app_?secret\s*[:=]\s*["'][0-9a-f]{20,})/.test(txt) && !/example|placeholder|xxxx|your_?key/i.test(low))
    add("warn", "secret-in-bundle", "Всички", f, lineOf(txt, txt.search(/AIza|sk_live_|EAAC|app_?secret/i)), "Възможна тайна в клиентски код → извлича се при decompile (OWASP MASWE-0005). Дръж я сървърно; ротирай, ако е реална.");
}

// --- Агрегатни изводи ---
if (capacitorRemoteUrl) {
  const nativeHints = files.some((f) => /@capacitor\/(push-notifications|local-notifications)|corenfc|nfcndef|biometric|@capacitor-community\/barcode|haptics/i.test(readSafe(f)));
  add(nativeHints ? "info" : "warn", "apple-4.2-webwrapper", "Apple", capacitorRemoteUrl.file, capacitorRemoteUrl.line,
    `Capacitor server.url сочи отдалечен сайт (${capacitorRemoteUrl.url}) → риск по Apple 4.2 (minimum functionality). ${nativeHints ? "Открита нативна стойност — потвърди, че е достатъчна." : "Не открих нативни плъгини — добави нативна стойност (NFC/push/offline/biometrics)."}`);
}
if (!mentionsPrivacyPolicy)
  add("warn", "no-privacy-policy", "Всички", ROOT, 0, "Не открих Privacy Policy URL в проекта → задължителен минимум за Apple, Google Play, Meta live, Google OAuth, Chrome. Добави и синхронизирай с реалната обработка.");
if (hasManifestJson || files.some((f) => /androidmanifest\.xml$/i.test(f)))
  if (!hasPrivacyManifest && files.some((f) => /\.(swift|plist)$/i.test(f) || /ios\//i.test(f)))
    add("info", "no-privacy-manifest", "Apple", ROOT, 0, "iOS проект без PrivacyInfo.xcprivacy → нужен за нови/ъпдейтнати апове с commonly-used SDK-та (required-reason API).");
if (files.some((f) => /facebook|graph\.facebook|fbsdk|meta-?app/i.test(readSafe(f))) && !mentionsDataDeletion)
  add("info", "meta-no-data-deletion", "Meta", ROOT, 0, "Открита Meta/Graph интеграция без видим Data Deletion механизъм → задължителен за live mode при обработка на данни.");

// --- Отчет ---
const order = { block: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.platform.localeCompare(b.platform));
const blockers = findings.filter((f) => f.severity === "block").length;

if (JSON_OUT) {
  await emitJsonNow({ root: ROOT, scanned: files.length, findings, summary: { blockers, warns: findings.filter((f) => f.severity === "warn").length, infos: findings.filter((f) => f.severity === "info").length } }, STRICT && blockers ? 1 : 0);
}

const icon = { block: "✗", warn: "▲", info: "·" };
console.log(`\n🕵  Тайният агент — проверка за изрядност пред платформите (${files.length} файла сканирани)\n`);
if (!findings.length) console.log("  ✓ Няма открити чести спъвания. (Пак потвърди живите политики преди submit.)");
for (const f of findings) console.log(`  ${icon[f.severity]} [${f.platform}] ${f.rule} — ${f.file}${f.line ? ":" + f.line : ""}\n      ${f.msg}`);
console.log(`\nИтог: ${blockers} блокери · ${findings.filter((f) => f.severity === "warn").length} предупреждения · ${findings.filter((f) => f.severity === "info").length} бележки`);
console.log(blockers ? "СТАТУС: има блокери — оправи ги преди submit." : "СТАТУС: няма твърди блокери (жива проверка все пак задължителна).");
process.exit(STRICT && blockers ? 1 : 0);
