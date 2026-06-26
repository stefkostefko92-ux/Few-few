#!/usr/bin/env node
// tools/chrome/mv3-lint.mjs — статичен линтер за Chrome разширения (Manifest V3).
//
// Хваща типичните причини за отказ от Web Store ревюто и MV3 капаните, БЕЗ да зарежда
// разширението: чете manifest.json + сканира .js/.html в папката за отдалечен код, eval,
// localStorage в service worker, blocking webRequest, широки права и слаб CSP.
//
// Употреба:  node tools/chrome/mv3-lint.mjs <папка-на-разширението>
// Изход: 0 = чисто (само INFO), 1 = има HIGH находки. Degrade-ва грациозно при липсващи файлове.
//
// Това е евристичен помощник, не заместител на `chrome://extensions` Load unpacked + реалното ревю.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] || ".";
const findings = [];
const add = (sev, code, msg, where) => findings.push({ sev, code, msg, where });

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git") continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// --- манифест ---
const manifestPath = join(root, "manifest.json");
if (!existsSync(manifestPath)) {
  add("HIGH", "no-manifest", "Липсва manifest.json в корена на папката.", manifestPath);
  report();
  process.exit(1);
}

let mf = {};
try { mf = JSON.parse(readFileSync(manifestPath, "utf8")); }
catch (e) { add("HIGH", "manifest-parse", `manifest.json не е валиден JSON: ${e.message}`, manifestPath); report(); process.exit(1); }

if (mf.manifest_version !== 3)
  add("HIGH", "not-mv3", `manifest_version = ${mf.manifest_version} — Web Store приема само MV3. Мигрирай.`, "manifest.json");

// MV2 остатъци
if (mf.browser_action) add("HIGH", "mv2-browser_action", "browser_action е MV2 → ползвай `action`.", "manifest.json");
if (mf.page_action) add("HIGH", "mv2-page_action", "page_action е MV2 → ползвай `action`.", "manifest.json");
if (mf.background?.scripts) add("HIGH", "mv2-bg-scripts", "background.scripts е MV2 → ползвай `background.service_worker`.", "manifest.json");
if (mf.background?.persistent !== undefined) add("HIGH", "mv2-bg-persistent", "background.persistent няма смисъл в MV3 (SW е ефимерен).", "manifest.json");
if (mf.background?.page) add("HIGH", "mv2-bg-page", "background.page е MV2 → SW + (при нужда) offscreen document.", "manifest.json");

// права
const perms = [...(mf.permissions || []), ...(mf.optional_permissions || [])];
const hosts = [...(mf.host_permissions || []), ...(mf.optional_host_permissions || [])];
const broad = hosts.filter((h) => /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/.test(h));
if (broad.length)
  add("MEDIUM", "broad-hosts", `Широки host_permissions (${broad.join(", ")}) → силен warning + по-бавно ревю. Стесни или ползвай activeTab.`, "manifest.json");
if (perms.includes("webRequest") && perms.includes("webRequestBlocking"))
  add("HIGH", "blocking-webrequest", "Blocking webRequest е премахнат в MV3 (само enterprise force-install) → ползвай declarativeNetRequest.", "manifest.json");
for (const sensitive of ["debugger", "proxy", "nativeMessaging", "cookies", "history", "<all_urls>"])
  if (perms.includes(sensitive) || hosts.includes(sensitive))
    add("INFO", "sensitive-perm", `Чувствително право „${sensitive}" — нужна е ясна „Purpose" обосновка за ревюто.`, "manifest.json");
if (!perms.includes("activeTab") && broad.length)
  add("INFO", "consider-activetab", "Има широки хостове, но няма activeTab — провери дали activeTab (достъп при клик, без warning) не стига.", "manifest.json");

// CSP
const csp = mf.content_security_policy;
const cspStr = typeof csp === "string" ? csp : JSON.stringify(csp || {});
if (/unsafe-inline/.test(cspStr)) add("HIGH", "csp-unsafe-inline", "CSP съдържа 'unsafe-inline' → забранено/отказ в MV3.", "manifest.json");
if (/unsafe-eval/.test(cspStr)) add("HIGH", "csp-unsafe-eval", "CSP съдържа 'unsafe-eval' → забранено в MV3 (освен wasm-unsafe-eval).", "manifest.json");
if (/https?:\/\//.test(cspStr) && /script-src/.test(cspStr))
  add("HIGH", "csp-remote-script", "CSP позволява отдалечен script хост → MV3 забранява отдалечен код.", "manifest.json");

// --- сканиране на кода ---
const files = walk(root).filter((f) => [".js", ".mjs", ".ts", ".html"].includes(extname(f)));
const swFile = typeof mf.background?.service_worker === "string" ? join(root, mf.background.service_worker) : null;

for (const f of files) {
  let src = "";
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const rel = f.replace(root, "").replace(/^\//, "");

  // отдалечен код
  if (/<script[^>]+src\s*=\s*["']https?:\/\//i.test(src))
    add("HIGH", "remote-script", "Отдалечен <script src=\"http(s)://…\"> → MV3 забранява отдалечен код. Пакетирай локално.", rel);
  if (/\beval\s*\(/.test(src))
    add("HIGH", "eval", "Употреба на eval() → забранено от MV3 CSP.", rel);
  if (/new\s+Function\s*\(/.test(src))
    add("HIGH", "new-function", "new Function(...) е форма на eval → забранено в MV3.", rel);
  if (/import\s*\(\s*[`'"]https?:\/\//.test(src))
    add("HIGH", "remote-import", "Динамичен import() на отдалечен URL → отдалечен код, забранено.", rel);

  // localStorage в service worker
  if (swFile && f === swFile && /\blocalStorage\b/.test(src))
    add("HIGH", "ls-in-sw", "localStorage в service worker — не съществува там (и е sync). Ползвай chrome.storage.", rel);

  // слушател в async callback (евристика)
  if (swFile && f === swFile && /(then|await)[\s\S]{0,200}chrome\.(runtime|alarms|action)\.on\w+\.addListener/.test(src))
    add("MEDIUM", "async-listener", "Възможен chrome.*.onX.addListener вътре в async/then — регистрирай слушателите СИНХРОННО на top level, иначе се пропускат при събуждане на SW.", rel);
}

report();
process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);

function report() {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ mv3-lint: чисто (няма находки)."); return; }
  console.log(`mv3-lint — ${findings.length} находки за ${root}:\n`);
  for (const f of findings)
    console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}
