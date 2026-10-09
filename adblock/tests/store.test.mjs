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

done();
