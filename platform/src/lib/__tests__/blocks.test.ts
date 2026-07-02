import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlocks, renderInline } from "@/lib/blocks";
import { safeJsonLd } from "@/lib/seo";

const img = (url: string) => [
  { id: "1", type: "image", url, alt: "x", align: "center", rounded: false },
];

const btn = (href: string) => [
  { id: "1", type: "button", label: "x", href, align: "center", variant: "primary" },
];

test("качен относителен адрес /uploads/<uuid>.<ext> е валиден (не трие страницата)", () => {
  const out = parseBlocks(img("/uploads/2b1f9c34-5e6a-4b7c-8d9e-0f1a2b3c4d5e.png"));
  assert.equal(out.length, 1);
  assert.equal(out[0].type === "image" && out[0].url, "/uploads/2b1f9c34-5e6a-4b7c-8d9e-0f1a2b3c4d5e.png");
});

test("абсолютен https адрес остава валиден", () => {
  assert.equal(parseBlocks(img("https://example.com/a.jpg")).length, 1);
});

test("празен адрес е валиден (незададена снимка)", () => {
  assert.equal(parseBlocks(img("")).length, 1);
});

test("подправен относителен път НЕ се приема (traversal/друга папка)", () => {
  assert.equal(parseBlocks(img("/uploads/../etc/passwd")).length, 0);
  assert.equal(parseBlocks(img("/other/x.png")).length, 0);
});

test("javascript: адрес се отхвърля", () => {
  assert.equal(parseBlocks(img("javascript:alert(1)")).length, 0);
});

test("renderInline остава escape-first (без XSS)", () => {
  const html = renderInline("<script>alert(1)</script> **удебелен**");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("<strong>удебелен</strong>"));
});

test("href на бутон приема mailto:/tel:/#котва/вътрешен път", () => {
  assert.equal(parseBlocks(btn("mailto:info@site.bg")).length, 1);
  assert.equal(parseBlocks(btn("tel:+359888123456")).length, 1);
  assert.equal(parseBlocks(btn("#kontakti")).length, 1);
  assert.equal(parseBlocks(btn("/contact")).length, 1);
  assert.equal(parseBlocks(btn("https://example.com")).length, 1);
});

test("href на бутон отхвърля javascript: и протокол-относителен //хост", () => {
  assert.equal(parseBlocks(btn("javascript:alert(1)")).length, 0);
  assert.equal(parseBlocks(btn("//evil.com")).length, 0);
  assert.equal(parseBlocks(btn("data:text/html,<script>")).length, 0);
});

test("safeJsonLd екранира </script> (без DOM breakout)", () => {
  const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("</script>"));
  assert.ok(!out.includes("<script>"));
  assert.ok(out.includes("\\u003c")); // „<" е екранирано
  // остава валиден JSON
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});
