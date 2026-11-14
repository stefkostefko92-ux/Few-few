// live-check.test.mjs — живата проверка трябва да назовава точно това, което пречи на търсачката.
//
// Случаите са реалните от 2026-10-24: NXDOMAIN (четири продукта), canonical към друга страница в
// sitemap-а (nexus), индекс на sitemap-и (ospedali), robots.txt с HTML от SPA fallback. Мрежата е
// ИСТИНСКИ локален HTTP сървър — DNS е подменен, за да не зависи тестът от света.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRobots, parsePage, altHost, checkSite, verdict } from "./live-check.mjs";
import { SITES } from "./sites.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "live-check.mjs");
const ROOT = join(HERE, "..", "..");
const KEY = "0123456789abcdef0123456789abcdef";

function serve(routes) {
  const srv = http.createServer((req, res) => {
    const r = routes[req.url];
    const v = typeof r === "function" ? r() : r;
    if (v === undefined) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<!doctype html><title>404</title>");
    }
    const [status, type, body] = Array.isArray(v) ? v : [200, "text/html; charset=utf-8", v];
    res.writeHead(status, { "content-type": type });
    res.end(body);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const page = ({ canonical, robots = "index, follow", title = "Ателие — гипсови декорации", kw = "a, b, c, d, Carbon Stealth" } = {}) =>
  `<!doctype html><html lang="bg"><head><title>${title}</title>
<meta name="description" content="Кратко и ясно описание на страницата.">
<meta name="keywords" content="${kw}"><meta name="robots" content="${robots}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}</head>
<body><h1>Заглавие</h1><p>${"Истински текст, видим без JavaScript. ".repeat(12)}</p></body></html>`;

test("robots.txt: Googlebot ползва своята група, иначе *; най-дългото правило печели", () => {
  const all = parseRobots("User-agent: *\nDisallow: /\n");
  assert.equal(all.allows("googlebot", "/"), false);
  assert.equal(all.allows("bingbot", "/"), false);

  const onlyGoogle = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n");
  assert.equal(onlyGoogle.allows("googlebot", "/"), true, "Googlebot има своя група");
  assert.equal(onlyGoogle.allows("bingbot", "/"), false, "останалите падат в *");

  const admin = parseRobots("User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: https://x.test/sitemap.xml\n");
  assert.equal(admin.allows("googlebot", "/"), true);
  assert.equal(admin.allows("googlebot", "/admin/users"), false);
  assert.deepEqual(admin.sitemaps, ["https://x.test/sitemap.xml"]);

  assert.equal(parseRobots("User-agent: *\nDisallow:\n").allows("googlebot", "/"), true, "празен Disallow = всичко разрешено");
  assert.equal(parseRobots("User-agent: *\nDisallow: /p\nAllow: /p\n").allows("googlebot", "/p/1"), true, "равни правила → по-малко ограничаващото (Allow)");
  assert.equal(parseRobots("User-agent: a\nUser-agent: googlebot\nDisallow: /\n").allows("googlebot", "/x"), false, "много агенти в една група");
  assert.equal(parseRobots("<!DOCTYPE html><html></html>").html, true, "SPA fallback се разпознава");
});

test("страницата: атрибути в произволен ред, ескейпи, data-* не се бъркат", () => {
  const p = parsePage(`<html lang="it"><head><title>A &amp; B</title>
<meta data-name="description" content="грешно"><meta content="правилно" name="description">
<meta content="noindex" name="robots"><link href="https://x.test/a" rel="canonical">
<meta name="keywords" content="x, y,, z"></head><body></body></html>`);
  assert.equal(p.title, "A & B", "дължината се брои по видимия текст");
  assert.equal(p.description, "правилно");
  assert.equal(p.robots, "noindex");
  assert.equal(p.canonical, "https://x.test/a");
  assert.equal(p.keywords.length, 3);
  assert.equal(p.lang, "it");
});

test("двойникът с/без www — само за апекс и за www, не за поддомейн", () => {
  assert.equal(altHost("mastilko-bg.com"), "www.mastilko-bg.com");
  assert.equal(altHost("www.scuolabulgaramilano.it"), "scuolabulgaramilano.it");
  assert.equal(altHost("zabobovdol.carbonstealth.eu"), null);
});

test("NXDOMAIN → една блокираща находка, без да се пипа мрежата", async () => {
  const nx = async () => { throw Object.assign(new Error("nx"), { code: "ENOTFOUND" }); };
  const r = await checkSite("medqr.example.invalid", { lookup: nx });
  assert.equal(verdict(r), "block");
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].msg, /няма DNS запис/);
});

test("здрав сайт с индекс на sitemap-и: разгъва се, а лошите адреси в извадката се назовават", async (t) => {
  let base = "";
  const srv = await serve({
    "/": () => page({ canonical: `${base}/` }),
    "/robots.txt": () => [200, "text/plain", `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`],
    "/sitemap.xml": () => [200, "application/xml", `<sitemapindex><sitemap><loc>${base}/s1.xml</loc></sitemap><sitemap><loc>${base}/s2.xml</loc></sitemap></sitemapindex>`],
    "/s1.xml": () => [200, "application/xml", `<urlset><url><loc>${base}/</loc></url><url><loc>${base}/a</loc><lastmod>2026-10-20</lastmod></url><url><loc>${base}/b</loc></url></urlset>`],
    "/s2.xml": () => [200, "application/xml", `<urlset><url><loc>${base}/c</loc></url><url><loc>${base}/d</loc></url></urlset>`],
    "/a": () => page({ canonical: `${base}/a` }),
    "/b": () => page({ canonical: `${base}/b`, robots: "noindex" }),
    // точно случаят nexus: адрес в sitemap-а, чийто canonical сочи друга страница
    "/d": () => page({ canonical: `${base}/` }),
    "/indexnow-key.txt": [200, "text/plain", KEY + "\n"],
    "/llms.txt": [200, "text/plain", "# llms"],
  });
  base = `http://127.0.0.1:${srv.address().port}`;
  t.after(() => srv.close());

  const r = await checkSite(base, { sample: 10 });
  const msgs = r.findings.map((f) => `${f.level} ${f.msg}`);
  assert.equal(verdict(r), "warn", msgs.join("\n"));
  assert.equal(r.facts.sitemap.urls, 5, "индексът се разгръща до страниците");
  assert.equal(r.facts.sitemap.newest, "2026-10-20");
  assert.equal(r.facts.indexnow, "/indexnow-key.txt");
  assert.ok(msgs.some((m) => /^warn .*\/b е noindex/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => /^warn .*\/c: 404/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => /^warn .*\/d има canonical към/.test(m)), msgs.join("\n"));
  assert.ok(!msgs.some((m) => /\/a\b/.test(m)), "здравият адрес мълчи");
});

test("ключът от репото, който не се сервира, е бележка с път; сервиран — факт", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "live-check-"));
  const kf = join(dir, "key.txt");
  writeFileSync(kf, KEY + "\n");
  let served = false;
  const srv = await serve({
    "/": () => page({ canonical: `http://127.0.0.1:${srv.address().port}/` }),
    [`/${KEY}.txt`]: () => (served ? [200, "text/plain", KEY] : undefined),
  });
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;

  const before = await checkSite(base, { sample: 0, key: kf });
  assert.ok(before.findings.some((f) => f.level === "warn" && /не се сервира на живо/.test(f.msg)));
  served = true;
  const after = await checkSite(base, { sample: 0, key: kf });
  assert.equal(after.facts.indexnow, `/${KEY}.txt`, "схемата <ключ>.txt (Supreme, mastilko) се познава");
});

test("noindex + robots Disallow: / → блокира, а --check връща 1", async (t) => {
  const srv = await serve({
    "/": () => page({ robots: "noindex, nofollow" }),
    "/robots.txt": [200, "text/plain", "User-agent: *\nDisallow: /\n"],
  });
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;

  const r = await checkSite(base, { sample: 0 });
  const blocks = r.findings.filter((f) => f.level === "block").map((f) => f.msg);
  assert.ok(blocks.some((m) => /noindex/.test(m)), blocks.join("\n"));
  assert.ok(blocks.some((m) => /забранява началната на Googlebot/.test(m)), blocks.join("\n"));

  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [TOOL, base, "--check", "--sample", "0"], { stdio: "ignore" });
    p.on("close", resolve);
  });
  assert.equal(code, 1);
});

test("robots.txt с HTML (SPA fallback) не се чете като правила", async (t) => {
  const srv = await serve({
    "/": () => page({ canonical: `http://127.0.0.1:${srv.address().port}/` }),
    "/robots.txt": "<!doctype html><html><body>app</body></html>",
  });
  t.after(() => srv.close());
  const r = await checkSite(`http://127.0.0.1:${srv.address().port}`, { sample: 0 });
  assert.ok(r.findings.some((f) => f.level === "warn" && /robots\.txt връща HTML/.test(f.msg)));
  assert.ok(!r.findings.some((f) => f.level === "block"), "HTML не е забрана");
});

test("sites.mjs: каноничен https произход, без дубли, ключовите файлове съществуват", () => {
  const seen = new Set();
  for (const s of SITES) {
    const u = new URL(s.url);
    assert.equal(u.protocol, "https:", s.url);
    assert.equal(s.url, u.origin, `${s.url}: само произход, без път`);
    assert.ok(!seen.has(u.host), `дубъл: ${u.host}`);
    seen.add(u.host);
    if (s.key) {
      assert.ok(existsSync(join(ROOT, s.key)), `${s.product}: няма ${s.key}`);
      assert.match(readFileSync(join(ROOT, s.key), "utf8").trim(), /^[a-zA-Z0-9-]{8,128}$/, s.key);
    }
  }
});
