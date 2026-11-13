// Режими на защита (6.0): Basic · Standard · Strict — за всички сайтове (`mode`) и за сайт (`siteModes`).
// Чиста логика (без chrome.*): кой режим важи за хост и кои скриптове за страницата да регистрира service
// worker-ът. Класически скрипт → globalThis.SA_MODES: importScripts в SW, background.scripts във Firefox,
// <script> в popup-а и Настройки; tests/modes.test.mjs го пуска във vm.
//
//   basic    — само мрежово блокиране: на сайта не се инжектира нищо наше (без скриване, бисквитки,
//              анти-адблок, скриптлети). Най-леко; почти нищо не се чупи.
//   standard — по подразбиране: всичко, но скриптовете за страницата — само в главната рамка
//              (+ рамките на платформите за съгласие за бисквитки). Measured: in-frame content scripts
//              cost ~0.7 MB per frame (tools/perf_memory.mjs, 6.11.2026).
//   strict   — поведението на 5.8: всичко и във всички рамки.
//
// Граница (Chrome): рамка се съди по СВОЯ адрес. Режимът на сайт важи за неговите рамки от същия сайт;
// чужда рамка в него следва глобалния режим.
(function (root) {
  const MODES = ["basic", "standard", "strict"];
  const DEFAULT_MODE = "standard";
  // a name with dots, an IPv4 address, or a single label (localhost, an intranet name — the SW accepts them too)
  const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$|^(?:\d{1,3}\.){3}\d{1,3}$|^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const MAX_SITES = 1000; // every entry is two match patterns in each registration, and Chrome copies them into every page process

  const normMode = (m) => (MODES.includes(m) ? m : DEFAULT_MODE);
  const isHost = (h) => typeof h === "string" && HOST_RE.test(h);
  const isIP = (h) => IP_RE.test(h);

  /** Само валидни хостове и режими; „standard“ като изключение пазим (може глобалният да е друг). */
  function cleanSiteModes(v, max = MAX_SITES) {
    const out = {};
    if (!v || typeof v !== "object" || Array.isArray(v)) return out;
    for (const [h0, m] of Object.entries(v)) {
      const h = typeof h0 === "string" ? h0.trim().toLowerCase().replace(/^www\./, "") : "";
      if (isHost(h) && MODES.includes(m) && Object.keys(out).length < max) out[h] = m;
    }
    return out;
  }

  /** Режимът за хост: най-конкретният запис по веригата (news.example.com → example.com), иначе глобалният. */
  function effectiveMode(host, mode, siteModes) {
    const sm = cleanSiteModes(siteModes); // the same entries the registrations are built from
    let h = String(host || "").toLowerCase().replace(/^www\./, "");
    while (h) {
      if (Object.prototype.hasOwnProperty.call(sm, h) && MODES.includes(sm[h])) return sm[h];
      const i = h.indexOf(".");
      if (i < 0) break;
      h = h.slice(i + 1);
    }
    return normMode(mode);
  }

  const patternsFor = (hosts) => {
    const out = [];
    for (const d of hosts) {
      if (!isHost(d)) continue;
      out.push(`*://${d}/*`);
      if (!isIP(d)) out.push(`*://*.${d}/*`); // 3lift.com has subdomains; 10.0.0.1 has none
    }
    return out;
  };

  // Платформите, които рисуват прозореца за съгласие в собствена рамка (същият списък като
  // CMP_FRAME_HOST_RE в cookies.js — tests/modes.test.mjs ги държи равни).
  const CMP_FRAME_HOSTS = ["privacy-mgmt.com", "sp-prod.net", "trustarc.com", "truste.com", "consentmanager.net",
    "cookielaw.org", "onetrust.com", "usercentrics.eu", "cookiebot.com", "didomi.io"];

  // Скриптовете за страницата (бяха в manifest-а до 5.8). allFrames: null = по режима.
  const PAGE_SCRIPTS = [
    { key: "content", js: ["scriptlets/policy.js", "content.js"], css: ["content.css"], runAt: "document_start", allFrames: null },
    { key: "generic", css: ["cosmetic_generic.css"], runAt: "document_start", allFrames: false },
    { key: "cookies", js: ["cookies.js"], css: ["cookies.css"], runAt: "document_idle", allFrames: null },
    { key: "antiadblock", js: ["antiadblock.js"], css: ["antiadblock.css"], runAt: "document_idle", allFrames: false },
    { key: "picker", js: ["picker.js"], css: ["picker.css"], runAt: "document_idle", allFrames: false },
  ];
  const PAGE_PREFIX = "sa-page-";

  // The entries as regions (6.1): an entry whose mode differs from what it inherits (its nearest ancestor
  // entry, else the global mode) starts a region; the others change nothing. Chrome's excludeMatches always
  // beats matches, so a region nested inside an excluded one (example.com basic → news.example.com strict)
  // needs a registration of its own: regions are grouped by nesting level, and one level's exclusions
  // (the regions directly below it) never cover a root of the same level.
  function regions(mode, siteModes) {
    const g = normMode(mode);
    const sm = cleanSiteModes(siteModes);
    const parentEntry = (h) => {
      let x = h;
      for (;;) {
        const i = x.indexOf(".");
        if (i < 0 || isIP(h)) return "";
        x = x.slice(i + 1);
        if (Object.prototype.hasOwnProperty.call(sm, x)) return x;
      }
    };
    const inherited = (h) => { const p = parentEntry(h); return p ? sm[p] : g; };
    const roots = Object.keys(sm).filter((h) => sm[h] !== inherited(h));
    const rootSet = new Set(roots);
    const parentRoot = (h) => { let p = parentEntry(h); while (p && !rootSet.has(p)) p = parentEntry(p); return p; }; // "" = the global region
    const level = new Map([["", 0]]);
    const lvl = (h) => { if (!level.has(h)) level.set(h, 1 + lvl(parentRoot(h))); return level.get(h); };
    return { g, sm, roots: roots.map((h) => ({ host: h, mode: sm[h], level: lvl(h), parent: parentRoot(h) })) };
  }

  /** Per mode: the groups to register — { matches, excludeMatches } per nesting level, outermost first. */
  function modeGroups(mode, siteModes, m) {
    const { g, roots } = regions(mode, siteModes);
    const byLevel = new Map();
    const group = (lv) => { if (!byLevel.has(lv)) byLevel.set(lv, { level: lv, hosts: [], excl: [] }); return byLevel.get(lv); };
    if (g === m) group(0);
    const modeOf = (h) => (h === "" ? g : (roots.find((r) => r.host === h) || {}).mode);
    for (const r of roots) {
      if (r.mode === m) group(r.level).hosts.push(r.host);
      else if (modeOf(r.parent) === m) group(r.level - 1).excl.push(r.host);
    }
    return [...byLevel.values()].sort((a, b) => a.level - b.level)
      .map((x) => ({ level: x.level, matches: x.level === 0 ? ["<all_urls>"] : patternsFor(x.hosts), excludeMatches: patternsFor(x.excl) }))
      .filter((x) => x.matches.length);
  }

  /**
   * Регистрациите на скриптовете за страницата за даден глобален режим и режими по сайт.
   * Връща масив за chrome.scripting.registerContentScripts (без persistAcrossSessions — SW го добавя).
   * Id: `sa-page-<режим>-<скрипт>` за най-външната група, `sa-page-<режим><N>-<скрипт>` за вложените.
   */
  function pageScriptPlan(mode, siteModes) {
    const g = normMode(mode);
    const out = [];
    for (const m of ["standard", "strict"]) {
      modeGroups(mode, siteModes, m).forEach(({ matches, excludeMatches }, n) => {
      const tag = n === 0 ? m : m + (n + 1);
      const cmp = patternsFor(CMP_FRAME_HOSTS);
      for (const s of PAGE_SCRIPTS) {
        const reg = { id: `${PAGE_PREFIX}${tag}-${s.key}`, matches, runAt: s.runAt, allFrames: s.allFrames === null ? m === "strict" : s.allFrames };
        if (s.js) reg.js = s.js;
        if (s.css) reg.css = s.css;
        // Standard: бисквитките в главната рамка навсякъде, а в рамките — само на платформите за съгласие
        // (отделна регистрация, затова тук те се изключват — иначе главна рамка на такъв хост би ги получила два пъти).
        const ex = m === "standard" && s.key === "cookies" ? excludeMatches.concat(cmp) : excludeMatches;
        if (ex.length) reg.excludeMatches = ex;
        out.push(reg);
      }
      // Рамките на платформите за съгласие се съдят по СВОЯ адрес, не по сайта около тях — затова само при
      // глобален Standard (при Strict cookies.js вече е във всички рамки, при Basic — никъде).
      if (m === "standard" && g === "standard" && n === 0) {
        out.push({ id: `${PAGE_PREFIX}standard-cookies-cmp`, matches: cmp, js: ["cookies.js"], css: ["cookies.css"], runAt: "document_idle", allFrames: true });
      }
      });
    }
    return out;
  }

  /** Хостовете, записани в Basic (за отчети и тестове). */
  function basicSites(siteModes) {
    const sm = cleanSiteModes(siteModes);
    return Object.keys(sm).filter((h) => sm[h] === "basic");
  }

  /** Изключенията за MAIN-world скриптовете, регистрирани по друг признак (uBO парчетата, gpc.js): сайтовете,
   *  които ПОЧВАТ Basic регион. Ако под такъв има сайт с друго ниво, родителят се изключва само точно (без
   *  поддомейните) — иначе excludeMatches би отнел скриптовете и на поддомейна, а 64 парчета по нива не струват. */
  function basicExcludes(mode, siteModes) {
    const { roots } = regions(mode, siteModes);
    const out = [];
    for (const r of roots) {
      if (r.mode !== "basic") continue;
      const nested = roots.some((x) => x.mode !== "basic" && x.parent === r.host);
      if (nested) out.push(`*://${r.host}/*`);
      else out.push(...patternsFor([r.host]));
    }
    return out;
  }

  root.SA_MODES = { MODES, DEFAULT_MODE, MAX_SITES, PAGE_PREFIX, CMP_FRAME_HOSTS, PAGE_SCRIPTS, normMode, isHost, cleanSiteModes, effectiveMode, regions, modeGroups, pageScriptPlan, basicSites, basicExcludes, patternsFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
