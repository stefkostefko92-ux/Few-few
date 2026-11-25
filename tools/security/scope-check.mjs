// scope-check.mjs — чистото ядро на техническата ограда за оторизиран пентест (ядро: оторизация).
// Решава дали едно действие е позволено спрямо активните ПОДПИСАНИ ангажименти. Без мрежа/състояние
// (хукът ѝ подава вече заредени и ПРОВЕРЕНИ по подпис ангажименти) → детерминирана и тествана.
//
// Модел (решение на собственика, 2026-11-15; строи се оградата, не се атакува сега):
//  • НЯМА активен ангажимент (нормална работа) → спираме само ТЕЖКАТА АРТИЛЕРИЯ (nmap/sqlmap/…) и
//    DoS срещу ВЪНШЕН хост; всичко друго минава (нула фалшиви позитиви за обикновените агенти).
//  • ИМА активен ангажимент (пентест тече) → всеки мрежов verb/URL към ВЪНШЕН хост трябва да е в
//    allowlist-а на ангажимента; иначе блок (fail-closed). Нашите/регистрите остават позволени.
//  • DoS е забранен ПО ВСЯКО ВРЕМЕ, дори срещу цел в обхвата. Red line, не договаряне.
// Само ангажимент с `verified === true` (Ed25519, engagement.mjs) брои — подправен/инжектиран файл е
// несъществуващ. При неясна/непарсваема цел по време на ангажимент: fail-closed блок.

const OUR_DOMAINS = [
  "carbonstealth.eu", "vizitka-bg.com", "mastilko-bg.com", "evanita-bg.com",
  "scuolabulgaramilano.it", "eternaltouch.it",
];
// Хостове за нормална разработка — агентите ги ползват постоянно (регистри, CDN, нашият доставчик).
const DEV_HOSTS = [
  "github.com", "raw.githubusercontent.com", "codeload.github.com", "objects.githubusercontent.com",
  "registry.npmjs.org", "npmjs.com", "pypi.org", "files.pythonhosted.org", "crates.io", "static.crates.io",
  "cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "code.jquery.com",
  "fonts.googleapis.com", "fonts.gstatic.com", "api.anthropic.com", "proxy.golang.org", "sum.golang.org",
];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const INTERNAL = [...OUR_DOMAINS, ...DEV_HOSTS];
const isLoopback = (h) => LOOPBACK.has(h) || /^127(?:\.\d{1,3}){3}$/.test(h);
const normHost = (host) => String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");

/** Вътрешен (наш/регистър/loopback) или външен хост. Суфикс-измама и не-ASCII са външни. */
export function classifyHost(host) {
  const h = String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return "external";
  if (/[^\x00-\x7f]/.test(h)) return "external"; // хомоглиф/кирилица в хоста
  if (isLoopback(h)) return "internal"; // цялата 127.0.0.0/8; строг IPv4, не префикс-низ (127.evil.example е чужд)
  for (const d of INTERNAL) if (h === d || h.endsWith("." + d)) return "internal";
  return "external";
}

/** Наш хост в тесния смисъл: loopback или наш домейн. Регистрите/CDN (DEV_HOSTS) са ЧУЖДИ системи —
 *  обикновена работа с тях минава, но офанзивен инструмент срещу тях иска обхват (находка на
 *  Прониквача, 15.11.2026: цел на клиента, хостната на github.com/cdnjs, беше извън оградата). */
export function isOwnHost(host) {
  const h = normHost(host);
  if (!h || /[^\x00-\x7f]/.test(h)) return false;
  if (isLoopback(h)) return true;
  return OUR_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

const FILE_EXT = /\.(txt|json|js|mjs|cjs|ts|html?|php|xml|md|py|sh|conf|cfg|ini|ya?ml|lock|log|csv|tsv|sql|pdf|png|jpe?g|svg|zip|gz|tar)$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,23}$/i;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

// Офанзивни инструменти (тежка артилерия) — само на командна позиция, не като аргумент/низ.
const OFFENSIVE = "commix|tplmap|dalfox|xsstrike|arjun|nmap|masscan|zmap|sqlmap|nikto|wpscan|hydra|medusa|ncrack|patator|gobuster|dirb|dirbuster|ffuf|wfuzz|feroxbuster|nuclei|metasploit|msfconsole|msfvenom|sslscan|sslyze|testssl|openvas|nessus|amass|sublist3r|dnsrecon|enum4linux|crackmapexec|responder|aircrack-ng|ettercap|bettercap|setoolkit|beef";
// Командна позиция: поглъща низ от env-присвоявания (FOO=1) и обвивки (sudo/env/time/nice/…) преди
// инструмента — иначе `FOO=1 nmap` или `time nmap` се четат като нормална работа (ред-тейм F2).
// Начало на команда е и кавичката след `bash -c`/`sh -c`, `$(` и обратната кавичка (находка на
// Прониквача: `bash -c "…"` не се разпознаваше); кавичка след echo/printf НЕ е — споменаване ≠ изпълнение.
const CMD_POS = "(?:^|[\\n;&|]|&&|\\|\\||\\$\\(|`|\\s-c\\s+[\"'])\\s*(?:(?:sudo|env|time|nice|nohup|stdbuf|command|xargs|[A-Za-z_]\\w*=[^\\s]*)\\s+)*(?:[\\w./-]*/)?";
const OFFENSIVE_RE = new RegExp(CMD_POS + "(" + OFFENSIVE + ")\\b", "i");
const NET_VERB_RE = new RegExp(CMD_POS + "(curl|wget|nc|ncat|netcat|telnet|ssh|scp|sftp|rsync|ping|dig|host|nslookup|whois|openssl)\\b", "i");

export const isOffensiveTool = (cmd) => OFFENSIVE_RE.test(String(cmd || ""));
export const hasNetVerb = (cmd) => NET_VERB_RE.test(String(cmd || "")) || /\/dev\/tcp\//.test(String(cmd || ""));

// DoS образци — забранени по всяко време.
export function isDoS(cmd) {
  const c = String(cmd || "");
  if (/--flood\b/i.test(c)) return true;
  if (/\b(slowloris|torshammer|goldeneye|hulk|loic|hping3?)\b[^\n]*(--flood|--faster|--rand-source)/i.test(c)) return true;
  if (/\b(slowloris|torshammer|goldeneye)\b/i.test(c)) return true;
  if (/\bsiege\b[^\n]*-c\s*0*([2-9]\d{2,}|\d{4,})/i.test(c)) return true;
  if (/\bab\b[^\n]*-n\s*0*\d{6,}/i.test(c)) return true; // ≥100000 заявки
  if (/\bab\b[^\n]*-c\s*0*([2-9]\d{2,}|\d{4,})/i.test(c)) return true; // конкурентност ≥200
  if (/while\s+true[^\n]*;\s*do[^\n]*\b(curl|wget|nc|ab|ping|nmap)\b/i.test(c)) return true;
  return false;
}

/** Извлича целевите хостове (+ път, когато е URL) от Bash команда или WebFetch URL. */
export function extractTargets(input) {
  const out = [], seen = new Set();
  const add = (host, path) => { const h = String(host || "").split("@").pop().replace(/:\d+$/, ""); if (!h || seen.has(h + (path || ""))) return; seen.add(h + (path || "")); out.push({ host: h, path: path || null }); };
  if (input.url) { try { const u = new URL(input.url); add(u.hostname, u.pathname); } catch { /* непарсваем */ } }
  const cmd = String(input.command || "");
  for (const m of cmd.matchAll(/\bhttps?:\/\/([^\s/"'<>|`)]+)(\/[^\s"'|`)<>]*)?/gi)) add(m[1], m[2] || "/");
  for (const m of cmd.matchAll(/\/dev\/tcp\/([^\s/"'`]+)\/\d+/gi)) add(m[1], null);
  // Голи аргументи-хостове (nmap/nc стил): токени, които са домейн/IP, не флаг, не файл.
  if (cmd) for (const tok of cmd.split(/\s+/)) {
    const t = tok.replace(/^["']|["']$/g, "");
    if (!t || t.startsWith("-") || t.includes("://") || t.includes("$") || FILE_EXT.test(t)) continue;
    if (IPV4_RE.test(t) || DOMAIN_RE.test(t) || LOOPBACK.has(t.toLowerCase())) add(t, null);
  }
  return out;
}

/** Само подписани ангажименти, чийто прозорец покрива `now`. */
export function activeEngagements(engagements, now) {
  const t = +now;
  return (engagements || []).filter((e) => e && e.verified === true && +new Date(e.notBefore) <= t && t <= +new Date(e.notAfter));
}

const ipv4ToInt = (ip) => {
  const p = String(ip).split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
/** IPv4 CIDR съвпадение; невалиден запис (префикс > 32, лош адрес) не оторизира нищо (fail-closed). */
export function inCidr(host, cidr) {
  const m = String(cidr).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  const ip = ipv4ToInt(host);
  if (!m || ip == null) return false;
  const bits = Number(m[2]), net = ipv4ToInt(m[1]);
  if (net == null || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((net & mask) >>> 0);
}
// Точно съвпадение на хоста (без диви карти и без наследяване на поддомейни) или IPv4 в CIDR запис.
const inScope = (e, host) => (e.hosts || []).some((h) => {
  const entry = String(h).toLowerCase();
  return entry.includes("/") ? inCidr(host, entry) : entry === host.toLowerCase();
});
// Изключеният път е по граница „/“: „/admin“ изключва „/admin“ и „/admin/…“, не и „/administrator“.
const excluded = (e, path) => !!path && (e.excludePaths || []).some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));

// Лимит на заявките от ROE (`limits.rate_rps`), наложен технически: офанзивният инструмент трябва да
// носи своя флаг за темпо и стойността да е в лимита (находка на Прониквача: rateLimit не се ползваше).
// rate = заявки/s; delay = секунди между заявки (1/delay ≤ лимита). Инструмент без известен флаг за
// темпо при зададен лимит → блок (fail-closed); TLS скенерите правят шепа заявки и са изключени.
const RATE_RULES = {
  nmap: { re: /--max-rate[=\s]+(\d+(?:\.\d+)?)/, kind: "rate" },
  masscan: { re: /--(?:max-)?rate[=\s]+(\d+(?:\.\d+)?)/, kind: "rate" },
  ffuf: { re: /\s-rate[=\s]+(\d+(?:\.\d+)?)/, kind: "rate" },
  nuclei: { re: /\s(?:-rl|-rate-limit)[=\s]+(\d+(?:\.\d+)?)/, kind: "rate" },
  feroxbuster: { re: /--rate-limit[=\s]+(\d+(?:\.\d+)?)/, kind: "rate" },
  sqlmap: { re: /--delay[=\s]+(\d+(?:\.\d+)?)/, kind: "delay" },
  commix: { re: /--delay[=\s]+(\d+(?:\.\d+)?)/, kind: "delay" },
  nikto: { re: /\s-Pause[=\s]+(\d+(?:\.\d+)?)/i, kind: "delay" },
  wfuzz: { re: /\s-s[=\s]+(\d+(?:\.\d+)?)/, kind: "delay" },
};
const RATE_EXEMPT = new Set(["sslscan", "sslyze", "testssl"]);
const OFFENSIVE_ALL_RE = new RegExp(CMD_POS + "(" + OFFENSIVE + ")\\b", "gi");

/** Причина за нарушение на лимита или null. Чиста функция (за тест и за хука). */
export function rateViolation(cmd, rps) {
  if (rps == null || !(Number(rps) > 0)) return null;
  const c = String(cmd || "");
  for (const m of c.matchAll(OFFENSIVE_ALL_RE)) {
    const tool = m[1].toLowerCase();
    if (RATE_EXEMPT.has(tool)) continue;
    const rule = RATE_RULES[tool];
    if (!rule) return `${tool} няма известен флаг за темпо, а ангажиментът има лимит ${rps} заявки/s — ползвай инструмент с лимит`;
    const v = c.match(rule.re);
    if (!v) return `${tool} без флаг за темпо при лимит ${rps} заявки/s от ROE`;
    const val = Number(v[1]);
    const effective = rule.kind === "rate" ? val : val > 0 ? 1 / val : Infinity;
    if (!(effective <= Number(rps) + 1e-9)) return `${tool}: темпото ${+effective.toFixed(3)} заявки/s е над лимита ${rps} от ROE`;
  }
  return null;
}

const allow = (reason, engagementId) => ({ decision: "allow", reason, engagementId });
const block = (reason, host) => ({ decision: "block", reason, host, severity: "high" });

/** Главното решение. Виж модела в началото на файла. */
export function scopeCheck(input, engagements, now = new Date()) {
  const cmd = String(input.command || "");
  if (isDoS(cmd)) return block("DoS образец — забранен по всяко време (red line)");
  const active = activeEngagements(engagements, now);
  const offensive = isOffensiveTool(cmd);
  const netVerb = hasNetVerb(cmd) || !!input.url;
  const targets = extractTargets(input);

  if (active.length === 0) {
    if (!offensive) return allow("нормална работа — няма активен ангажимент");
    if (targets.length === 0) return block("офанзивен инструмент без ясна цел и без активен ангажимент — оторизация липсва");
    for (const t of targets) if (!isOwnHost(t.host)) return block(`офанзивен инструмент към чужд хост ${t.host} без активен ангажимент`, t.host);
    return allow("офанзивен инструмент само срещу наш хост");
  }
  // Активен ангажимент: всяка външна мрежова цел трябва да е в обхват.
  // Щом extractTargets е извлякъл цел, проверяваме обхвата ВИНАГИ — не гейтваме върху разпознат verb
  // (httpie/python/префикс не са в NET_VERB_RE, но целта е реална; ред-тейм F3 — иначе fail-open).
  if (targets.length === 0) {
    if (!netVerb && !offensive) return allow("без мрежова цел");
    return block("активен ангажимент, но целта е неясна/непарсваема — fail-closed (не рискуваме извън обхват)");
  }
  const matched = [];
  for (const t of targets) {
    // Офанзивен инструмент: вътрешен е само наш хост; регистрите/CDN са чужди системи и искат обхват.
    if (offensive ? isOwnHost(t.host) : classifyHost(t.host) === "internal") continue;
    const match = active.find((e) => inScope(e, t.host));
    if (!match) return block(`целта ${t.host} не е в allowlist-а на активен ангажимент`, t.host);
    if (excluded(match, t.path)) return block(`пътят ${t.path} е изключен от обхвата на ангажимент ${match.id}`, t.host);
    matched.push(match);
  }
  if (offensive) for (const e of new Set(matched)) {
    const why = rateViolation(cmd, e.rateLimit);
    if (why) return block(`${why} (ангажимент ${e.id})`);
  }
  return allow("в обхвата на активен ангажимент", matched[0]?.id ?? active.find((e) => targets.some((t) => inScope(e, t.host)))?.id);
}
