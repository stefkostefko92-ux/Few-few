// Engine: печени директиви, live канал (сигурност), всички scriptlet-и, ReDoS guard.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, ok, done, makeWorld, loadEngine, sendLive, mkAnchor } from "./_harness.mjs";

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

// ---------- 2) live канал: сигурност + всички scriptlet-и ----------
{
  const { win, nodes, jar } = makeWorld("www.example.com");
  loadEngine();
  ok("live: capture listener on window, none on document", (win._cap["sa-scriptlets"] || []).length === 1);
  const a1 = mkAnchor("https://t.co/out?u=https%3A%2F%2Freal.com%2Fx");
  const a3 = mkAnchor("https://evil.com/r?u=javascript%3Aalert(1)");
  nodes["a.track"] = [a1, a3];
  const s1 = { nodeType: 1, tagName: "SCRIPT", textContent: "if(adblockDetected){wall()}" };
  nodes.script = [s1];
  jar.cookie = "keep_me=1";
  sendLive([
    { h: "example.com", d: ["set-constant", "canRunAds", "true"] },
    { h: "example.com", d: ["nowebrtc"] },
    { h: "example.com", d: ["href-sanitizer", "a.track", "?u"] },
    { h: "example.com", d: ["remove-node-text", "script", "adblockDetected"] },
    { h: "example.com", d: ["abort-on-stack-trace", "adBlockDetected", "evilscript"] },
    { h: "example.com", d: ["set-cookie", "cookie_consent", "accepted"] },
    { h: "example.com", d: ["remove-cookie", "/keep/"] },          // must be REFUSED live
  ]);
  ok("live: host-scoped set-constant", win.canRunAds === true);
  ok("live: nowebrtc blocks RTCPeerConnection", (() => { try { new win.RTCPeerConnection(); return false; } catch (e) { return true; } })());
  ok("live: href-sanitizer rewrote ?u, refused javascript:", a1.href === "https://real.com/x" && a3.href.includes("javascript%3A"));
  ok("live: remove-node-text blanked matching script", s1.textContent === "");
  ok("live: set-cookie planted consent value", jar.cookie.includes("cookie_consent=accepted"));
  ok("live: remove-cookie REFUSED from the live channel", jar.cookie.includes("keep_me=1"));
  win.adBlockDetected = 1;
  sendLive([{ h: "example.com", d: ["abort-on-stack-trace", "adBlockDetected", "evilscript"] }]);
  function evilscript() { return win.adBlockDetected; }
  ok("live: abort-on-stack-trace throws for matching caller only",
    (() => { try { evilscript(); return false; } catch (e) { return e instanceof ReferenceError; } })() && win.adBlockDetected === 1);

  sendLive([{ h: "", d: ["set-constant", "globalFlag", "true"] }, { h: "other.com", d: ["set-constant", "otherFlag", "true"] }]);
  ok("live: h:'' and other-host directives ignored", win.globalFlag === undefined && win.otherFlag === undefined);

  sendLive([
    { h: "example.com", d: ["set-constant", "x1", "alert(1)"] },
    { h: "example.com", d: ["set-constant", "__proto__.polluted", "true"] },
    { h: "example.com", d: ["eval", "document.cookie"] },
    { h: "example.com", d: ["hasOwnProperty", "x"] },
    { h: "example.com", d: ["set-constant", "x3", "<script>evil</script>"] },
    { h: "example.com", d: ["set-cookie", "sid", "stolen-session-value"] },   // value not in dictionary
  ]);
  ok("live: unsafe/unknown directives rejected", win.x1 === undefined && win.x3 === undefined && ({}).polluted === undefined && !jar.cookie.includes("sid="));

  const pw = { removed: [], removeAttribute(a) { this.removed.push(a); } };
  for (const sel of ["[type^=pass]", "[name$=pwd]", "[autocomplete=cc-number]", "[id*=password]", "input[type=password]"]) {
    nodes[sel] = [pw]; sendLive([{ h: "example.com", d: ["remove-attr", "data-x", sel] }]);
  }
  sendLive([{ h: "example.com", d: ["remove-attr", "sandbox", ".x"] }]);
  const ta = { nodeType: 1, tagName: "TEXTAREA", textContent: "secret" }; nodes.textarea = [ta];
  sendLive([{ h: "example.com", d: ["remove-node-text", "textarea", "secret"] }]);
  ok("live: field selectors / denied attrs / denied tags refused", pw.removed.length === 0 && ta.textContent === "secret");
  const ad = { removed: [], removeAttribute(a) { this.removed.push(a); } }; nodes[".ad-slot[data-ad]"] = [ad];
  sendLive([{ h: "example.com", d: ["remove-attr", "data-ad", ".ad-slot[data-ad]"] }]);
  ok("live: legit ad selector still works", ad.removed.includes("data-ad"));

  // ReDoS: отхвърлен regex мачва НИЩО → таймерът не се дропва, няма freeze
  sendLive([{ h: "example.com", d: ["no-setTimeout-if", "/.*.*=/"] }, { h: "example.com", d: ["no-setTimeout-if", "/((.)|(.))+~/"] }]);
  const t0 = Date.now();
  ok("live: catastrophic needles rejected, no freeze", win.setTimeout(function () { return "a".repeat(6000) + "="; }, 5) === 42 && Date.now() - t0 < 500);

  // страница не може да блокира доставката; дедуп; poisoned globals
  sendLive([{ h: "example.com", d: ["set-constant", "lateFlag", "true"] }]);
  sendLive([{ h: "example.com", d: ["set-constant", "lateFlag", "true"] }]);
  sendLive("garbage");
  const realParse = JSON.parse; JSON.parse = () => [{ h: "example.com", d: ["set-constant", "poisoned", "true"] }];
  sendLive([{ h: "example.com", d: ["set-constant", "cleanFlag", "true"] }]);
  JSON.parse = realParse;
  const realSlice = Array.prototype.slice; Array.prototype.slice = function () { return ["set-constant", "__owned", "noopFunc"]; };
  sendLive([{ h: "example.com", d: ["set-constant", "safeName", "false"] }]);
  Array.prototype.slice = realSlice;
  ok("live: not-once, replay no-op, poisoned JSON.parse/slice have no effect",
    win.lateFlag === true && win.cleanFlag === true && win.poisoned === undefined && win.safeName === false && win.__owned === undefined);
}

// ---------- 3) защитени хостове ----------
{
  const { win } = makeWorld("m.youtube.com");
  loadEngine();
  sendLive([{ h: "youtube.com", d: ["set-constant", "ytFlag", "true"] }]);
  ok("live: never applied on youtube.com (engine guard)", win.ytFlag === undefined);
}

done();
