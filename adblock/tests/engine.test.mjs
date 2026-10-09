// Engine: печени директиви (единственият източник), всички scriptlet-и, ReDoS guard, няма канал на живо.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, ok, done, makeWorld, loadEngine, mkAnchor } from "./_harness.mjs";
const g = globalThis;

// ---------- 1) печени директиви: билд от тестов списък в temp (репото не се пипа) ----------
{
  const dir = mkdtempSync(join(tmpdir(), "sa-"));
  const list = join(dir, "list.txt"), out = join(dir, "main.js");
  writeFileSync(list, [
    "##+js(set-constant, canRunAds, true)",
    "##+js(abort-on-property-read, adBlockDetected)",
    "##+js(no-setTimeout-if, showAdWall, 1000)",
    "##+js(no-window-open-if, /ads?\\./)",
    "##+js(json-prune, ads adPlacements)",
    "##+js(no-fetch-if, doubleclick)",
    "example.com##+js(remove-cookie, /^track_/)",
    "example.com##+js(set-cookie, consent_seen, true)",
  ].join("\n") + "\n");
  execFileSync("node", [join(ROOT, "tools", "build_scriptlets.mjs"), `--list=${list}`, `--out=${out}`], { stdio: "ignore" });
  const { win, jar } = makeWorld("www.example.com");
  jar.cookie = "track_id=abc"; jar.cookie = "session=keep";
  loadEngine(out);
  ok("baked: replaced natives stringify exactly like the originals (setTimeout, JSON.parse, fetch, open) — no tell for anti-adblock checks",
    Function.prototype.toString.call(win.setTimeout) === "() => 42" && Function.prototype.toString.call(JSON.parse) === "function parse() { [native code] }" &&
    /^\(u\) =>/.test(Function.prototype.toString.call(win.fetch)) && Function.prototype.toString.call(win.open) === "() => ({ closed: false })");
  ok("baked: set-constant pins value", win.canRunAds === true && (win.canRunAds = false, win.canRunAds === true));
  ok("baked: aopr throws on read", (() => { try { void win.adBlockDetected; return false; } catch (e) { return e instanceof ReferenceError; } })());
  ok("baked: nostif drops matching source+delay", win.setTimeout(function () { showAdWall(); }, 1000) === 0);
  ok("baked: nostif keeps non-matching", win.setTimeout(function () { showAdWall(); }, 500) === 42 && win.setTimeout(function () { other(); }, 1000) === 42);
  ok("baked: nowoif blocks ad url, allows normal", win.open("http://ads.x/") === null && win.open("http://good.com").closed === false);
  ok("baked: json-prune removes ad fields", (() => { const o = JSON.parse('{"ads":1,"adPlacements":2,"v":3}'); return o.ads === undefined && o.adPlacements === undefined && o.v === 3; })());
  ok("baked: remove-cookie expired matching, kept session", jar.cookie.includes("session=keep") && !jar.cookie.includes("track_id"));
  ok("baked: set-cookie planted consent (absent before)", jar.cookie.includes("consent_seen=true"));
  jar.cookie = "consent_seen=false";
  loadEngine(out);
  ok("baked: set-cookie never overwrites an existing cookie", jar.cookie.includes("consent_seen=false"));
  await win.fetch("http://doubleclick.net/x").then((r) => ok("baked: no-fetch-if returns empty Response for match", r instanceof globalThis.Response));
  await win.fetch("http://good.com/x").then((r) => ok("baked: no-fetch-if passes non-match through", typeof r === "string" && r.startsWith("REAL:")));
}

// Build a temp main.js from list lines (the real build + validator) and load it.
function bake(lines) {
  const dir = mkdtempSync(join(tmpdir(), "sa-b-"));
  const list = join(dir, "list.txt"), out = join(dir, "main.js");
  writeFileSync(list, lines.join("\n") + "\n");
  execFileSync("node", [join(ROOT, "tools", "build_scriptlets.mjs"), `--list=${list}`, `--out=${out}`], { stdio: "ignore" });
  loadEngine(out);
  return readFileSync(out, "utf8");
}

// ---------- 2) няма канал на живо: директивите идват само от пакета (5.1.4) ----------
{
  const { win, docL } = makeWorld("www.example.com");
  const src = bake(["example.com##+js(set-constant, bakedOnly, true)"]);
  ok("no live channel: the engine listens for no DOM event (window or document)", Object.keys(win._cap).length === 0 && Object.keys(win._bub).length === 0 && Object.keys(docL).length === 0);
  globalThis.document.dispatchEvent(new globalThis.CustomEvent("sa-scriptlets", { detail: JSON.stringify([{ h: "example.com", d: ["set-constant", "fromPage", "true"] }]) }));
  ok("no live channel: a page-dispatched directive does nothing", win.fromPage === undefined && win.bakedOnly === true);
  ok("no live channel: the shipped engine has no sa-scriptlets listener", !/sa-scriptlets/.test(readFileSync(join(ROOT, "scriptlets", "main.js"), "utf8")) && !/sa-scriptlets/.test(src));
}

// ---------- 2a) печените scriptlet-и: всички IMPL + валидатора на билда ----------
{
  const { win, nodes, jar } = makeWorld("www.example.com");
  const a1 = mkAnchor("https://t.co/out?u=https%3A%2F%2Freal.com%2Fx");
  const a3 = mkAnchor("https://evil.com/r?u=javascript%3Aalert(1)");
  nodes["a.track"] = [a1, a3];
  const s1 = { nodeType: 1, tagName: "SCRIPT", textContent: "if(adblockDetected){wall()}" };
  nodes.script = [s1];
  const ad = { removed: [], removeAttribute(a) { this.removed.push(a); } }; nodes[".ad-slot[data-ad]"] = [ad];
  win.adBlockDetected = 1;
  bake([
    "example.com##+js(set-constant, canRunAds, true)",
    "example.com##+js(nowebrtc)",
    "example.com##+js(href-sanitizer, a.track, ?u)",
    "example.com##+js(remove-node-text, script, adblockDetected)",
    "example.com##+js(abort-on-stack-trace, adBlockDetected, evilscript)",
    "example.com##+js(set-cookie, cookie_consent, accepted)",
    "example.com##+js(remove-attr, data-ad, .ad-slot[data-ad])",
    "other.com##+js(set-constant, otherFlag, true)",
    // the build validator drops these: code-looking values, prototype paths, unknown names, unlisted cookie values
    "example.com##+js(set-constant, x1, alert(1))",
    "example.com##+js(set-constant, __proto__.polluted, true)",
    "example.com##+js(eval, document.cookie)",
    "example.com##+js(hasOwnProperty, x)",
    "example.com##+js(set-cookie, sid, stolen-session-value)",
    // ReDoS: a rejected regex matches NOTHING → the timer is not dropped, no freeze
    "example.com##+js(no-setTimeout-if, /.*.*=/)",
    "example.com##+js(no-setTimeout-if, /((.)|(.))+~/)",
  ]);
  ok("baked: host-scoped set-constant; other hosts untouched", win.canRunAds === true && win.otherFlag === undefined);
  ok("baked: nowebrtc blocks RTCPeerConnection", (() => { try { new win.RTCPeerConnection(); return false; } catch (e) { return true; } })());
  ok("baked: href-sanitizer rewrote ?u, refused javascript:", a1.href === "https://real.com/x" && a3.href.includes("javascript%3A"));
  ok("baked: remove-node-text blanked matching script", s1.textContent === "");
  ok("baked: set-cookie planted consent value", jar.cookie.includes("cookie_consent=accepted"));
  ok("baked: remove-attr on an ad selector", ad.removed.includes("data-ad"));
  function evilscript() { return win.adBlockDetected; }
  ok("baked: abort-on-stack-trace throws for matching caller only",
    (() => { try { evilscript(); return false; } catch (e) { return e instanceof ReferenceError; } })() && win.adBlockDetected === 1);
  ok("build: unsafe/unknown directives dropped", win.x1 === undefined && ({}).polluted === undefined && !jar.cookie.includes("sid="));
  const t0 = Date.now();
  ok("baked: catastrophic needles rejected, no freeze", win.setTimeout(function () { return "a".repeat(6000) + "="; }, 5) === 42 && Date.now() - t0 < 500);
}

// ---------- 2b) popup / popunder blocker (baked $popup hosts) ----------
{
  const dir2 = mkdtempSync(join(tmpdir(), "sa-pop-"));
  const list2 = join(dir2, "list.txt"), out2 = join(dir2, "main.js"), pop = join(dir2, "popup.json");
  writeFileSync(list2, "\n"); writeFileSync(pop, JSON.stringify(["popads.net", "adcash.com"]));
  execFileSync("node", [join(ROOT, "tools", "build_scriptlets.mjs"), `--list=${list2}`, `--out=${out2}`, `--popup=${pop}`], { stdio: "ignore" });
  const { win } = makeWorld("www.example.com");
  g.URL = URL;
  loadEngine(out2);
  ok("popup: window.open to a $popup host (and subdomains) is refused", win.open("https://serve.popads.net/x") === null && win.open("http://adcash.com/") === null);
  ok("popup: normal targets, same-host and non-http pass through", win.open("https://good.com/a").closed === false && win.open("https://www.example.com/p").closed === false && win.open("about:blank").closed === false);
  ok("popup: evil-lookalike host is not matched", win.open("https://popads.net.evil.com/").closed === false);
}

// ---------- 4) останалите IMPL + поправките от pre-flight ревюто ----------
{
  const { win, nodes } = makeWorld("www.example.com");
  win.detectorFlag = 0;
  // aeld wraps window.EventTarget.prototype.addEventListener (as in a real page); the
  // recorder goes in FIRST so the wrapper sits in front of it.
  const calls = []; const origAdd = globalThis.EventTarget.prototype.addEventListener;
  globalThis.EventTarget.prototype.addEventListener = function (t, l) { calls.push(t); };
  win.EventTarget = globalThis.EventTarget;
  const el = { classList: { removed: [], remove(c) { this.removed.push(c); } } }; nodes[".content"] = [el];
  bake([
    "example.com##+js(abort-on-property-write, detectorFlag)",
    "example.com##+js(no-setInterval-if, pollAds, 500)",
    "example.com##+js(addEventListener-defuser, click, popunder)",
    "example.com##+js(remove-class, ad-overlay, .content)",
    "example.com##+js(no-window-open-if, /((.)|(.))+~/)",          // отхвърлен regex → НЕ блокира
    "example.com##+js(abort-on-stack-trace, gate, chrome-extension)", // собствени кадри се игнорират
    "example.com##+js(set-cookie, PHPSESSID, 1)",                     // denied name
    "example.com##+js(set-cookie, csrf_token, true)",                 // denied name (substring)
  ]);
  ok("aopw: write throws, read still works", (() => { try { win.detectorFlag = 1; return false; } catch (e) { return e instanceof ReferenceError && win.detectorFlag === 0; } })());
  ok("nosiif: drops matching interval, keeps others", win.setInterval(function () { pollAds(); }, 500) === 0 && win.setInterval(function () { pollAds(); }, 100) === 77);
  ok("remove-class strips class on matching elements", el.classList.removed.includes("ad-overlay"));
  // The wrapper must sit in front of the recorder: click+popunder is swallowed
  // (never reaches it), a different type or a different handler passes through.
  const et = new globalThis.EventTarget();
  et.addEventListener("click", function () { popunder(); });
  et.addEventListener("scroll", function () { popunder(); });
  et.addEventListener("click", function () { harmless(); });
  globalThis.EventTarget.prototype.addEventListener = origAdd;
  ok("aeld: matching listener swallowed, non-matching type/handler pass through", calls.join() === "scroll,click");
  ok("nowoif with REJECTED regex does NOT block window.open (matches nothing)", win.open("https://news.example.org/a").closed === false);
  win.gate = 1;
  ok("aost: needle matching only our own chrome-extension frames never fires", (() => { try { return win.gate === 1; } catch (e) { return false; } })());
  ok("set-cookie: session/csrf-style names refused", !globalThis.document.cookie.includes("PHPSESSID") && !globalThis.document.cookie.includes("csrf_token"));
}

// ---------- 5) acs: abort-current-script по текста на inline скрипта ----------
{
  const { win } = makeWorld("www.example.com");
  win.adConfig = { on: true };
  bake(["example.com##+js(abort-current-script, adConfig, detectAdblock)"]);
  globalThis.document.currentScript = { tagName: "SCRIPT", textContent: "function detectAdblock(){}" };
  const threw = (() => { try { void win.adConfig; return false; } catch (e) { return e instanceof ReferenceError; } })();
  globalThis.document.currentScript = { tagName: "SCRIPT", textContent: "var legit = 1;" };
  ok("acs: throws for matching inline script, passes for others", threw && win.adConfig && win.adConfig.on === true);
}

// ---------- uBO data chunk: a SUBDOMAIN exception cancels the parent's directive ----------
{
  const chunk = { "mt.de": [["no-setTimeout-if", ".call(null)", "10"]], "job.mt.de": [["#@", "no-setTimeout-if", ".call(null)", "10"]] };
  const run = (host) => {
    const { win } = makeWorld(host);
    Object.defineProperty(globalThis.document, "__tbabScriptletChunk", { value: chunk, configurable: true });
    loadEngine();
    return win.setTimeout(function () { (function () {}).call(null); }, 10);
  };
  ok("uBO chunk: parent directive applies on mt.de and www.mt.de", run("mt.de") === 0 && run("www.mt.de") === 0);
  ok("uBO chunk: job.mt.de#@#+js cancels it there (and on its subdomains)", run("job.mt.de") === 42 && run("a.job.mt.de") === 42);
}

done();
