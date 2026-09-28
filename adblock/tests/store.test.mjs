// Chrome Web Store: текстът В ИЗОБРАЖЕНИЯТА (екрани, промо плочки, клипа за магазина) не
// бива да носи рекламни ключови думи или сравнение с други продукти. 5.1.2 беше отхвърлен
// („Red Nickel“) заради „100% free“ на екран 5 — затова е гейт, не навик.
import { readFileSync } from "node:fs";
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

done();
