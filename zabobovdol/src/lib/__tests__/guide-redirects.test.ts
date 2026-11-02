import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  RETIRED_GUIDES,
  RETIRED_GUIDE_SLUGS,
  retiredGuideTarget,
} from "@/lib/guide-redirects";
import { getIllustrations } from "@/lib/howto-illustrations";

// Сийдовете с ръководства (prisma/seed*.ts) — четем ги като текст, за да пазим
// инвариантите без база: нула дублирани заглавия и нула оттеглени slug-ове.
const PRISMA_DIR = resolve(__dirname, "../../../prisma");
const SEEDS = readdirSync(PRISMA_DIR)
  .filter((f) => /^seed.*\.ts$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(PRISMA_DIR, f), "utf8") }));
const MIGRATIONS_DIR = join(PRISMA_DIR, "migrations");
const MIGRATIONS_SQL = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => readFileSync(join(MIGRATIONS_DIR, d.name, "migration.sql"), "utf8"))
  .join("\n");

// ── Почти еднакви ръководства ──────────────────────────────────────────────
// Мярка: TF-IDF косинусово сходство между текстовете на две ръководства —
// въпрос + отговор + стъпки (всички низови литерали в обекта, без tags/category),
// сборно от основния сийд и от seed-detailed-*.ts. Думите са с малки букви, без
// служебни думи и съкратени до първите 5 букви (грубо „стъбло“ за българските
// окончания: „пенсия/пенсията/пенсии“ → „пенси“).
//
// Праг 0.75 (калибриран на 02.11.2026 върху всички 568 ръководства): над него са
// дословните копия — 34 от 63-те обединени тогава двойки (0.75–0.97); след
// обединяването най-сходната останала двойка е 0.74 (изключението по-долу), а
// следващата — 0.69, т.е. ~0.06 резерв. По-ниско сходство не значи „различни“:
// там решава човек, след като прочете двете (така бяха обединени и останалите 29).
const NEAR_DUPLICATE_THRESHOLD = 0.75;

// Прочетени и умишлено оставени отделни, макар и над (или на ръба на) прага.
// Всяка двойка — с причина. (Еврото: 0.74 на 02.11.2026.)
const REVIEWED_DISTINCT: readonly (readonly [string, string, string])[] = [
  [
    "e-falshivo-evro",
    "money-falshiva-banknota",
    "еврото има собствен раздел (/evroto) и търсене „фалшиво евро“; другото е за всяка банкнота",
  ],
];

const STOP_WORDS = new Set(
  `и в на с за да се от по не е са ако или как към при ви си то го ги му ѝ й я ще съм сте сме
това тази този тези там тук а но че кой коя кое кои какво какъв каква какви които който която което
вашия вашата вашите ваш ваша ваше вас вие ние той тя те мой моя мое мои моят моята своя своите
до след преди през над под без между около още вече само също така много малко всички всеки всяка всяко
когато където дали обаче защото ли бъде бъдат има няма`.split(/\s+/),
);

function words(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().replace(/ѝ/g, "и").match(/[a-zа-я0-9]+/g) ?? []) {
    if (!STOP_WORDS.has(w)) out.push(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}

// slug → текстът на ръководството от всички сийдове (основен + детайлен).
function guideTexts(guideSlugs: ReadonlySet<string>): Map<string, string> {
  const texts = new Map<string, string>();
  const literal = /"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
  const skipKey = /\b(?:tags|category|slug|relatedLinks|seoTitle|seoDescription)\s*:\s*$/;
  for (const { text } of SEEDS) {
    const slugs = [...text.matchAll(/\bslug:\s*"([a-z0-9-]+)"/g)];
    slugs.forEach((m, i) => {
      if (!guideSlugs.has(m[1])) return;
      const from = (m.index ?? 0) + m[0].length;
      let to = slugs[i + 1]?.index ?? text.length;
      const arrayEnd = text.indexOf("\n];", from);
      if (arrayEnd >= 0 && arrayEnd < to) to = arrayEnd;
      const block = text.slice(from, to);
      const parts: string[] = [];
      for (const lm of block.matchAll(literal)) {
        const at = lm.index ?? 0;
        if (skipKey.test(block.slice(Math.max(0, at - 40), at))) continue;
        parts.push((lm[1] ?? lm[2] ?? "").replace(/\\n/g, " "));
      }
      texts.set(m[1], `${texts.get(m[1]) ?? ""} ${parts.join(" ")}`);
    });
  }
  return texts;
}

function tfidfVectors(texts: Map<string, string>): Map<string, Map<string, number>> {
  const tokens = new Map([...texts].map(([s, t]) => [s, words(t)] as const));
  const df = new Map<string, number>();
  for (const ws of tokens.values()) {
    for (const w of new Set(ws)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const n = tokens.size;
  const vectors = new Map<string, Map<string, number>>();
  for (const [slug, ws] of tokens) {
    const tf = new Map<string, number>();
    for (const w of ws) tf.set(w, (tf.get(w) ?? 0) + 1);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [w, c] of tf) {
      const x = (1 + Math.log(c)) * Math.log((n + 1) / ((df.get(w) ?? 0) + 1));
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    vectors.set(slug, v);
  }
  return vectors;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [w, x] of small) sum += x * (big.get(w) ?? 0);
  return sum;
}

// Двойки slug → заглавие (`question: "…"` или `q: \`…\``) с най-близкия slug
// преди заглавието в същия файл.
function guideDefinitions(): { slug: string; question: string; file: string }[] {
  const out: { slug: string; question: string; file: string }[] = [];
  const qRe = /\b(?:question|q):\s*(["`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const { file, text } of SEEDS) {
    for (const m of text.matchAll(qRe)) {
      const before = text.slice(0, m.index ?? 0);
      const slugs = [...before.matchAll(/\bslug:\s*"([a-z0-9-]+)"/g)];
      const slug = slugs.at(-1)?.[1];
      if (slug) out.push({ slug, question: m[2].trim(), file });
    }
  }
  return out;
}

// Всички slug-ове на ръководства в сийдовете: с въпрос (по-горе) или създадени
// поотделно с prisma.faq.upsert({ where: { slug } }) (напр. seed-easypay.ts).
function seededGuideSlugs(): Set<string> {
  const slugs = new Set(guideDefinitions().map((d) => d.slug));
  const upsertRe = /\bfaq\.upsert\(\{\s*where:\s*\{\s*slug:\s*"([a-z0-9-]+)"/g;
  for (const { text } of SEEDS) {
    for (const m of text.matchAll(upsertRe)) slugs.add(m[1]);
  }
  return slugs;
}

test("retiredGuideTarget връща каноничния slug само за оттеглените", () => {
  assert.equal(retiredGuideTarget("c-zdravno-dosie2"), "docs-zdravno-dosie");
  assert.equal(retiredGuideTarget("docs-zdravno-dosie"), null);
  assert.equal(retiredGuideTarget("constructor"), null);
  assert.equal(retiredGuideTarget(""), null);
});

test("пренасочванията нямат вериги (каноничният не е оттеглен)", () => {
  for (const [from, to] of Object.entries(RETIRED_GUIDES)) {
    assert.notEqual(from, to);
    assert.equal(retiredGuideTarget(to), null, `${from} → ${to} води към оттеглен`);
  }
});

test("сийдовете не създават оттеглени ръководства", () => {
  for (const slug of RETIRED_GUIDE_SLUGS) {
    for (const { file, text } of SEEDS) {
      assert.ok(!text.includes(`"${slug}"`), `${slug} още е в prisma/${file}`);
    }
  }
});

test("всяко канонично ръководство съществува в сийдовете", () => {
  const defined = seededGuideSlugs();
  for (const to of Object.values(RETIRED_GUIDES)) {
    assert.ok(defined.has(to), `${to} липсва в сийдовете`);
  }
});

test("всяко оттеглено ръководство се скрива в заварената база с миграция", () => {
  // Сийдовете се пускат само при първа инсталация — без UPDATE … published = false
  // в миграция старият запис остава публикуван на живия сайт (зад 301, но в базата,
  // търсенето и чата).
  for (const slug of RETIRED_GUIDE_SLUGS) {
    assert.ok(MIGRATIONS_SQL.includes(`'${slug}'`), `${slug} не е в нито една миграция`);
  }
});

test("оттеглените нямат картинки (те са преместени към каноничното)", () => {
  for (const slug of RETIRED_GUIDE_SLUGS) {
    assert.deepEqual(getIllustrations(slug), [], `${slug} още е в howto-illustrations.ts`);
  }
});

test("няма почти еднакви ръководства (сходство на текста над прага)", () => {
  const slugs = seededGuideSlugs();
  const vectors = tfidfVectors(guideTexts(slugs));
  assert.ok(vectors.size > 500, `намерени само ${vectors.size} текста — парсерът е счупен?`);

  const allowed = new Set(REVIEWED_DISTINCT.map(([a, b]) => [a, b].sort().join("|")));
  for (const [a, b, why] of REVIEWED_DISTINCT) {
    assert.ok(why.trim().length > 0, `${a} / ${b}: липсва причина`);
    for (const s of [a, b]) {
      assert.ok(vectors.has(s), `изключението ${a} / ${b}: ${s} вече не е в сийдовете — махнете го`);
      assert.equal(retiredGuideTarget(s), null, `изключението ${a} / ${b}: ${s} е оттеглен`);
    }
  }

  const entries = [...vectors].sort(([x], [y]) => x.localeCompare(y));
  const found: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, va] = entries[i];
      const [b, vb] = entries[j];
      const score = cosine(va, vb);
      if (score >= NEAR_DUPLICATE_THRESHOLD && !allowed.has(`${a}|${b}`)) {
        found.push(`${score.toFixed(2)} ${a} / ${b}`);
      }
    }
  }
  assert.deepEqual(
    found,
    [],
    "прочетете двете: ако отговарят на един въпрос с едни стъпки — обединете ги " +
      "(src/lib/guide-redirects.ts + миграция); ако са различни задачи — добавете ги " +
      "в REVIEWED_DISTINCT с причина",
  );
});

test("няма две различни ръководства с едно и също заглавие (дублирано съдържание)", () => {
  const defs = guideDefinitions();
  assert.ok(defs.length > 500, `намерени само ${defs.length} ръководства — парсерът е счупен?`);
  const byQuestion = new Map<string, Set<string>>();
  for (const d of defs) {
    const set = byQuestion.get(d.question) ?? new Set<string>();
    set.add(d.slug);
    byQuestion.set(d.question, set);
  }
  const dups = [...byQuestion].filter(([, s]) => s.size > 1);
  assert.deepEqual(
    dups.map(([q, s]) => `${q}: ${[...s].join(", ")}`),
    [],
    "обединете ги: оставете едно и добавете другото в src/lib/guide-redirects.ts",
  );
});
