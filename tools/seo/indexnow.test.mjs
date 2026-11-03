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

/** Сървър, който отговаря по подадената карта; всичко останало = SPA fallback. */
function serve(routes) {
  const srv = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (path in routes) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(routes[path]);
      return;
    }
    // Точно това прави nginx-ът пред фронтенда: непознат път → index.html, 200.
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!DOCTYPE html>\n<html lang=\"en\"><head><title>Supreme</title></head><body></body></html>");
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [TOOL, ...args], { env: { ...process.env, INDEXNOW_KEY: "" } });
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
