import test from "node:test";
import assert from "node:assert/strict";
import { DIRECTORY, MAIN_SIGNS, PRIMARY_NAV } from "@/lib/site";

test("всеки раздел е или голяма табела, или точно в една група на указателя", () => {
  const placed = [...MAIN_SIGNS, ...DIRECTORY.flatMap((g) => g.hrefs)];
  assert.equal(new Set(placed).size, placed.length, "раздел се повтаря");
  const nav = PRIMARY_NAV.map((n) => n.href).sort();
  assert.deepEqual([...placed].sort(), nav);
});
