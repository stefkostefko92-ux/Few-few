// static-site-check.test.mjs — гейтът за статичните продукти (kebab), които нямаха НИКАКВА проверка.
// Счупен локален асет или липсващи ключови думи стигаха до продукция без нищо да ги спре.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFile, localTargets, keywordsOf, checkSite, MIN_KEYWORDS, BRAND } from "./static-site-check.mjs";

const KW = `нещо, друго, трето, четвърто, пето, ${BRAND}`;
const page = (extra = "", kw = KW) =>
  `<!doctype html><html lang="it"><head><title>Заглавие</title>\n<meta name="keywords" content="${kw}">\n</head><body>${extra}</body></html>`;

function site(files) {
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("localTargets взима само локалните цели", () => {
  const t = localTargets(`<a href="/a.html">x</a><img src="img/b.png"><a href="https://x.bg/c">e</a>
    <a href="mailto:a@b.bg">m</a><a href="#top">t</a><script src="//cdn/x.js"></script>`);
  assert.deepEqual(t.sort(), ["/a.html", "img/b.png"]);
});

test("keywordsOf връща списъка, а липсата дава null", () => {
  assert.equal(keywordsOf(page()).length, 6);
  assert.equal(keywordsOf("<html><head></head></html>"), null);
});

test("чиста страница минава", () => {
  const s = site({ "index.html": page(), "style.css": "body{}" });
  try { assert.deepEqual(checkFile(join(s.dir, "index.html"), s.dir, page()), []); } finally { s.cleanup(); }
});

test("счупена локална препратка е находка", () => {
  const html = page(`<img src="nqma.png">`);
  const s = site({ "index.html": html });
  try {
    const errs = checkFile(join(s.dir, "index.html"), s.dir, html);
    assert.ok(errs.some((e) => /счупена локална препратка: nqma\.png/.test(e)));
  } finally { s.cleanup(); }
});

test("съществуващ асет НЕ е находка (нула фалшиви)", () => {
  const html = page(`<img src="img/logo.png"><link href="/style.css">`);
  const s = site({ "index.html": html, "img/logo.png": "x", "style.css": "y" });
  try { assert.deepEqual(checkFile(join(s.dir, "index.html"), s.dir, html), []); } finally { s.cleanup(); }
});

test("липсваща марка в ключовите думи е находка (законът в CLAUDE.md)", () => {
  const html = page("", "едно, две, три, четири, пет");
  const s = site({ "index.html": html });
  try {
    assert.ok(checkFile(join(s.dir, "index.html"), s.dir, html).some((e) => e.includes(BRAND)));
  } finally { s.cleanup(); }
});

test("под минимума ключови думи е находка", () => {
  const html = page("", `едно, две, ${BRAND}`);
  const s = site({ "index.html": html });
  try {
    assert.ok(checkFile(join(s.dir, "index.html"), s.dir, html).some((e) => new RegExp(`минимум ${MIN_KEYWORDS}`).test(e)));
  } finally { s.cleanup(); }
});

test("липсващ title и lang са находки (достъпност + SEO)", () => {
  const html = `<!doctype html><html><head><title></title><meta name="keywords" content="${KW}"></head><body></body></html>`;
  const s = site({ "index.html": html });
  try {
    const errs = checkFile(join(s.dir, "index.html"), s.dir, html);
    assert.ok(errs.some((e) => /title/.test(e)));
    assert.ok(errs.some((e) => /lang/.test(e)));
  } finally { s.cleanup(); }
});

test("реалният kebab минава (регресия за поправените ключови думи)", () => {
  const r = checkSite("kebab");
  assert.ok(r.files >= 4, `очаквам HTML файловете на kebab, намерих ${r.files}`);
  assert.deepEqual(r.failed.map((f) => `${f.file}: ${f.errs.join(" · ")}`), []);
});
