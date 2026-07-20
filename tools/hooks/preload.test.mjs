// preload.test.mjs — пази КЕШ-ЗАКЛЮЧВАНЕТО на инжектирания префикс (prompt caching инвариант).
//
// Печалбата от кеша зависи от едно: статичният префикс (доктрина+процедура+споделено) да е
// БАЙТ-в-БАЙТ еднакъв за всеки агент и без агент-специфично съдържание. Тези тестове го заключват —
// регресия, която вмъкне име/задача в статичния блок, чупи кеша за целия флот и пада тук.

import { test } from "node:test";
import assert from "node:assert/strict";
import { staticPrefixParts } from "../../.claude/hooks/memory-preload.mjs";

test("статичният префикс е непразен и има трите блока (доктрина+процедура+споделено)", () => {
  const parts = staticPrefixParts();
  assert.equal(parts.length, 3, "очаквам точно 3 статични блока");
  assert.match(parts[0], /ДОКТРИНА ЗА СИГУРНОСТ/);
  assert.match(parts[1], /ОБЩА ПРОЦЕДУРА/);
  assert.match(parts[2], /СПОДЕЛЕНИ ПОУКИ/);
});

test("статичният префикс е детерминистичен (еднакъв при всяко извикване → кешируем)", () => {
  const a = staticPrefixParts().join("\n\n");
  const b = staticPrefixParts().join("\n\n");
  assert.equal(a, b, "префиксът трябва да е байт-в-байт стабилен между извикванията");
});

test("статичният префикс е агент-независим (нула агентски имена → еднакъв за целия флот)", () => {
  const joined = staticPrefixParts().join("\n\n");
  // Нито едно агентско собствено име не бива да изтича в статичния (кешируем) блок.
  for (const name of ["Кодаджията", "Касаджията", "kodadjiyata", "kasadjiyata", "razbivacha"]) {
    assert.ok(!joined.includes(name), `статичният префикс не бива да съдържа „${name}" (чупи кеша)`);
  }
});
