import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EURO_TODAY, euroTodayNote, isEuroTopic } from "@/lib/howto-euro";

// Адресите на въпросите за еврото от seed-а — бележките трябва да сочат
// само към съществуващи отговори.
const SEED_SLUGS = new Set(
  [...readFileSync(join(process.cwd(), "prisma/seed-euro.ts"), "utf8").matchAll(/slug: "(e-[a-z-]+)"/g)].map(
    (m) => m[1],
  ),
);

test("бележките „какво важи днес“ са само за съществуващи въпроси за еврото", () => {
  assert.ok(SEED_SLUGS.size >= 30, "seed-euro.ts трябва да има въпросите");
  for (const slug of Object.keys(EURO_TODAY)) {
    assert.ok(SEED_SLUGS.has(slug), `няма въпрос ${slug} в prisma/seed-euro.ts`);
  }
});

test("отговорите с изтекъл срок имат бележка, верните днес — не", () => {
  assert.match(euroTodayNote("e-obmiana-bezplatno") ?? "", /БНБ.*без срок/);
  assert.match(euroTodayNote("e-leva-do-koga") ?? "", /1 февруари 2026/);
  assert.equal(euroTodayNote("e-kurs"), null);
  assert.equal(euroTodayNote("e-bnb-bezsrochno"), null);
});

test("темата „Еврото“ се разпознава по име и по адрес", () => {
  assert.equal(isEuroTopic("Еврото"), true);
  assert.equal(isEuroTopic("еврото"), true);
  assert.equal(isEuroTopic("evroto"), true);
  assert.equal(isEuroTopic("Пари, сметки и права"), false);
});
