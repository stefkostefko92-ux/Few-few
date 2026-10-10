// Chrome Web Store: текстът В ИЗОБРАЖЕНИЯТА (екрани, промо плочки, клипа за магазина) не
// бива да носи рекламни ключови думи или сравнение с други продукти. 5.1.2 беше отхвърлен
// („Red Nickel“) заради „100% free“ на екран 5 — затова е гейт, не навик.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done } from "./_harness.mjs";

// Думите от политиката („препоръчано“, „първокласно“, „без такси“, „№1“, „ново“ и др.) +
// близките им форми, които сме имали в собствените си графики.
const BANNED = /\b(free|100\s*%|#\s*1|no\.?\s*1|number one|best|top[- ]rated|recommended|premium|first[- ]class|unique|brand[- ]new|new|exclusive|guaranteed?|award|fastest|faster than)\b/i;
const OTHERS = /\b(ublock origin lite|ghostery|adguard|adblock plus|rule-based blockers|other blockers)\b/i;

// Текстът на слайдовете: низовете в SLIDES в store/screenshots/build.py (без CSS/HTML атрибути).
const build = readFileSync(join(ROOT, "store", "screenshots", "build.py"), "utf8");
const slides = build.slice(build.indexOf("SLIDES = ["), build.indexOf("\n]\n", build.indexOf("SLIDES = [")));
const strings = [...slides.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map((m) => (m[1] ?? m[2]).replace(/<[^>]+>/g, ""));
const bad = strings.filter((t) => BANNED.test(t) || OTHERS.test(t));
ok(`store screenshots: no promotional keywords or other products in slide text (${bad.join(" | ") || "clean"})`, strings.length > 15 && bad.length === 0);

// Панелите на екраните (features_panel/smartlog_panel) също са част от изображението.
const panels = build.slice(build.indexOf("def features_panel"), build.indexOf("SLIDES = ["));
const panelText = panels.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n").replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, " ");
ok("store screenshots: panels carry no promotional keywords", !/\b(free|100\s*%|unique|recommended|brand[- ]new|#\s*1)\b/i.test(panelText));

// Клипът за магазина (--cut store): без „free“ и без сравнението с други блокери.
const film = readFileSync(join(ROOT, "tools", "promo", "film.html"), "utf8");
const visible = film.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
ok("promo film: no 'free' on screen", !/\bfree\b/i.test(visible));
ok("promo film: the comparison scene is marked out of the store cut", /id="s4"[^>]*data-cut="full"/.test(film));

// Summary-то на живия запис е дословно extDescription от пакета (не текст от таблото):
// без цена/скорост/превъзходни степени (best-listing), ≤132 знака на всеки език.
const locs = readdirSync(join(ROOT, "_locales"));
const descs = locs.map((l) => [l, JSON.parse(readFileSync(join(ROOT, "_locales", l, "messages.json"), "utf8")).extDescription.message]);
const en = descs.find(([l]) => l === "en")[1];
ok(`summary (en): no promotional words (${en})`, !BANNED.test(en) && !/\b(fast|private|no cost)\b/i.test(en));
const sub = readFileSync(join(ROOT, "docs", "SUBMISSION.md"), "utf8");
ok("SUBMISSION.md summary == extDescription (en)", sub.includes("`" + en + "`"));
const long = descs.filter(([, d]) => d.length > 132).map(([l]) => l);
ok(`summary: ≤132 chars in every locale (${long.join(",") || "all"})`, long.length === 0);

// Без промо карта в UI-а на разширението (5.1.4): нито в popup-а, нито в настройките.
for (const f of ["popup/popup.html", "options/options.html"]) {
  const h = readFileSync(join(ROOT, f), "utf8");
  ok(`${f}: no promo card / link to our own site`, !/class="promo"/.test(h) && !/href="https?:\/\/(www\.)?carbonstealth\.eu/.test(h));
}

// Страницата „Добре дошли“ се отваря САМО при първа инсталация, никога при ъпдейт.
const bgSrc = readFileSync(join(ROOT, "background.js"), "utf8");
const inst = bgSrc.slice(bgSrc.indexOf("chrome.runtime.onInstalled.addListener"), bgSrc.indexOf("function ensureAlarms"));
ok("welcome page: opened only on reason === \"install\"", /details\.reason === "install"[\s\S]{0,120}welcome\/welcome\.html/.test(inst) && (inst.match(/welcome\.html/g) || []).length === 1);

// Сайтът: всяка картинка в index.html носи ?v=<хеш на съдържанието> (landing_assets.mjs) —
// иначе 7-дневният кеш показва стария popup след релийз.
import { createHash } from "node:crypto";
const idxHtml = readFileSync(join(ROOT, "server", "index.html"), "utf8");
const webps = [...idxHtml.matchAll(/\/([\w-]+\.webp)(\?v=([0-9a-f]+))?"/g)];
const staleImg = webps.filter((m) => m[3] !== createHash("sha256").update(readFileSync(join(ROOT, "server", m[1]))).digest("hex").slice(0, 10)).map((m) => m[1]);
ok(`site: every .webp is cache-busted with its content hash (${[...new Set(staleImg)].join(",") || "all"})`, webps.length >= 3 && staleImg.length === 0);

// Промо клиповете: магазинният cut рендерира само film.html (никога социалния филм с „Free“ и
// рекламния плейър), а мълниите във всеки cut са ≥ 2 s една от друга (WCAG 2.3.1, епилепсия).
const promoTL = JSON.parse(readFileSync(join(ROOT, "tools", "promo", "timeline.json"), "utf8"));
ok("promo: the store cut renders film.html, never the social film", !promoTL.cuts.store.film || promoTL.cuts.store.film === "film.html");
const minGap = (st) => { const ts = st.map((x) => x.t).sort((a, b) => a - b); return Math.min(...ts.slice(1).map((t, i) => t - ts[i])); };
const tight = Object.entries({ full: promoTL, ...promoTL.cuts }).filter(([, c]) => minGap(c.strikes || promoTL.strikes) < 2).map(([k]) => k);
ok(`promo: lightning strikes ≥ 2 s apart in every cut (${tight.join(",") || "all"})`, tight.length === 0);

// Сайтът: badge-ът „Established Publisher“ води към листинга (проверимо твърдение), а броят езици
// на страницата и в llms.txt е броят на _locales (беше „70“ след 73).
const listing = "https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk";
const pills = [...idxHtml.matchAll(/<a class="verified" href="([^"]+)"[\s\S]*?<\/a>/g)];
ok("site: the Established Publisher mark links to the store listing", pills.length >= 1 && pills.every((m) => m[1] === listing && /Established Publisher/.test(m[0])));
const llms = readFileSync(join(ROOT, "server", "llms.txt"), "utf8");
const langClaims = [...(idxHtml + llms).matchAll(/(\d+) languages/g)].map((m) => +m[1]).filter((n) => n !== 31);
ok(`site: “N languages” = ${locs.length} locales everywhere (${[...new Set(langClaims)].join(",")})`, langClaims.length >= 3 && langClaims.every((n) => n === locs.length));

// Графиките за магазина по правилата на Google („Supplying Images“): точните размери, а иконата 128
// е 96×96 рисунка с ~16 px прозрачен отстъп (install диалогът и магазинът я ползват от пакета).
import { inflateSync } from "node:zlib";
function png(file) {
  const b = readFileSync(join(ROOT, file));
  let i = 8, idat = [], w = 0, h = 0, ct = 0;
  while (i < b.length) {
    const len = b.readUInt32BE(i), type = b.toString("ascii", i + 4, i + 8), body = b.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; }
    if (type === "IDAT") idat.push(body);
    i += 12 + len;
  }
  return { w, h, ct, data: idat.length ? inflateSync(Buffer.concat(idat)) : null };
}
function alphaBox(file) { // the opaque bounding box of an RGBA PNG
  const { w, h, ct, data } = png(file);
  if (ct !== 6) return null;
  const bpp = 4, stride = w * bpp, rows = []; let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = data[p++], cur = Buffer.from(data.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255; else if (f === 2) cur[x] = (cur[x] + up) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + up) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
    }
    rows.push(cur); prev = cur;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  return { x0, y0, x1, y1 };
}
const dims = [["store/store_icon_128.png", 128, 128], ["icons/icon128.png", 128, 128], ["store/promo_small_440x280.png", 440, 280], ["store/marquee_1400x560.png", 1400, 560],
  ...[1, 2, 3, 4, 5].map((n) => [`store/screenshots/screenshot-${n}.png`, 1280, 800])];
const wrong = dims.filter(([f, w, h]) => { const p = png(f); return p.w !== w || p.h !== h; }).map(([f]) => f);
ok(`store art: exact sizes (${wrong.join(", ") || "icon 128, tile 440×280, marquee 1400×560, 5 screenshots 1280×800"})`, wrong.length === 0);
const box = alphaBox("icons/icon128.png");
ok(`icon 128: artwork inside a ~16 px transparent margin (opaque box ${box ? `${box.x0},${box.y0}–${box.x1},${box.y1}` : "no alpha"})`,
  !!box && box.x0 >= 12 && box.y0 >= 12 && box.x1 <= 115 && box.y1 <= 115);

// Публикуваният filters.json (подписва се при деплоя) носи само ДАННИ — точно каквото пише в
// бележката към ревюъра: домейни, CSS селектори, имена на YouTube полета. Никакъв ключ „scriptlets“.
const liveCfg = JSON.parse(readFileSync(join(ROOT, "server", "filters.json"), "utf8"));
const extra = Object.keys(liveCfg).filter((k) => !["version", "updated", "blockDomains", "cosmetic", "youtube"].includes(k));
ok(`server/filters.json: data keys only (${extra.join(",") || "version, updated, blockDomains, cosmetic, youtube"})`, extra.length === 0 && Number.isSafeInteger(liveCfg.version));

// Program Policies (Limited Use): „an affirmative statement … must be disclosed on a website belonging
// to your extension“ — дословното изречение на Google, в двете копия на политиката за поверителност.
const LIMITED_USE = "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.";
const noLU = ["PRIVACY.md", "server/privacy.html"].filter((f) => !readFileSync(join(ROOT, f), "utf8").includes(LIMITED_USE));
ok(`privacy policy: Google's Limited Use statement on the site and in PRIVACY.md (${noLU.join(", ") || "both"})`, noLU.length === 0);

done();
