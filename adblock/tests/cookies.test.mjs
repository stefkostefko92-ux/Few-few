// cookies.css ↔ cookies.js и предпазителите на авто-кликането.
//  - Списъкът „това е consent банер" живее на две места (CSS cloak + BANNERS в
//    JS); разминаване = банер, който се скрива, но не отваря прозореца за
//    почистване (backdrop/blur/scroll остават).
//  - Backdrop списъкът също (CSS -seen + BACKDROPS в JS, който го „закрепва"
//    при затваряне на прозореца).
//  - Глобалният клик-слой (Tier A) съдържа САМО CMP-специфични селектори.
//    Генеричните (aria-label, title, data-testid, текст) кликваха по ВСЯКА
//    страница — приемаха LinkedIn покани, отказваха Teams повиквания.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const css = readFileSync(join(ROOT, "cookies.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""); // без коментарите (те споменават класовете)
const js = readFileSync(join(ROOT, "cookies.js"), "utf8");

function block(prefix) {
  // селекторите от rule-блока, чиито селектори започват с prefix
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("((?:" + esc + "[^{,]*,\\s*)*" + esc + "[^{,]*)\\{", "s");
  const m = re.exec(css);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(new RegExp("^" + esc + "\\s*"), "")).filter(Boolean);
}
function jsList(name) {
  const m = new RegExp("const " + name + " = \\[([\\s\\S]*?)\\];").exec(js);
  if (!m) return null;
  const body = m[1].replace(/\/\/[^\n]*/g, "");
  return runInNewContext("[" + body + "]");
}

const cloak = block("html.tbab-cookies ");
const seen = block("html.tbab-cookies-seen ");
const BANNERS = jsList("BANNERS");
const BACKDROPS = jsList("BACKDROPS");
const REJECT_CMP = jsList("REJECT_CMP");
const ACCEPT_CMP = jsList("ACCEPT_CMP");
const REJECT_GENERIC = jsList("REJECT_GENERIC");
const ACCEPT_GENERIC = jsList("ACCEPT_GENERIC");

ok(`cookies.css cloak block parsed (${cloak.length} selectors)`, cloak.length > 30);
ok(`cookies.js BANNERS == cookies.css cloak block (${BANNERS.length})`, BANNERS.join("\n") === cloak.join("\n"));
ok(`cookies.js BACKDROPS == cookies.css -seen block (${BACKDROPS.length})`, BACKDROPS.join("\n") === seen.filter((s) => s !== "").join("\n"));
ok("cloak keeps layout (visibility, not display) so the button stays clickable",
  /html\.tbab-cookies \[aria-describedby\*="cookie" i\] \{\s*visibility: hidden !important;/.test(css));
ok("no page-wide hard class (it swallowed late banners before we could click them)", !/tbab-cookies-hard/.test(css) && !/tbab-cookies-hard/.test(js));
ok("generic backdrops (.modal-backdrop) only under -seen, never under bare .tbab-cookies",
  seen.includes(".modal-backdrop") && !cloak.includes(".modal-backdrop") && !/html\.tbab-cookies \.modal-backdrop/.test(css));
ok("scroll unlock only under -seen", /html\.tbab-cookies-seen,\s*html\.tbab-cookies-seen body \{\s*overflow: auto !important;/.test(css) && !/html\.tbab-cookies,\s*html\.tbab-cookies body \{/.test(css));
ok("the -seen class is dropped again when the cleanup window closes", /classList\.remove\("tbab-cookies-seen"\)/.test(js));

// ---- глобалният клик-слой е САМО CMP-специфичен ----
const GENERIC_RE = /aria-label|\[title|data-testid='(reject|accept)-all|form\[|jsname|^\.cc-/i;
const leaked = [...REJECT_CMP, ...ACCEPT_CMP].filter((s) => GENERIC_RE.test(s) && !/uc-deny-all-button/.test(s));
ok(`Tier A (clicked anywhere) has no generic selector: ${leaked.join(" · ") || "none"}`, leaked.length === 0);
ok("generic selectors exist and are separate (clicked only inside consent roots)", REJECT_GENERIC.length > 3 && ACCEPT_GENERIC.length > 3);
ok("OAuth-dangerous selectors are gone everywhere: form[action*='consent'], aria-label*='allow'",
  !/form\[action\*='consent'\]/.test(js.replace(/\/\/[^\n]*/g, "")) && !/aria-label\*='allow'/.test(js.replace(/\/\/[^\n]*/g, "")));
ok("text / generic clicks only go through the root-scoped helpers",
  /clickTextIn\(roots, REJECT_TEXT/.test(js) && /clickTextIn\(roots, ACCEPT_TEXT/.test(js) &&
  /clickSelectorsIn\(roots, REJECT_GENERIC/.test(js) && /clickSelectorsIn\(roots, ACCEPT_GENERIC/.test(js) &&
  !/clickTextIn\(\[document\]/.test(js) && !/clickSelectorsIn\(\[document\], (REJECT|ACCEPT)_GENERIC/.test(js));
ok("every reject option is tried before any accept option",
  js.indexOf("clickTextIn(roots, REJECT_TEXT") < js.indexOf("clickSelectorsIn([document], ACCEPT_CMP"));

// ---- „privacy" сам по себе не прави consent root (ToS диалог) ----
const cookieRe = new RegExp(/const COOKIE_WORD_RE = (\/.*\/i);/.exec(js)[1].slice(1, -2), "i");
ok("COOKIE_WORD_RE: cookie/бисквитки/GDPR yes; bare privacy/terms no",
  ["We use cookies", "Използваме бисквитки", "GDPR notice", "Cookie-Einstellungen"].every((t) => cookieRe.test(t)) &&
  ["We updated our Privacy Policy and Terms", "Accept the new terms of service"].every((t) => !cookieRe.test(t)));

// ---- LOCK_CLASS_RE: класове, които трябва да паднат / да останат ----
const reM = /const LOCK_CLASS_RE = (\/.*\/i);/.exec(js);
const LOCK = runInNewContext(reM[1]); // литерал от собствения ни код
const mustMatch = ["no-scroll", "noscroll", "scroll-lock", "scroll-locked", "modal-open", "overflow-hidden", "overflowHidden", "sp-message-open", "didomi-popup-open", "ot-overflow-hidden", "cookie-consent-open", "cmp-modal-open", "is-blurred", "body-locked", "consent-active", "cookies-shown"];
const mustNot = ["container", "header", "scrollable", "modal", "open", "hidden", "nav-open", "menu-open", "dark", "theme-dark", "overflow", "scrolled"];
ok("LOCK_CLASS_RE matches every known scroll-lock class: " + (mustMatch.filter((c) => !LOCK.test(c)).join(",") || "all"), mustMatch.every((c) => LOCK.test(c)));
ok("LOCK_CLASS_RE leaves ordinary classes alone: " + (mustNot.filter((c) => LOCK.test(c)).join(",") || "all"), mustNot.every((c) => !LOCK.test(c)));

done();
