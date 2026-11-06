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
  const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$|^(?:\d{1,3}\.){3}\d{1,3}$/;

  const normMode = (m) => (MODES.includes(m) ? m : DEFAULT_MODE);
  const isHost = (h) => typeof h === "string" && HOST_RE.test(h);

  /** Само валидни хостове и режими; „standard“ като изключение пазим (може глобалният да е друг). */
  function cleanSiteModes(v, max = 2000) {
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
    const sm = siteModes || {};
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
      if (!/^\d/.test(d)) out.push(`*://*.${d}/*`);
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

  /**
   * Регистрациите на скриптовете за страницата за даден глобален режим и режими по сайт.
   * Връща масив за chrome.scripting.registerContentScripts (без persistAcrossSessions — SW го добавя).
   */
  function pageScriptPlan(mode, siteModes) {
    const g = normMode(mode);
    const sm = cleanSiteModes(siteModes);
    const out = [];
    for (const m of ["standard", "strict"]) {
      const sites = Object.keys(sm).filter((h) => sm[h] === m);
      const others = Object.keys(sm).filter((h) => sm[h] !== m);
      let matches, excludeMatches;
      if (g === m) { matches = ["<all_urls>"]; excludeMatches = patternsFor(others); }
      else if (sites.length) { matches = patternsFor(sites); excludeMatches = patternsFor(others.filter((o) => sites.some((s) => o.endsWith("." + s)))); }
      else continue;
      const cmp = patternsFor(CMP_FRAME_HOSTS);
      for (const s of PAGE_SCRIPTS) {
        const reg = { id: `${PAGE_PREFIX}${m}-${s.key}`, matches, runAt: s.runAt, allFrames: s.allFrames === null ? m === "strict" : s.allFrames };
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
      if (m === "standard" && g === "standard") {
        out.push({ id: `${PAGE_PREFIX}standard-cookies-cmp`, matches: cmp, js: ["cookies.js"], css: ["cookies.css"], runAt: "document_idle", allFrames: true });
      }
    }
    return out;
  }

  /** Хостовете, на които скриптлетите и другите MAIN-world скриптове не вървят (сайтове в Basic). */
  function basicSites(siteModes) {
    const sm = cleanSiteModes(siteModes);
    return Object.keys(sm).filter((h) => sm[h] === "basic");
  }

  root.SA_MODES = { MODES, DEFAULT_MODE, PAGE_PREFIX, CMP_FRAME_HOSTS, PAGE_SCRIPTS, normMode, cleanSiteModes, effectiveMode, pageScriptPlan, basicSites, patternsFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
