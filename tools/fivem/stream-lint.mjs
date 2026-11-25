#!/usr/bin/env node
// tools/fivem/stream-lint.mjs — статичен линтер за АКТИВИ в FiveM ресурс (MLO, дрехи, ливреи).
//
// Допълва manifest-lint.mjs (той гледа Lua/манифест; този гледа stream/ и мета файловете), без да пуска сървъра:
//   1. размер на файловете в stream/ спрямо праг (предупреждение / грешка);
//   2. непознати разширения и работни файлове (.blend, .psd, .xml и т.н.), които не бива да се стрийм-ват;
//   3. дублирани имена на активи (без значение на регистъра) — единият тихо печели;
//   4. мета файл, който иска data_file, но няма запис в fxmanifest — и обратно (запис без файл / извън files);
//   5. ymap/ytyp без this_is_a_map;
//   6. именуване на дрехите по шаблона (freemode ydd/ytd), празнини в номерацията, ydd без ytd.
//
// Употреба:  node tools/fivem/stream-lint.mjs <папка-на-ресурс> [--warn-mb 16] [--error-mb 64] [--json]
// Изход: таблица; exit 0 = няма ГРЕШКИ (предупрежденията не го сриват), exit 1 = има ГРЕШКИ.
//
// ВАЖНО (граница): размерът на диска е ПРОКСИ. Предупрежденията на FiveM мерят физическа памет на актива,
// не байтове във файла. Праговете по подразбиране идват от общностна тема (виж references/streaming-budget.md
// в fivem-mlo) и са „за проверка“; верният замер е конзолата на локален FXServer. Евристичен помощник.

import { readdirSync, statSync, lstatSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const MIB = 1024 * 1024;
export const DEFAULTS = { warnMb: 16, errorMb: 64 };
export const MAX_FILES = 50000;

// Формати, които играта стрийм-ва от stream/ (CodeWalker/Sollumz изход след конвертиране до бинарни).
export const STREAM_EXT = new Set([
  ".ydr", ".ydd", ".yft", ".ytd", ".ybn", ".ymap", ".ytyp", ".ycd", ".ypt", ".yld", ".ynv", ".ynd", ".ymt", ".ymf", ".awc",
]);
// Работни/изходни файлове: не принадлежат в ресурс за сървър (зареждат се като боклук или не се зареждат).
export const WORK_EXT = new Set([
  ".blend", ".blend1", ".psd", ".dds", ".png", ".jpg", ".jpeg", ".tga", ".fbx", ".obj", ".xml", ".zip", ".rar", ".7z", ".tmp",
]);

// Мета файл (по име) → очакван data_file тип. Типовете са от docs.fivem.net/docs/game-references/data-files/ (2026-11-02).
export const META_RULES = [
  [/handling[^/]*\.meta$/i, "HANDLING_FILE"],
  [/^vehicles[^/]*\.meta$/i, "VEHICLE_METADATA_FILE"],
  [/^carvariations[^/]*\.meta$/i, "VEHICLE_VARIATION_FILE"],
  [/^carcols[^/]*\.meta$/i, "CARCOLS_FILE"],
  [/^vehiclelayouts[^/]*\.meta$/i, "VEHICLE_LAYOUTS_FILE"],
  [/shop[^/]*\.meta$/i, "SHOP_PED_APPAREL_META_FILE"],
  [/^peds[^/]*\.meta$/i, "PED_METADATA_FILE"],
  [/timecycle[^/]*\.xml$/i, "TIMECYCLEMOD_FILE"],
  [/overlay[^/]*\.xml$/i, "PED_OVERLAY_FILE"],
  [/\.dat151\.rel$/i, "AUDIO_GAMEDATA"],
  [/\.dat54\.rel$/i, "AUDIO_SOUNDDATA"],
];

// Шаблон за дрехи (freemode). Потвърдени примери в Sollumz docs: `jbib_007_u.ydd`, `jbib_diff_007_a_uni.ytd`.
// Префиксът на колекцията (`mp_m_freemode_01[_пакет]^`) е конвенция на общността — „за проверка“ срещу вашия билд.
const COMP = "(?:head|berd|hair|uppr|lowr|hand|feet|teef|accs|task|decl|jbib)";
const PROP = "(?:p_head|p_eyes|p_ears|p_mouth|p_lhand|p_rhand|p_lwrist|p_rwrist|p_hip|p_lfoot|p_rfoot)";
const PREFIX = "(?:(mp_[mf]_freemode_01(?:_[a-z0-9_]+?)?)\\^)?";
export const CLOTH_YDD = new RegExp(`^${PREFIX}(${COMP}|${PROP})_(\\d{3})(?:_([ur]))?\\.ydd$`, "i");
export const CLOTH_YTD = new RegExp(`^${PREFIX}(${COMP}|${PROP})_diff_(\\d{3})_([a-z])(?:_([a-z]{3}))?\\.ytd$`, "i");
const LOOKS_CLOTH = new RegExp(`^(?:mp_[mf]_freemode_01[a-z0-9_]*\\^)|^(?:${COMP}|${PROP})_(?:diff_)?\\d`, "i");

/**
 * Глоб (`*` в рамките на сегмент, `**` през сегменти, `?`) срещу път с `/`. Чувствителен към регистъра, освен ако ci=true.
 * Динамично програмиране O(|глоб|·|път|) — без бектрекинг, затова няма ReDoS (за разлика от глоб → RegExp).
 */
const GLOB_TOKENS = new Map(); // шаблон (+регистър) → токени; токенизира се веднъж (Кодаджията: 50 000 файла × 400 data_file = 167 s)
export function globMatch(glob, path, ci = false) {
  const g = ci ? String(glob).toLowerCase() : String(glob);
  const s = ci ? String(path).toLowerCase() : String(path);
  if (!/[*?]/.test(g)) return g === s; // точен шаблон — най-честият случай в data_file
  let tk = GLOB_TOKENS.get(g);
  if (!tk) { tk = tokenizeGlob(g); if (GLOB_TOKENS.size < 10_000) GLOB_TOKENS.set(g, tk); }
  return matchTokens(tk, s);
}
function tokenizeGlob(g) {
  const tk = [];
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") { if (g[i + 1] === "*") { while (g[i + 1] === "*") i++; if (g[i + 1] === "/") { i++; tk.push("**/"); } else tk.push("**"); } else tk.push("*"); }
    else tk.push(c === "?" ? "?" : c);
  }
  return tk;
}
function matchTokens(tk, s) {
  let cur = new Uint8Array(s.length + 1); cur[0] = 1;
  for (const t of tk) {
    const nxt = new Uint8Array(s.length + 1);
    if (t === "**/") { let any = 0; for (let k = 0; k <= s.length; k++) { if (cur[k]) any = 1; nxt[k] = k > 0 && s[k - 1] === "/" ? any : cur[k]; } } // „**/“ може да е и празно
    else if (t === "**") { let any = 0; for (let k = 0; k <= s.length; k++) { if (cur[k]) any = 1; nxt[k] = any; } }
    else if (t === "*") { let run = 0; for (let k = 0; k <= s.length; k++) { if (cur[k]) run = 1; nxt[k] = run; if (s[k] === "/") run = 0; } }
    else if (t === "?") { for (let k = 0; k < s.length; k++) if (cur[k] && s[k] !== "/") nxt[k + 1] = 1; }
    else { for (let k = 0; k < s.length; k++) if (cur[k] && s[k] === t) nxt[k + 1] = 1; }
    cur = nxt;
  }
  return cur[s.length] === 1;
}

/** Съвместим помощник: обект с .test(път), чувствителен към регистъра (ci=true → без значение на регистъра). */
export function globToRe(g, ci = false) { return { test: (p) => globMatch(g, p, ci) }; }

/**
 * Малък линеен токенизатор на Lua манифест: маха коментарите (`--`, `--[[ ]]`, `--[==[ ]==]`) САМО извън низове,
 * връща токени {k:"s"|"i"|"p", v}. Без регекси с бектрекинг → без ReDoS; незатворен коментар/низ стига до края.
 */
export function tokenize(src) {
  const t = [];
  const n = src.length;
  const LONG = /\[(=*)\[/y;
  const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === "-" && src[i + 1] === "-") {
      LONG.lastIndex = i + 2;
      const m = LONG.exec(src);
      if (m) { const close = src.indexOf("]" + m[1] + "]", LONG.lastIndex); i = close < 0 ? n : close + m[1].length + 2; }
      else { const nl = src.indexOf("\n", i); i = nl < 0 ? n : nl + 1; }
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, v = "";
      while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\" && j + 1 < n) j++; v += src[j]; j++; }
      t.push({ k: "s", v }); i = j + 1; continue;
    }
    if (c === "[") {
      LONG.lastIndex = i;
      const m = LONG.exec(src);
      if (m) { let from = LONG.lastIndex; const nl = src.slice(from, from + 2); from += /^(\r\n|\n\r)/.test(nl) ? 2 : /^[\r\n]/.test(nl) ? 1 : 0; // Lua: първият нов ред след [[ не е част от низа
        const close = src.indexOf("]" + m[1] + "]", from); t.push({ k: "s", v: src.slice(from, close < 0 ? n : close) }); i = close < 0 ? n : close + m[1].length + 2; continue; }
    }
    IDENT.lastIndex = i;
    const id = IDENT.exec(src);
    if (id) { t.push({ k: "i", v: id[0] }); i = IDENT.lastIndex; continue; }
    if (!/\s/.test(c)) t.push({ k: "p", v: c });
    i++;
  }
  return t;
}

/** Парсва data_file / files / this_is_a_map от fxmanifest.lua върху токени (не пълен Lua парсер). */
export function parseManifest(src) {
  const tk = tokenize(String(src));
  const dataFiles = [], files = [];
  let thisIsAMap = false;
  const skip = (j, ch) => { while (tk[j] && tk[j].k === "p" && tk[j].v === ch) j++; return j; };
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i];
    if (t.k !== "i") continue;
    if (t.v === "data_file") {
      let j = skip(i + 1, "(");
      const a = tk[j];
      if (a && a.k === "s") {
        j = skip(skip(j + 1, ")"), "(");
        const b = tk[j];
        if (b && b.k === "s") dataFiles.push({ type: a.v.toUpperCase(), path: b.v });
      }
    } else if (t.v === "file" || t.v === "files") {
      let j = skip(i + 1, "(");
      if (tk[j] && tk[j].k === "p" && tk[j].v === "{") {
        for (j++; j < tk.length && tk[j].k !== "i" && !(tk[j].k === "p" && tk[j].v === "}"); j++) if (tk[j].k === "s") files.push(tk[j].v);
      } else if (tk[j] && tk[j].k === "s") files.push(tk[j].v);
    } else if (t.v === "this_is_a_map") {
      const j = skip(i + 1, "(");
      const v = tk[j];
      if (v && v.k === "s") thisIsAMap = !["", "no", "false", "0"].includes(v.v.trim().toLowerCase());
      else if (v && v.k === "i" && v.v === "false") thisIsAMap = false;
      else thisIsAMap = true;
    }
  }
  return { dataFiles, files, thisIsAMap };
}

/**
 * Чиста функция: list = [{rel, size}] (rel с `/`, спрямо корена на ресурса), manifestSrc = текст или null.
 * Връща {findings:[{sev,code,where,msg}]}. Тестваема без файлова система.
 */
export function lintResource(list, manifestSrc, opts = {}) {
  const warnB = (opts.warnMb ?? DEFAULTS.warnMb) * MIB;
  const errB = (opts.errorMb ?? DEFAULTS.errorMb) * MIB;
  const out = [];
  const add = (sev, code, where, msg) => out.push({ sev, code, where, msg });
  if (opts.legacy) add("WARN", "legacy-manifest", "__resource.lua", "`__resource.lua` е остарял — мигрирай към fxmanifest.lua с fx_version + game (виж manifest-lint).");
  const all = list.map((f) => ({ ...f, rel: f.rel.replace(/\\/g, "/") }));
  const inStream = all.filter((f) => /^stream\//i.test(f.rel));
  const man = manifestSrc == null ? null : parseManifest(manifestSrc);
  if (man == null) add("ERROR", "no-manifest", "fxmanifest.lua", "Липсва fxmanifest.lua — ресурсът не се зарежда.");

  // 1+2. размер, разширения, имена на файлове в stream/
  for (const f of inStream) {
    const ext = extname(f.rel).toLowerCase();
    const mb = (f.size / MIB).toFixed(1);
    if (f.size > errB) add("ERROR", "oversized", f.rel, `${mb} MiB > ${(errB / MIB)} MiB — над червения праг; раздели/компресирай/намали LOD (прокси: размер на диск, не физическа памет).`);
    else if (f.size > warnB) add("WARN", "large", f.rel, `${mb} MiB > ${(warnB / MIB)} MiB — вероятно oversized предупреждение в конзолата; провери на локален сървър.`);
    if (WORK_EXT.has(ext)) add("ERROR", "work-file", f.rel, `Работен файл (${ext}) в stream/ — не се пакетира за сървър; махни го (изходниците стоят извън ресурса).`);
    else if (!STREAM_EXT.has(ext)) add("WARN", "unknown-ext", f.rel, `Непознато разширение „${ext || "(няма)"}“ в stream/ — играта не го стрийм-ва; поставено грешно ли е?`);
    const nm = basename(f.rel);
    if (/\s/.test(nm) || /[^\x21-\x7e]/.test(nm)) add("ERROR", "bad-name", f.rel, "Интервал или не-ASCII знак в името на актива — хешът/зареждането се чупят; ползвай a-z, 0-9, _ и ^.");
  }

  // 3. дубли (без регистър; играта хешира името в малки букви)
  const seen = new Map();
  for (const f of inStream) {
    const k = basename(f.rel).toLowerCase();
    if (seen.has(k)) add("ERROR", "dup-asset", f.rel, `Дублирано име на актив (вече е ${seen.get(k)}) — единият тихо печели; преименувай.`);
    else seen.set(k, f.rel);
  }

  // 4. мета файлове ↔ data_file
  if (man) {
    const exactDf = (rel) => man.dataFiles.filter((d) => globMatch(d.path, rel, false));
    const anyDf = (rel) => { const e = exactDf(rel); return e.length ? e : man.dataFiles.filter((d) => globMatch(d.path, rel, true)); };
    for (const f of all) {
      const nm = basename(f.rel);
      const ext = extname(nm).toLowerCase();
      const rule = META_RULES.find(([re]) => re.test(nm));
      if (rule) {
        const covering = anyDf(f.rel); // само по регистър несъвпадение се докладва веднъж, като case-mismatch по-долу
        if (!covering.length) add("ERROR", "meta-no-data-file", f.rel, `Файлът иска data_file '${rule[1]}', но fxmanifest няма запис за него.`);
        else if (!covering.some((d) => d.type === rule[1])) add("WARN", "data-file-type", f.rel, `Записан е като '${covering[0].type}', очаквах '${rule[1]}' по името — провери типа.`);
        if (covering.length && !/^stream\//i.test(f.rel)) {
          if (!man.files.some((g) => globMatch(g, f.rel, false))) {
            if (man.files.some((g) => globMatch(g, f.rel, true))) add("WARN", "case-mismatch", f.rel, "Пътят във files { } съвпада с файла само без значение на регистъра — на Linux сървър няма да се намери.");
            else add("WARN", "not-in-files", f.rel, "Има data_file, но файлът не е в files { } — клиентът няма да го получи.");
          }
        }
      } else if (ext === ".meta") {
        add("INFO", "unclassified-meta", f.rel, ".meta файл без известно правило за data_file — потвърди ръчно (docs.fivem.net/docs/game-references/data-files/).");
      }
    }
    for (const d of man.dataFiles) {
      if (all.some((f) => globMatch(d.path, f.rel, false))) continue;
      if (all.some((f) => globMatch(d.path, f.rel, true))) add("WARN", "case-mismatch", d.path, `data_file '${d.type}': пътят съвпада с файл само без значение на регистъра — на Linux сървър няма да се намери.`);
      else add("ERROR", "data-file-missing-file", d.path, `data_file '${d.type}' сочи файл, който не съществува (проверен и с glob).`);
    }
    // 5. this_is_a_map при ymap/ytyp. WARN, не ERROR: docs.fivem.net описва флага само като „маркира ресурса като карта и
    // презарежда map storage“ и не казва, че ymap/ytyp без него не се зареждат (проверено 2026-11-02) — евристика.
    const mapAssets = all.filter((f) => /\.(ymap|ytyp)$/i.test(f.rel));
    if (mapAssets.length && !man.thisIsAMap) add("WARN", "no-this-is-a-map", "fxmanifest.lua", `Има ${mapAssets.length} ymap/ytyp (напр. ${mapAssets[0].rel}), но няма this_is_a_map 'yes' — картата вероятно няма да се презареди/зареди; провери на сървър.`);
    // ytyp ↔ DLC_ITYP_REQUEST: docs.fivem.net/docs/game-references/data-files/ изброява типа (CDLCItypFileMounter), но не казва,
    // че е задължителен за ytyp в stream/ (2026-11-02) → само INFO.
    const ytyps = all.filter((f) => /\.ytyp$/i.test(f.rel));
    const noReq = ytyps.filter((f) => !man.dataFiles.some((d) => d.type === "DLC_ITYP_REQUEST" && globMatch(d.path, f.rel, true)));
    if (noReq.length) add("INFO", "ytyp-no-dlc-itypreq", noReq[0].rel, `${noReq.length} ytyp без data_file 'DLC_ITYP_REQUEST' — docs.fivem.net изброява типа, но не го обявява за задължителен; някои MLO го изискват. Провери на сървър.`);
    if (man.thisIsAMap && !all.some((f) => /\.(ymap|ytyp|ybn)$/i.test(f.rel))) add("INFO", "map-flag-no-map", "fxmanifest.lua", "this_is_a_map е зададено, но няма ymap/ytyp/ybn — излишно ли е?");
  }

  // 6. дрехи: шаблон, празнини, сираци
  const cloth = new Map(); // ключ колекция|компонент → {ydd:Set, ytd:Set}
  for (const f of inStream) {
    const nm = basename(f.rel);
    const ext = extname(nm).toLowerCase();
    if (ext !== ".ydd" && ext !== ".ytd") continue;
    if (!LOOKS_CLOTH.test(nm)) continue;
    const m = (ext === ".ydd" ? CLOTH_YDD : CLOTH_YTD).exec(nm);
    if (!m) { add("WARN", "clothing-name", f.rel, `Името не следва шаблона: [mp_m_freemode_01[_пакет]^]компонент_NNN[_u|_r].ydd / компонент_diff_NNN_буква[_раса].ytd (напр. jbib_007_u.ydd, jbib_diff_007_a_uni.ytd).`); continue; }
    const key = `${(m[1] || "").toLowerCase()}|${m[2].toLowerCase()}`;
    if (!cloth.has(key)) cloth.set(key, { ydd: new Set(), ytd: new Set(), where: f.rel });
    cloth.get(key)[ext === ".ydd" ? "ydd" : "ytd"].add(Number(m[3]));
  }
  for (const [key, v] of cloth) {
    const [pre, comp] = key.split("|");
    const label = `${pre || "(без колекция)"} ${comp}`;
    const idx = [...v.ydd].sort((a, b) => a - b);
    for (let i = 0; i < idx.length; i++) if (idx[i] !== i) { add("WARN", "clothing-gap", v.where, `${label}: празнина в номерацията (очаквах ${String(i).padStart(3, "0")}, първо е ${String(idx[i]).padStart(3, "0")}) — играта брои редовно от 000; липсата дава празни дрехи.`); break; }
    for (const n of idx) if (!v.ytd.has(n)) add("WARN", "clothing-orphan", v.where, `${label}: ydd ${String(n).padStart(3, "0")} няма диффузна текстура (ytd).`);
  }
  return { findings: out };
}

/**
 * Обхожда ресурса БЕЗ да следва symlink-ове (lstat): връзките се докладват като WARN symlink и не се влиза в тях
 * (цикъл = безкраен обход; линк навън = чужди файлове). Таван на броя файлове: WARN file-cap и спира.
 */
export function collect(root, { maxFiles = MAX_FILES } = {}) {
  const list = [], findings = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = readdirSync(dir).sort(); } catch { continue; }
    for (const e of entries) {
      if ([".git", "node_modules"].includes(e)) continue;
      const p = join(dir, e);
      let st; try { st = lstatSync(p); } catch { continue; }
      const rel = relative(root, p).split("\\").join("/");
      if (st.isSymbolicLink()) { findings.push({ sev: "WARN", code: "symlink", where: rel, msg: "Символна връзка — не се следва (цикъл/чужди файлове); замени я с реален файл или я махни." }); continue; }
      if (st.isDirectory()) { stack.push(p); continue; }
      if (list.length >= maxFiles) { findings.push({ sev: "WARN", code: "file-cap", where: rel, msg: `Над ${maxFiles} файла — обходът е спрян; проверката е непълна.` }); return { list, findings }; }
      list.push({ rel, size: st.size });
    }
  }
  return { list, findings };
}

export function formatTable(findings) {
  const rows = [["Тежест", "Код", "Къде", "Съобщение"], ...findings.map((f) => [f.sev, f.code, f.where, f.msg])];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => String(r[i]).length))); // пътят не се реже
  return rows.map((r) => [0, 1, 2].map((i) => String(r[i]).padEnd(w[i])).join(" | ") + " | " + r[3]).join("\n");
}

function die(msg) { console.error(`stream-lint: ${msg}`); process.exit(2); }

/** Положително число от флаг; липсваща/нечислова стойност → exit 2 (преди тихо изключваше прага). */
function numArg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v === undefined || !/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0) die(`${name} иска положително число в MiB, получих „${v ?? "(нищо)"}“`);
  return Number(v);
}

function runCli() {
  const root = process.argv[2];
  if (!root || root.startsWith("--") || !existsSync(root) || !statSync(root).isDirectory()) {
    console.error("Употреба: node tools/fivem/stream-lint.mjs <папка-на-ресурс> [--warn-mb 16] [--error-mb 64] [--json]");
    process.exit(2);
  }
  const warnMb = numArg("--warn-mb", DEFAULTS.warnMb), errorMb = numArg("--error-mb", DEFAULTS.errorMb);
  if (warnMb > errorMb) die(`--warn-mb (${warnMb}) е над --error-mb (${errorMb})`);
  const { list, findings: walkFindings } = collect(root);
  const mp = join(root, "fxmanifest.lua"), lp = join(root, "__resource.lua");
  const legacy = !existsSync(mp) && existsSync(lp);
  const manifest = existsSync(mp) ? readFileSync(mp, "utf8") : legacy ? readFileSync(lp, "utf8") : null;
  const { findings } = lintResource(list, manifest, { warnMb, errorMb, legacy });
  findings.push(...walkFindings);
  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  const e = findings.filter((f) => f.sev === "ERROR").length, w = findings.filter((f) => f.sev === "WARN").length, i = findings.length - e - w;
  if (process.argv.includes("--json")) console.log(JSON.stringify({ root, files: list.length, errors: e, warnings: w, info: i, findings }, null, 2));
  else {
    console.log(`stream-lint — ${root} (${list.length} файла)\n`);
    console.log(findings.length ? formatTable(findings) : "✓ чисто (няма находки)");
    console.log(`\n${e} ERROR · ${w} WARN · ${i} INFO`);
  }
  process.exit(e ? 1 : 0);
}

// Пускане като CLI: realpath и от двете страни — пътят с интервал/кирилица, Windows и symlink (Кодаджията, 02.11.2026).
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (process.argv[1] && isMain()) runCli();
