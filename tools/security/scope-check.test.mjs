// scope-check.test.mjs — договорът на оградата за ангажименти (чист, без мрежа/GPU).
// Пише се ПРЕДИ scope-check.mjs (ядро: пари/достъп/оторизация). Всеки случай е ред-бял артефакт:
// пада, ако премахнеш проверка (прозорец, подпис, вътрешен/външен, DoS).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeCheck, extractTargets, classifyHost, isOffensiveTool, isDoS, activeEngagements } from "./scope-check.mjs";

const T0 = new Date("2026-11-15T12:00:00Z");
const eng = (over = {}) => ({
  id: "cs-2026-acme", verified: true,
  hosts: ["acme.example", "api.acme.example"],
  notBefore: "2026-11-15T00:00:00Z", notAfter: "2026-11-16T00:00:00Z",
  rateLimit: 5, excludePaths: ["/admin"], ...over,
});
const bash = (command) => ({ tool: "Bash", command });
const fetch = (url) => ({ tool: "WebFetch", url });

// ── класификация на хоста ────────────────────────────────────────────────────────────────────
test("classifyHost: loopback и нашите домейни и регистрите са вътрешни", () => {
  for (const h of ["localhost", "127.0.0.1", "::1", "0.0.0.0", "carbonstealth.eu", "medqr.carbonstealth.eu", "vizitka-bg.com", "github.com", "registry.npmjs.org", "cdn.jsdelivr.net", "api.anthropic.com"])
    assert.equal(classifyHost(h), "internal", h);
});
test("classifyHost: чужд хост е външен", () => {
  for (const h of ["acme.example", "1.2.3.4", "evil.test", "api.stripe.com.attacker.test"])
    assert.equal(classifyHost(h), "external", h);
});
test("classifyHost: поддомейн на наш домейн е вътрешен, но не и хомоглиф/суфикс-измама", () => {
  assert.equal(classifyHost("sub.carbonstealth.eu"), "internal");
  assert.equal(classifyHost("carbonstealth.eu.evil.test"), "external", "суфикс-измама не е наша");
  assert.equal(classifyHost("carbonstealthеu"), "external", "кирилско е в хоста");
});

// ── извличане на цели ────────────────────────────────────────────────────────────────────────
test("extractTargets: хост от curl/wget/nmap/nc и /dev/tcp", () => {
  assert.deepEqual(extractTargets(bash("curl -s https://acme.example/x")).map((t) => t.host), ["acme.example"]);
  assert.deepEqual(extractTargets(bash("nmap -p- 1.2.3.4")).map((t) => t.host), ["1.2.3.4"]);
  assert.deepEqual(extractTargets(bash("bash -c 'cat </dev/tcp/evil.test/4444'")).map((t) => t.host), ["evil.test"]);
  assert.deepEqual(extractTargets(fetch("https://api.acme.example/v1")).map((t) => t.host), ["api.acme.example"]);
});

// ── разпознаване на офанзивни инструменти и DoS ───────────────────────────────────────────────
test("isOffensiveTool: разпознава тежката артилерия, не нормалните инструменти", () => {
  for (const c of ["nmap -sV x", "sqlmap -u x", "nikto -h x", "hydra -l a", "gobuster dir", "ffuf -w", "wpscan --url", "masscan", "nuclei -u", "msfconsole", "medusa -h", "sslscan x"])
    assert.equal(isOffensiveTool(c), true, c);
  for (const c of ["curl https://x", "npm install", "git clone https://github.com/a/b", "node server.js", "grep -r nmapx ."])
    assert.equal(isOffensiveTool(c), false, c);
});
test("isDoS: флуд/висока честота се разпознава", () => {
  for (const c of ["hping3 --flood x", "ab -n 1000000 -c 500 http://x/", "siege -c 500", "slowloris x", "while true; do curl x; done"])
    assert.equal(isDoS(c), true, c);
  assert.equal(isDoS("ab -n 50 -c 2 http://localhost/"), false, "малък бенчмарк не е DoS");
});

// ── активни ангажименти ──────────────────────────────────────────────────────────────────────
test("activeEngagements: само подписани и в прозореца", () => {
  assert.equal(activeEngagements([eng()], T0).length, 1);
  assert.equal(activeEngagements([eng({ verified: false })], T0).length, 0, "неподписан = несъществуващ");
  assert.equal(activeEngagements([eng({ notAfter: "2026-11-15T06:00:00Z" })], T0).length, 0, "изтекъл");
  assert.equal(activeEngagements([eng({ notBefore: "2026-11-15T18:00:00Z" })], T0).length, 0, "още не започнал");
});

// ── РЕШЕНИЕТО: без активен ангажимент (нормална работа) ───────────────────────────────────────
test("без активен ангажимент: нормалната работа минава, тежката артилерия към чужд хост — блок", () => {
  assert.equal(scopeCheck(bash("curl -s https://github.com/a/b"), [], T0).decision, "allow");
  assert.equal(scopeCheck(bash("npm ci"), [], T0).decision, "allow");
  assert.equal(scopeCheck(bash("curl https://acme.example/"), [], T0).decision, "allow", "обикновен curl не е атака");
  const r = scopeCheck(bash("nmap -p- acme.example"), [], T0);
  assert.equal(r.decision, "block");
  assert.match(r.reason, /ангажимент|оторизац/i);
  assert.equal(scopeCheck(bash("nmap -p- localhost"), [], T0).decision, "allow", "наш хост сканираме свободно");
});

// ── РЕШЕНИЕТО: с активен ангажимент (пентест тече) ────────────────────────────────────────────
test("активен ангажимент: цел в обхвата — allow; извън обхвата — блок (всеки мрежов verb)", () => {
  assert.equal(scopeCheck(bash("nmap -sV api.acme.example"), [eng()], T0).decision, "allow");
  assert.equal(scopeCheck(bash("sqlmap -u https://acme.example/x"), [eng()], T0).decision, "allow");
  assert.equal(scopeCheck(fetch("https://acme.example/login"), [eng()], T0).decision, "allow");
  assert.equal(scopeCheck(bash("curl https://github.com/a"), [eng()], T0).decision, "allow", "регистрите остават");
  const out = scopeCheck(bash("curl https://other.example/"), [eng()], T0);
  assert.equal(out.decision, "block", "чужд хост по време на ангажимент — блок");
  assert.equal(scopeCheck(bash("nmap other.example"), [eng()], T0).decision, "block");
});
test("активен ангажимент: изключени пътища са блок дори за цел в обхвата", () => {
  assert.equal(scopeCheck(fetch("https://acme.example/admin/panel"), [eng()], T0).decision, "block");
});
test("DoS винаги блок — дори срещу цел в обхвата", () => {
  assert.equal(scopeCheck(bash("hping3 --flood acme.example"), [eng()], T0).decision, "block");
  assert.equal(scopeCheck(bash("ab -n 2000000 -c 800 https://acme.example/"), [eng()], T0).decision, "block");
});

// ── инжекция/подправяне ───────────────────────────────────────────────────────────────────────
test("подправен (неподписан) ангажимент не оторизира нищо (fail-closed)", () => {
  const forged = eng({ verified: false, hosts: ["other.example"] });
  assert.equal(scopeCheck(bash("nmap other.example"), [forged], T0).decision, "block");
  assert.equal(scopeCheck(fetch("https://other.example/"), [forged], T0).decision, "allow",
    "без ВАЛИДЕН активен ангажимент оставаме в нормален режим — обикновен fetch минава, но тежката артилерия не");
  assert.equal(scopeCheck(bash("nmap other.example"), [forged], T0).decision, "block");
});
test("хомоглиф/суфикс в целта не минава за хост от обхвата", () => {
  assert.equal(scopeCheck(bash("nmap acme.example.evil.test"), [eng()], T0).decision, "block");
  assert.equal(scopeCheck(fetch("https://acme.example.evil.test/"), [eng()], T0).decision, "block");
});
test("неизвестен/непарсваем вход при активен ангажимент — fail-closed блок", () => {
  // команда с мрежов verb, но хост, който не се извлича чисто → не рискуваме
  const r = scopeCheck(bash("curl $TARGET"), [eng()], T0);
  assert.equal(r.decision, "block");
  assert.match(r.reason, /неясна|непарсваема|fail-closed|целта/i);
});
