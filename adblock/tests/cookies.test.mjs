// cookies.css ↔ cookies.js: списъкът „това е consent банер" живее на две места
// (CSS cloak/hard блокове и BANNERS в JS за детекция). Разминаване = банер, който
// се скрива, но не се брои за „видян" → без почистване на backdrop/blur/scroll.
// Плюс: генеричните backdrop правила (.modal-backdrop) са гейтнати зад -seen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done } from "./_harness.mjs";

const css = readFileSync(join(ROOT, "cookies.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // без коментарите (те споменават класовете)
const js = readFileSync(join(ROOT, "cookies.js"), "utf8");

function block(prefix) {
  // селекторите от първия rule-блок, чиито селектори започват с prefix
  const re = new RegExp("((?:" + prefix.replace(/\./g, "\\.") + "[^{]*?,\\s*)*" + prefix.replace(/\./g, "\\.") + "[^{]*?)\\{", "s");
  const m = re.exec(css);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(new RegExp("^" + prefix.replace(/\./g, "\\.") + "\\s*"), "")).filter(Boolean);
}
const cloak = block("html.tbab-cookies ");
const hard = block("html.tbab-cookies-hard ");
const seen = block("html.tbab-cookies-seen ");
const jsList = (() => {
  const m = /const BANNERS = \[([\s\S]*?)\];/.exec(js);
  return m[1].match(/"((?:[^"\\]|\\.)*)"/g).map((s) => JSON.parse(s));
})();

ok(`cookies.css cloak block parsed (${cloak.length} selectors)`, cloak.length > 30);
ok("cloak block == hard block (same banners, two phases)", cloak.join("\n") === hard.join("\n"));
ok(`cookies.js BANNERS == cookies.css cloak block (${jsList.length})`, jsList.join("\n") === cloak.join("\n"));
ok("cloak keeps layout (visibility, not display) so the button stays clickable",
  /html\.tbab-cookies \[aria-describedby\*="cookie" i\] \{\s*visibility: hidden !important;/.test(css));
ok("hard phase removes from layout", /html\.tbab-cookies-hard \[aria-describedby\*="cookie" i\] \{\s*display: none !important;/.test(css));
ok("generic backdrops (.modal-backdrop) only under -seen, never under bare .tbab-cookies",
  seen.includes(".modal-backdrop") && !cloak.includes(".modal-backdrop") && !/html\.tbab-cookies \.modal-backdrop/.test(css));
ok("scroll unlock only under -seen", /html\.tbab-cookies-seen,\s*html\.tbab-cookies-seen body \{\s*overflow: auto !important;/.test(css) && !/html\.tbab-cookies,\s*html\.tbab-cookies body \{/.test(css));

// LOCK_CLASS_RE: класове, които трябва да паднат / да останат
const reM = /const LOCK_CLASS_RE = (\/.*\/i);/.exec(js);
const LOCK = eval(reM[1]); // literal from our own source, not external input
const mustMatch = ["no-scroll", "noscroll", "scroll-lock", "scroll-locked", "modal-open", "overflow-hidden", "overflowHidden", "sp-message-open", "didomi-popup-open", "ot-overflow-hidden", "cookie-consent-open", "cmp-modal-open", "is-blurred", "body-locked", "consent-active", "cookies-shown"];
const mustNot = ["container", "header", "scrollable", "modal", "open", "hidden", "nav-open", "menu-open", "dark", "theme-dark", "overflow", "scrolled"];
ok("LOCK_CLASS_RE matches every known scroll-lock class: " + mustMatch.filter((c) => !LOCK.test(c)).join(",") || "all", mustMatch.every((c) => LOCK.test(c)));
ok("LOCK_CLASS_RE leaves ordinary classes alone: " + mustNot.filter((c) => LOCK.test(c)).join(",") || "all", mustNot.every((c) => !LOCK.test(c)));

done();
