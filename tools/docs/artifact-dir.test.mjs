// artifact-dir.test.mjs — артефактът на флота като папка: данни по агент, качват се само промените.
//
// Защо тези случаи: публикуващият чете всичко, което публикува. В един файл всяка поука значеше
// ново четене на 1.6 MB; тук трябва да е вярно, че (а) таблото получава СЪЩИЯ обект като от
// agents.json, (б) всеки относителен път на страницата има файл, (в) манифестът дава само промените.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDir, dataFiles, diffManifest, manifestOf, pageFrom, splitInline } from "./artifact-dir.mjs";
import { dashReader } from "./build-artifact.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = (body) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const PAGE = DOC(
  `<script>\nconst FALLBACK = {"meta": {"title": "Т"}, "agents": [{"id": "a", "text": "{скоба}"}]};\n` +
    `const GALAXY_SRC = "data:image/jpeg;base64,AAEC";\nlet DATA = FALLBACK;\n` +
    `fetch("./agents.json").then(r => r.json());\n</script><script src="./docs.js"></script>`,
);

test("pageFrom: FALLBACK остава само с meta, данните идват от fetchAgents(), галактиката е файл", () => {
  const page = pageFrom(PAGE);
  const html = [page.html, ...page.assets.map((a) => a.data)].join("\n");
  const { galaxy } = page;
  assert.doesNotMatch(html, /\{скоба\}/, "поуките не стоят в страницата");
  assert.match(html, /const FALLBACK = \{"meta":\{"title":"Т"\},"agents":\[\]\}/);
  assert.doesNotMatch(html, /fetch\("\.\/agents\.json"\)/);
  assert.match(html, /fetchAgents\(\)\.then/);
  assert.ok(html.indexOf("function fetchAgents") < html.indexOf("let DATA = FALLBACK"), "дефиницията е преди употребата");
  assert.match(html, /const GALAXY_SRC = "\.\/galaxy\.jpg";/);
  assert.deepEqual([...galaxy], [0, 1, 2]);
});

test("splitInline: страницата е тънка обвивка — вградените скрипт/стил са файлове в същия ред", () => {
  const { html, assets } = pageFrom(PAGE);
  assert.doesNotMatch(html, /<script>|<style>/);
  assert.match(html, /<script src="\.\/page-1\.js"><\/script><script src="\.\/docs\.js"><\/script>/, "редът се пази");
  assert.deepEqual(assets.map((a) => a.path), ["page-1.js"]);
  const css = splitInline('<style>a{}</style><script type="importmap">{}</script><script>x()</script>');
  assert.deepEqual(css.assets.map((a) => a.path), ["page-1.css", "page-2.js"]);
  assert.match(css.html, /<script type="importmap">\{\}<\/script>/, "importmap остава вграден");
  // Реален бъг: `<style>` в низ вътре в скрипт (SVG-то на маскота) не бива да се изрязва.
  const inner = splitInline('<script>const S = "<svg><style>.a{}</style></svg>";</script>');
  assert.deepEqual(inner.assets.map((a) => a.path), ["page-1.js"]);
  assert.match(inner.assets[0].data, /<style>\.a\{\}<\/style>/);
});

test("ЗЪБИ: сменено табло (без FALLBACK или с два fetch-а) спира билда, не публикува счупено", () => {
  assert.throws(() => pageFrom(DOC("<script>let DATA = 1;</script>")), /FALLBACK/);
  const twice = PAGE.replace('fetch("./agents.json")', 'fetch("./agents.json"); fetch("./agents.json")');
  assert.throws(() => pageFrom(twice), /точно един/);
});

test("dataFiles: индексът пази реда, всеки агент е отделен файл; странно id спира билда", () => {
  const files = dataFiles({ meta: { m: 1 }, agents: [{ id: "b", x: 1 }, { id: "a", x: 2 }] });
  assert.deepEqual(JSON.parse(files[0].data), { meta: { m: 1 }, agents: ["b", "a"] });
  assert.deepEqual(files.slice(1).map((f) => f.path), ["data/agents/b.json", "data/agents/a.json"]);
  assert.throws(() => dataFiles({ agents: [{ id: "../x" }] }), /id/);
});

test("diffManifest: само новите и сменените; махнатите отделно; без публикувано — всичко", () => {
  const next = { "index.html": "1", "data/agents/a.json": "2", "data/agents/b.json": "3" };
  assert.deepEqual(diffManifest(null, next), { changed: Object.keys(next), removed: [] });
  const prev = { "index.html": "1", "data/agents/a.json": "9", "data/agents/c.json": "4" };
  assert.deepEqual(diffManifest(prev, next), {
    changed: ["data/agents/a.json", "data/agents/b.json"],
    removed: ["data/agents/c.json"],
  });
});

test("реалният билд: всеки относителен път на страницата има файл; данните = agents.json", () => {
  const files = buildDir(dashReader(null, ROOT));
  const paths = new Set(files.map((f) => f.path));
  const page = files.filter((f) => f.path === "index.html" || /^page-\d+\.(js|css)$/.test(f.path)).map((f) => f.data).join("\n");
  for (const [, p] of page.matchAll(/["'`]\.\/([a-z0-9-]+\.(?:js|jpg|css))["'`]/g)) assert.ok(paths.has(p), `липсва ${p}`);
  assert.ok(Buffer.byteLength(files.find((f) => f.path === "index.html").data) < 30_000, "страницата е тънка обвивка");
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  for (const a of reg.agents) {
    assert.ok(paths.has(`mascots/${a.id}-icon3d.webp`), `икона на ${a.id}`);
    assert.deepEqual(JSON.parse(files.find((f) => f.path === `data/agents/${a.id}.json`).data), a);
  }
  assert.deepEqual(JSON.parse(files.find((f) => f.path === "data/index.json").data).agents, reg.agents.map((a) => a.id));
  assert.doesNotMatch(page, /data:image\/jpeg;base64/, "галактиката не е вградена");
  // Една поука променя само файла на агента — страницата и останалите остават същите.
  const before = manifestOf(files);
  const changedAgent = { ...reg, agents: reg.agents.map((a, i) => (i === 0 ? { ...a, extra: 1 } : a)) };
  const after = { ...before, ...manifestOf(dataFiles(changedAgent).map((f) => ({ ...f }))) };
  const { changed } = diffManifest(before, after);
  assert.deepEqual(changed, [`data/agents/${reg.agents[0].id}.json`]);
});
