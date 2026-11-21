// Тестове за safeJsonLd — JSON-LD, вграден в <script type="application/ld+json">.
// Потребителски текст (име на отбор, новина) не бива да затваря блока.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeJsonLd } from "../jsonld";

describe("safeJsonLd", () => {
  test("</script> в стойност не затваря блока", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    assert.ok(!out.includes("</script"));
    assert.ok(!out.includes("<"));
    assert.ok(out.includes("\\u003c/script\\u003e"));
  });

  test("<, >, & се екранират като \\uXXXX", () => {
    assert.equal(safeJsonLd({ a: "<" }), '{"a":"\\u003c"}');
    assert.equal(safeJsonLd({ a: ">" }), '{"a":"\\u003e"}');
    assert.equal(safeJsonLd({ a: "&" }), '{"a":"\\u0026"}');
  });

  test("U+2028 и U+2029 се екранират", () => {
    const out = safeJsonLd({ a: "x\u2028y\u2029z" });
    assert.ok(!out.includes("\u2028"));
    assert.ok(!out.includes("\u2029"));
    assert.equal(out, '{"a":"x\\u2028y\\u2029z"}');
  });

  test("екраниране и в ключове, не само в стойности", () => {
    const out = safeJsonLd({ "<k>": 1 });
    assert.ok(!out.includes("<"));
    assert.deepEqual(JSON.parse(out), { "<k>": 1 });
  });

  test("резултатът е валиден JSON със същия обект (кръг)", () => {
    const obj = {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      name: "ФК „Миньор“ <Бобов дол> & Co",
      description: "ред1\u2028ред2\u2029ред3 </script>",
      nested: { list: ["<a>", "&amp;", 1, true, null] },
    };
    assert.deepEqual(JSON.parse(safeJsonLd(obj)), obj);
  });

  test("обикновените данни остават непроменени (кирилица, кавички)", () => {
    const obj = { name: "Миньор", q: 'казва "здравей"' };
    assert.equal(safeJsonLd(obj), JSON.stringify(obj));
  });

  test("масив и примитиви", () => {
    assert.equal(safeJsonLd([1, "<"]), '[1,"\\u003c"]');
    assert.equal(safeJsonLd(null), "null");
    assert.equal(safeJsonLd("a&b"), '"a\\u0026b"');
  });
});
