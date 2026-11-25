// indexnow.test.mjs — ключът се РАЗПОЗНАВА, а 200 не значи ключ.
//
// ДЕФЕКТЪТ (реален деплой на Supreme, 07.08.2026): подаването падна с „Липсва
// валиден IndexNow ключ", докато ключът беше налице и се сервираше коректно —
// само че на `<key>.txt`, а инструментът пробваше конвенционалния
// `/indexnow-key.txt`. Фронтендът е SPA (`try_files … /index.html`), значи онзи
// адрес върна **200 с index.html**, не 404: `r.ok` беше вярно, ключ нямаше.
//
// Това е класът „едно правило, две определения" — deploy hook-ът намираше
// файла, инструментът търсеше друг. Тестът вдига ИСТИНСКИ HTTP сървър, защото
// точно поведението по мрежа (200 вместо 404) е това, което мокът не знае.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "indexnow.mjs");
const KEY = "09d438d11f84037ca203486287865836";
const SITEMAP = '<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1/</loc></url></urlset>';

/** Сървър, който отговаря по подадената карта; всичко останало = SPA fallback.
 *  Стойност `{ status }` връща този код (недостъпен sitemap). POST към `/indexnow` играе ролята на
 *  api.indexnow.org (INDEXNOW_ENDPOINT) и записва телата в `srv.posts` — така се вижда какво РЕАЛНО
 *  е подадено, без нито една заявка към истинските търсачки. */
function serve(routes) {
  const posts = [];
  const srv = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (req.method === "POST" && path === "/indexnow") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { posts.push(JSON.parse(body)); res.writeHead(200); res.end(); });
      return;
    }
    if (path in routes) {
      const v = routes[path];
      if (v && typeof v === "object") { res.writeHead(v.status); res.end(v.body || ""); return; }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(v);
      return;
    }
    // Точно това прави nginx-ът пред фронтенда: непознат път → index.html, 200.
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!DOCTYPE html>\n<html lang=\"en\"><head><title>Supreme</title></head><body></body></html>");
  });
  srv.posts = posts;
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    // INDEXNOW_ENDPOINT по подразбиране сочи затворен локален порт: нито един тест не може да стигне до
    // истинския api.indexnow.org, дори ако забрави --dry-run или собствен двойник.
    const p = spawn(process.execPath, [TOOL, ...args], { env: { ...process.env, INDEXNOW_KEY: "", INDEXNOW_ENDPOINT: "http://127.0.0.1:9/indexnow", ...env } });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (out += c));
    p.on("close", (code) => resolve({ code, out }));
  });
}

test("SPA fallback (200 + HTML) НЕ минава за ключ и се назовава", async (t) => {
  const srv = await serve({ "/sitemap.xml": SITEMAP });
  t.after(() => srv.close());
  const { code, out } = await run([`http://127.0.0.1:${srv.address().port}`, "--dry-run"]);

  assert.equal(code, 1, "HTML вместо ключ трябва да е провал, не мълчаливо подаване");
  assert.match(out, /не е ключ/, "провалът трябва да КАЖЕ, че е дошло 200 с друго съдържание");
  assert.match(out, /SPA fallback/, "диагнозата трябва да сочи истинската причина");
  assert.doesNotMatch(out, new RegExp(KEY), "ключ не е имало — не бива да се появява отникъде");
});

test("конвенционалният /indexnow-key.txt продължава да работи (zabobovdol)", async (t) => {
  const srv = await serve({ "/indexnow-key.txt": KEY + "\n", "/sitemap.xml": SITEMAP });
  t.after(() => srv.close());
  const { code, out } = await run([`http://127.0.0.1:${srv.address().port}`, "--dry-run"]);

  assert.equal(code, 0, "валиден ключ от конвенционалния път трябва да минава");
  assert.match(out, /keyLocation=.*\/indexnow-key\.txt/);
});

test("схемата на Supreme: --key-file + --key-location", async (t) => {
  const srv = await serve({ [`/${KEY}.txt`]: KEY + "\n", "/sitemap.xml": SITEMAP });
  t.after(() => srv.close());
  const dir = await mkdtemp(join(tmpdir(), "indexnow-"));
  const kf = join(dir, `${KEY}.txt`);
  await writeFile(kf, KEY + "\n");
  const base = `http://127.0.0.1:${srv.address().port}`;

  const { code, out } = await run([base, "--dry-run", "--key-file", kf, "--key-location", `${base}/${KEY}.txt`]);
  assert.equal(code, 0, "точно това вика deploy hook-ът за Supreme");
  assert.match(out, new RegExp(`keyLocation=.*/${KEY}\\.txt`), "keyLocation трябва да е ФАЙЛЪТ, който наистина съществува");
});

test("deploy hook-ът подава ключа явно — иначе пада обратно към несъществуващ път", async () => {
  const { readFile } = await import("node:fs/promises");
  const sh = await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deploy", "autodeploy.sh"), "utf8");
  const fn = sh.slice(sh.indexOf("supreme_ping_indexnow() {"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /--key-file/, "hook-ът намира ключа — длъжен е и да го подаде");
  assert.match(body, /--key-location/, "без keyLocation IndexNow сочи файл, който Supreme няма");
});

test("индекс на sitemap-и се разгръща — подават се страниците, не под-sitemap файловете", async (t) => {
  let port = 0;
  const srv = await serve({
    "/indexnow-key.txt": KEY + "\n",
    get "/sitemap.xml"() { return `<?xml version="1.0"?><sitemapindex><sitemap><loc>http://127.0.0.1:${port}/s1.xml</loc></sitemap><sitemap><loc>http://127.0.0.1:${port}/s2.xml</loc></sitemap></sitemapindex>`; },
    "/s1.xml": '<urlset><url><loc>http://127.0.0.1/a</loc></url><url><loc>http://127.0.0.1/b</loc></url></urlset>',
    "/s2.xml": '<urlset><url><loc>http://127.0.0.1/c</loc></url></urlset>',
  });
  port = srv.address().port;
  t.after(() => srv.close());
  const { code, out } = await run([`http://127.0.0.1:${port}`, "--dry-run"]);
  assert.equal(code, 0);
  assert.match(out, / 3 URL /, "три страници от двата под-sitemap-а");
  assert.doesNotMatch(out, /s1\.xml/, "под-sitemap файлът не е страница");
});

test("адрес с заявка в sitemap-а се подава разкодиран (&amp; → &)", async (t) => {
  const srv = await serve({
    "/indexnow-key.txt": KEY + "\n",
    "/sitemap.xml": '<urlset><url><loc>http://127.0.0.1/p?a=1&amp;b=2</loc></url></urlset>',
  });
  t.after(() => srv.close());
  const { code, out } = await run([`http://127.0.0.1:${srv.address().port}`, "--dry-run"]);
  assert.equal(code, 0);
  assert.match(out, /\/p\?a=1&b=2\n/, "истинският адрес на страницата");
  assert.doesNotMatch(out, /&amp;/, "XML ескейпът не е част от адреса");
});

test("--key-file към папка дава ясна грешка, не срив", async () => {
  const { code, out } = await run(["http://127.0.0.1:9", "--key-file", dirname(TOOL), "--dry-run"]);
  assert.equal(code, 2);
  assert.match(out, /не се чете/);
});

// ── Sitemap, който не се прочита, НЕ е успех с един адрес ───────────────────────────────────────────
//
// ДЕФЕКТЪТ (намерен на 13.11.2026 при подаването за Panev): когато sitemap-ът не се изтегли (няма
// DNS/TLS, таймаут, 5xx) или в него няма нито един <loc>, инструментът падаше мълчаливо към
// `[<сайт>/]`, подаваше само началната страница, печаташе „✓ Подадени 1 URL“ и излизаше с 0.
// Деплой скриптовете не можеха да различат „всички страници са подадени“ от „sitemap-ът не се
// прочете“, а korpora и rilievi записваха и хеша на sitemap-а — следващият деплой не опитваше пак.
// Тестовете подават към локален двойник на api.indexnow.org (INDEXNOW_ENDPOINT) и гледат и изхода,
// и какво е стигнало до него.
const withKey = (routes) => ({ "/indexnow-key.txt": KEY + "\n", ...routes });
const endpoint = (srv) => ({ INDEXNOW_ENDPOINT: `http://127.0.0.1:${srv.address().port}/indexnow` });
const site = (srv) => `http://127.0.0.1:${srv.address().port}`;

test("недостъпен sitemap (5xx): изход 1, назован е източникът, нищо не се подава", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": { status: 503 } }));
  t.after(() => srv.close());
  const { code, out } = await run([site(srv)], endpoint(srv));
  assert.equal(code, 1, "непрочетен sitemap не е успех");
  assert.match(out, /sitemap/i);
  assert.match(out, /HTTP 503/, "причината се казва");
  assert.match(out, new RegExp(`${site(srv)}/sitemap\\.xml`), "и откъде е четено");
  assert.doesNotMatch(out, /✓ Подадени/);
  assert.equal(srv.posts.length, 0, "към търсачките не е тръгнало нищо");
});

test("sitemap без нито един <loc> (SPA връща 200 с HTML): изход 1, нищо не се подава", async (t) => {
  const srv = await serve(withKey({})); // /sitemap.xml → SPA fallback: 200 + index.html
  t.after(() => srv.close());
  const { code, out } = await run([site(srv)], endpoint(srv));
  assert.equal(code, 1);
  assert.match(out, /няма нито един <loc>/);
  assert.equal(srv.posts.length, 0);
});

test("празен urlset: изход 1, нищо не се подава", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": '<?xml version="1.0"?><urlset></urlset>' }));
  t.after(() => srv.close());
  const { code } = await run([site(srv)], endpoint(srv));
  assert.equal(code, 1);
  assert.equal(srv.posts.length, 0);
});

test("--sitemap към липсващ локален файл: изход 1, нищо не се подава", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": SITEMAP })); // живият е наличен, но е поискан локалният
  t.after(() => srv.close());
  const dir = await mkdtemp(join(tmpdir(), "indexnow-"));
  const { code, out } = await run([site(srv), "--sitemap", join(dir, "няма-такъв.xml")], endpoint(srv));
  assert.equal(code, 1);
  assert.match(out, /няма-такъв\.xml/);
  assert.equal(srv.posts.length, 0, "не пада мълчаливо към живия sitemap или към началната страница");
});

test("--dry-run също спира при непрочетен sitemap (същата присъда като истинското пускане)", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": { status: 404 } }));
  t.after(() => srv.close());
  const { code, out } = await run([site(srv), "--dry-run"]);
  assert.equal(code, 1);
  assert.doesNotMatch(out, /IndexNow · host=/, "няма какво да се покаже като „ще подам“");
});

test("здрав sitemap: подават се точно адресите от него, изход 0", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": '<urlset><url><loc>http://127.0.0.1/a</loc></url><url><loc>http://127.0.0.1/b</loc></url></urlset>' }));
  t.after(() => srv.close());
  const { code, out } = await run([site(srv)], endpoint(srv));
  assert.equal(code, 0, out);
  assert.equal(srv.posts.length, 1);
  assert.deepEqual(srv.posts[0].urlList, ["http://127.0.0.1/a", "http://127.0.0.1/b"]);
  assert.equal(srv.posts[0].key, KEY);
  assert.match(out, /✓ Подадени 2 URL/);
});

test("изрично --url не зависи от sitemap-а: само началната страница се подава, когато е ПОИСКАНА", async (t) => {
  const srv = await serve(withKey({ "/sitemap.xml": { status: 503 } }));
  t.after(() => srv.close());
  const { code } = await run([site(srv), "--url", `${site(srv)}/`], endpoint(srv));
  assert.equal(code, 0);
  assert.deepEqual(srv.posts[0].urlList, [`${site(srv)}/`]);
});

test("индекс с недостъпен под-sitemap: прочетеното се подава, но изходът е 1 и липсващият е назован", async (t) => {
  // Индексът сочи порта на самия сървър, затова се добавя, след като портът е известен.
  const routes = withKey({ "/s1.xml": '<urlset><url><loc>http://127.0.0.1/a</loc></url></urlset>', "/s2.xml": { status: 500 } });
  const srv = await serve(routes);
  t.after(() => srv.close());
  routes["/sitemap.xml"] = `<sitemapindex><sitemap><loc>${site(srv)}/s1.xml</loc></sitemap><sitemap><loc>${site(srv)}/s2.xml</loc></sitemap></sitemapindex>`;
  const { code, out } = await run([site(srv)], endpoint(srv));
  assert.deepEqual(srv.posts.map((p) => p.urlList), [["http://127.0.0.1/a"]], "страниците от прочетения под-sitemap не се губят");
  assert.equal(code, 1, "частично подаване не е „всичко е подадено“");
  assert.match(out, /s2\.xml/, "казва кой под-sitemap липсва");
  assert.match(out, /HTTP 500/);
});

test("--dry-run при частично прочетен индекс: показва прочетеното и пак излиза с 1", async (t) => {
  const routes = withKey({ "/s1.xml": '<urlset><url><loc>http://127.0.0.1/a</loc></url></urlset>', "/s2.xml": { status: 500 } });
  const srv = await serve(routes);
  t.after(() => srv.close());
  routes["/sitemap.xml"] = `<sitemapindex><sitemap><loc>${site(srv)}/s1.xml</loc></sitemap><sitemap><loc>${site(srv)}/s2.xml</loc></sitemap></sitemapindex>`;
  const { code, out } = await run([site(srv), "--dry-run"], endpoint(srv));
  assert.equal(code, 1, "сухият пробег дава същата присъда като истинския");
  assert.match(out, / 1 URL /);
  assert.match(out, /s2\.xml \(HTTP 500\)/);
  assert.equal(srv.posts.length, 0, "--dry-run не подава");
});

test("индекс, от който не се прочита нито един под-sitemap: изход 1, нищо не се подава", async (t) => {
  const routes = withKey({ "/s1.xml": { status: 500 } });
  const srv = await serve(routes);
  t.after(() => srv.close());
  routes["/sitemap.xml"] = `<sitemapindex><sitemap><loc>${site(srv)}/s1.xml</loc></sitemap></sitemapindex>`;
  const { code, out } = await run([site(srv)], endpoint(srv));
  assert.equal(code, 1);
  assert.match(out, /s1\.xml \(HTTP 500\)/, "причината е отговорът на под-sitemap-а, не недостижим адрес");
  assert.equal(srv.posts.length, 0);
});
