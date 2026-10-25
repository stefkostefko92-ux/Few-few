import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, plainText } from "@/lib/markdown";

test("екранира HTML (защита срещу XSS)", () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("неутрализира опасни тагове (няма изпълним HTML)", () => {
  const html = renderMarkdown('">< img src=x onerror=alert(1)>');
  // ъгловите скоби са екранирани → няма реален таг, който да се изпълни
  assert.ok(!/<img/i.test(html));
  assert.ok(!/<\s*img/i.test(html));
  assert.ok(html.includes("&lt;") && html.includes("&gt;"));
});

test("позволява само безопасни схеми за връзки", () => {
  const ok = renderMarkdown("[link](https://example.com)");
  assert.ok(ok.includes('href="https://example.com"'));
  assert.ok(ok.includes('rel="noopener noreferrer"'));
  // javascript: схема не се разпознава като връзка
  const bad = renderMarkdown("[x](javascript:alert(1))");
  assert.ok(!/href="javascript:/i.test(bad));
});

test("рендерира заглавия, удебелен текст и списъци", () => {
  assert.ok(renderMarkdown("## Заглавие").includes("<h3>Заглавие</h3>"));
  assert.ok(renderMarkdown("**жирно**").includes("<strong>жирно</strong>"));
  const list = renderMarkdown("- едно\n- две");
  assert.ok(list.includes("<ul>") && list.includes("<li>едно</li>"));
});

test("plainText маха Markdown и съкращава", () => {
  assert.equal(plainText("**Здравей** [тук](https://x.bg)"), "Здравей тук");
  const long = plainText("дума ".repeat(100), 20);
  assert.ok(long.length <= 20);
  assert.ok(long.endsWith("…"));
});

test("plainText реже по цяла дума и без пунктуация пред „…“", () => {
  // Не сред думата („без да ч…“).
  const t = plainText("Затворете телефона без да чакате обяснения от непознатия човек", 30);
  assert.equal(t, "Затворете телефона без да…");
  // Не „стойността.…“ — точката пада, остава само „…“.
  assert.equal(plainText("Курсът е фиксиран за да е вярна стойността. И още нещо", 44), "Курсът е фиксиран за да е вярна стойността.");
  assert.equal(plainText("Едно, две, три, четири, пет, шест, седем", 22), "Едно, две, три…");
  // Изречение, което свършва в рамките на мястото → без „…“.
  assert.equal(plainText("Първото изречение е дълго. Второто не се побира тук", 40), "Първото изречение е дълго.");
});
