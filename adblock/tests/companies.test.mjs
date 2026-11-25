// „Връзки на страницата“ показва компанията зад хоста (popup/companies.js): точен домейн или негов
// поддомейн, никога част от име; непознат хост — без етикет. Картата е наша (MIT) — готовите бази са
// CC BY-NC-SA и не влизат в пакета.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { ROOT, ok, done } from "./_harness.mjs";

const src = readFileSync(join(ROOT, "popup", "companies.js"), "utf8");
const ctx = {};
ctx.globalThis = ctx;
runInNewContext(src, ctx);
const { companyOf, size } = ctx.SA_COMPANIES;

ok(`the map is non-empty (${size} domains)`, size >= 40);
ok("www.google-analytics.com → Google", companyOf("www.google-analytics.com") === "Google");
ok("connect.facebook.net → Meta", companyOf("connect.facebook.net") === "Meta");
ok("an exact domain (doubleclick.net) → Google", companyOf("doubleclick.net") === "Google");
ok("trailing dot and upper case are fine (STATIC.CRITEO.NET.)", companyOf("STATIC.CRITEO.NET.") === "Criteo");
ok("never a part of a name: notfacebook.net, facebook.net.evil.example → no label",
  companyOf("notfacebook.net") === "" && companyOf("facebook.net.evil.example") === "");
ok("unknown hosts get no label (img.cdn-other.org, localhost, empty)",
  companyOf("img.cdn-other.org") === "" && companyOf("localhost") === "" && companyOf("") === "" && companyOf(undefined) === "");

// No licensed third-party database slipped in: the file says it is ours and names no NC source as its data.
ok("the file is our own map (no copied NC database)", /Собствена карта \(MIT\)/.test(src) && !/require\(|import\s/.test(src));

// It is loaded before popup.js and ships in the package.
const html = readFileSync(join(ROOT, "popup", "popup.html"), "utf8");
const at = (f) => html.indexOf(`<script src="${f}"></script>`);
ok("popup.html loads companies.js before popup.js", at("companies.js") > 0 && at("companies.js") < at("popup.js"));
ok("package.sh insists on popup/companies.js", /refs\.add\("popup\/companies\.js"\)/.test(readFileSync(join(ROOT, "tools", "package.sh"), "utf8")));

done();
