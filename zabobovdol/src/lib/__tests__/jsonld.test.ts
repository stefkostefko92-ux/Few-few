import test from "node:test";
import assert from "node:assert/strict";
import { safeJsonLd } from "@/lib/jsonld";

test("екранира </script> и не позволява изход от блока", () => {
  const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(">"));
  assert.ok(!out.toLowerCase().includes("</script>"));
});

test("екранира амперсанд и остава валиден JSON", () => {
  const out = safeJsonLd({ name: "Иван & Ко" });
  assert.ok(!out.includes("&"));
  assert.deepEqual(JSON.parse(out), { name: "Иван & Ко" });
});

test("екранира U+2028/U+2029 (невалидни в някои JSON парсери)", () => {
  const ls = String.fromCharCode(0x2028);
  const ps = String.fromCharCode(0x2029);
  const value = `ред${ls}нов${ps}край`;
  const out = safeJsonLd({ t: value });
  assert.ok(out.includes("\\u2028"));
  assert.ok(out.includes("\\u2029"));
  assert.deepEqual(JSON.parse(out), { t: value });
});

test("обикновените стойности остават коректни", () => {
  assert.deepEqual(JSON.parse(safeJsonLd({ a: 1, b: "тест" })), { a: 1, b: "тест" });
});
