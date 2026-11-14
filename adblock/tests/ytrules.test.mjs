// 5.7 — YouTube на ниво service worker: правилото за фалшивия googlevideo (забавянето за флагнат
// клиент чака заявка с изтекъл преди години `expire`), регистрацията на youtube_ads.css заедно с
// youtube_main.js (и двете ги няма при bypass) и новите аварийни стопове в filters.json (само булеви).
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome } from "./_chrome.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mock = makeChrome({ storage: { enabled: true } });
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "belowRegex, fakeGvRule, FAKE_GV_RULE_ID, logListKey" });

// ---------- 1) „по-малко от N“ — без бомба със закъснител ----------
const below = (n) => new RegExp("^" + bg.belowRegex(n) + "$");
let wrong = 0;
for (const n of [10, 99, 100, 101, 1605819180, 1792935961, 1800000000, 1999999999, 2000000000]) {
  const re = below(n);
  for (const v of [1, 9, 10, 11, n - 1, n, n + 1, Math.floor(n / 2), n * 10, 1605819180, 1700000000, 1792935961]) {
    if (v < 1) continue;
    if (re.test(String(v)) !== (v < n)) wrong++;
  }
}
ok(`belowRegex(N) matches exactly the numbers under N (${wrong} wrong of ~100)`, wrong === 0);

const NOW = Date.UTC(2026, 9, 25, 12); // 2026-10-25
const rule = bg.fakeGvRule(NOW);
const re = new RegExp(rule.condition.regexFilter, "i");
const gv = (expire) => `https://rr3---sn-aigl6nsd.googlevideo.com/videoplayback?expire=${expire}&ei=XqN&ip=1.2.3.4&id=o-A`;
ok("fake googlevideo (expire 1605819180 = 2020) is blocked", re.test(gv(1605819180)));
ok("…and one from two weeks ago", re.test(gv(Math.floor(NOW / 1000) - 14 * 86400)));
// Chrome's RE2 limit (2 KB compiled) forced a coarse cut-off: blocked exactly when expire < head × 10^6, head = ⌊(now − 1 day) / 10^6⌋
const cut = Math.floor((Math.floor(NOW / 1000) - 86400) / 1e6) * 1e6;
let off = 0;
for (let v = cut - 3e6; v < cut + 3e6; v += 97_531) if (re.test(gv(v)) !== (v < cut)) off++;
ok(`…the cut-off is exactly ⌊(now − 1 day) / 10^6⌋ × 10^6 (${off} wrong around it); the regex stays short (${rule.condition.regexFilter.length} chars)`, off === 0 && rule.condition.regexFilter.length < 160);
ok("a real playback URL (expires in 6 h) is never matched", !re.test(gv(Math.floor(NOW / 1000) + 6 * 3600)));
ok("…nor one that expired an hour ago (clock skew, a paused tab)", !re.test(gv(Math.floor(NOW / 1000) - 3600)));
const later = new RegExp(bg.fakeGvRule(Date.UTC(2027, 5, 1)).condition.regexFilter, "i");
ok("no time bomb: in June 2027 a real URL (1.81e9) still passes — the cutoff moves with the clock (uBO's fixed regex would match it)",
  !later.test(gv(Math.floor(Date.UTC(2027, 5, 1) / 1000) + 6 * 3600)) && later.test(gv(1605819180)));
ok("only expire as the first parameter, only videoplayback on googlevideo.com",
  !re.test("https://rr3---sn-x.googlevideo.com/videoplayback?ei=1&expire=1605819180&x=1") &&
  !re.test("https://example.com/videoplayback?expire=1605819180&x=1") &&
  !re.test("https://rr3---sn-x.googlevideo.com/initplayback?expire=1605819180&x=1"));
ok("rule shape: block, xmlhttprequest GET, third-party, initiated by www.youtube.com, below every allow rule",
  rule.id === bg.FAKE_GV_RULE_ID && rule.action.type === "block" && rule.priority === 2 &&
  rule.condition.resourceTypes.join() === "xmlhttprequest" && rule.condition.requestMethods.join() === "get" &&
  rule.condition.domainType === "thirdParty" && rule.condition.initiatorDomains.join() === "www.youtube.com");
ok("it counts as YouTube in the log", bg.logListKey({ rulesetId: "_dynamic", ruleId: bg.FAKE_GV_RULE_ID }) === "youtube");

// ---------- 2) аварийни стопове: само булеви, само true ги пуска ----------
const c1 = bg.sanitizeConfig({ youtube: { noShapes: true, noSsapJump: true } });
const c2 = bg.sanitizeConfig({ youtube: { noShapes: "true", noSsapJump: 1 } });
ok("filters.json youtube.noShapes / noSsapJump: true → on; anything else → off", c1.youtube.noShapes === true && c1.youtube.noSsapJump === true && c2.youtube.noShapes === false && c2.youtube.noSsapJump === false);

// ---------- 3) youtube_ads.css върви с youtube_main.js ----------
const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const staticCss = manifest.content_scripts.flatMap((c) => c.css || []);
ok("the ad-hiding YouTube stylesheet is registered by the SW (sa-youtube-css), not in the manifest",
  /id: YT_CSS_ID, matches: YT_PATTERNS, css: \["youtube_ads\.css"\]/.test(bgSrc) && !staticCss.includes("youtube_ads.css") && staticCss.includes("youtube.css"));
const regBlock = (bgSrc.match(/if \(features\.youtube !== false && !ytBypass\) \{[\s\S]*?\n {2}\}/) || [""])[0];
ok("…in the same block as youtube_main.js: off with the YouTube feature, on an allowed site and for the bypass", /YT_MAIN_SCRIPT_ID/.test(regBlock) && /YT_CSS_ID/.test(regBlock) && /excludeMatches/.test(regBlock));
const staticYt = readFileSync(join(ROOT, "youtube.css"), "utf8");
ok("the manifest youtube.css keeps only the enforcement overlay / scroll rules (they stay during a bypass)",
  !/ytd-ad-slot-renderer|masthead-ad|ytp-ad-/.test(staticYt) && /tp-yt-iron-overlay-backdrop/.test(staticYt));
const pkg = readFileSync(join(ROOT, "tools", "package.sh"), "utf8");
ok("package.sh insists on youtube_ads.css", /refs\.add\("youtube_ads\.css"\)/.test(pkg));

done();
