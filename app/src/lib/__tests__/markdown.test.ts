import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, plainText } from "../markdown";

test("рендерира заглавия и параграфи", () => {
  assert.equal(renderMarkdown("# Заглавие"), "<h2>Заглавие</h2>");
  assert.equal(renderMarkdown("Просто изречение."), "<p>Просто изречение.</p>");
});

test("рендерира списъци", () => {
  const html = renderMarkdown("- едно\n- две");
  assert.equal(html, "<ul>\n<li>едно</li>\n<li>две</li>\n</ul>");
});

test("екранира опасен HTML", () => {
  const html = renderMarkdown("<script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("позволява само безопасни връзки", () => {
  const ok = renderMarkdown("[линк](https://example.com)");
  assert.ok(ok.includes('href="https://example.com"'));
  // Опасните схеми не се превръщат в кликаема връзка (остават безобиден текст).
  const bad = renderMarkdown("[x](javascript:alert(1))");
  assert.ok(!bad.includes("<a "));
  assert.ok(!bad.includes('href="javascript:'));
});

test("plainText маха маркъп и подрязва", () => {
  assert.equal(plainText("# Здравей **свят**"), "Здравей свят");
  assert.equal(plainText("aaaa", 3), "aa…");
});
