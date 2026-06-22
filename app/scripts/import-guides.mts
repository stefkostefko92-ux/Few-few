// Извлича пълния набор ръководства от read-only reference проекта
// (../zabobovdol/prisma/seed-*.ts), без база данни, и ги записва като
// типизиран статичен файл app/src/data/guides.generated.ts, адаптиран за Дупница.
//
// Стартиране: npm run import:guides
//
// Как работи: регистрира ESM loader (prisma-stub-loader.mjs), който подменя
// `@prisma/client`. После import-ва seed файловете; техните faq.upsert/update
// извиквания се събират в globalThis.__GUIDES__. Накрая базовите записи и
// обогатяващите override-и се сливат по slug и се адаптират за града.

import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Module from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = resolve(HERE, "../../zabobovdol/prisma");
const OUT = resolve(HERE, "../src/data/guides.generated.ts");

type Bucket = {
  base: Record<string, unknown>[];
  override: { where: { slug?: string }; data: Record<string, unknown> }[];
};
declare global {
  var __GUIDES__: Bucket | undefined;
}
globalThis.__GUIDES__ = { base: [], override: [] };

// Подменяме `@prisma/client` (зарежда се през CommonJS require от tsx), за да
// изпълним seed файловете без база. faq.upsert/update събират в globalThis.
const faqMethods: Record<string, (...a: unknown[]) => Promise<unknown>> = {
  async upsert(args: unknown) {
    const a = (args ?? {}) as { create?: unknown; update?: unknown };
    const data = (a.create ?? a.update ?? {}) as Record<string, unknown>;
    globalThis.__GUIDES__!.base.push(data);
    return data;
  },
  async update(args: unknown) {
    const a = (args ?? {}) as { where?: { slug?: string }; data?: Record<string, unknown> };
    globalThis.__GUIDES__!.override.push({ where: a.where ?? {}, data: a.data ?? {} });
    return a.data ?? {};
  },
  async create(args: unknown) {
    const a = (args ?? {}) as { data?: Record<string, unknown> };
    globalThis.__GUIDES__!.base.push(a.data ?? {});
    return a.data ?? {};
  },
  async findMany() {
    return [];
  },
  async findUnique() {
    return null;
  },
};
// Всеки друг faq метод (deleteMany, updateMany, count…) е безопасен no-op.
const faqStub = new Proxy(faqMethods, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return async () => ({ count: 0 });
  },
});
const noop = async () => undefined;
class PrismaClientStub {
  constructor() {
    return new Proxy(this, {
      get(_t, prop) {
        if (prop === "faq") return faqStub;
        if (prop === "$disconnect" || prop === "$connect" || prop === "$transaction") return noop;
        return new Proxy({}, { get: () => async () => undefined });
      },
    });
  }
}
const prismaStub = { PrismaClient: PrismaClientStub };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ModuleAny = Module as any;
const origLoad = ModuleAny._load;
ModuleAny._load = function (request: string, ...rest: unknown[]) {
  if (request === "@prisma/client") return prismaStub;
  return origLoad.call(this, request, ...rest);
};

// Базови файлове: дефинират ръководствата (faq.upsert / seedGuides).
const BASE_FILES = [
  "seed-howto.ts",
  "seed-basics.ts",
  "seed-phone-basics.ts",
  "seed-safety.ts",
  "seed-easypay.ts",
  "seed-euro.ts",
  "seed-accessibility.ts",
  "seed-c-civic.ts",
  "seed-c-elderly.ts",
  "seed-c-extra2.ts",
  "seed-c-health.ts",
  "seed-c-home.ts",
  "seed-c-internet.ts",
  "seed-c-kitchen.ts",
  "seed-c-leisure.ts",
  "seed-c-money.ts",
  "seed-c-social.ts",
  "seed-c-tech.ts",
  "seed-set-apps.ts",
  "seed-set-daily.ts",
  "seed-set-extra.ts",
  "seed-set-facebook.ts",
  "seed-set-health.ts",
  "seed-set-internet.ts",
  "seed-set-keyboard.ts",
  "seed-set-more.ts",
  "seed-set-settings.ts",
  "seed-set-shop.ts",
];

// Обогатяващи файлове: презаписват answer/steps/tags по съществуващ slug.
const OVERRIDE_FILES = [
  "seed-detailed.ts",
  "seed-detailed-2.ts",
  "seed-detailed-3.ts",
  "seed-detailed-4.ts",
  "seed-detailed-5.ts",
  "seed-detailed-6.ts",
  "seed-detailed-7.ts",
  "seed-detailed-8.ts",
  "seed-detailed-9.ts",
  "seed-detailed-10.ts",
  "seed-detailed-11.ts",
  "seed-detailed-12.ts",
  "seed-detailed-13.ts",
  "seed-detailed-14.ts",
  "seed-detailed-15.ts",
  "seed-detailed-16.ts",
  "seed-detailed-17.ts",
  "seed-detailed-18.ts",
  "seed-detailed-19.ts",
  "seed-detailed-20.ts",
  "seed-detailed-21.ts",
  "seed-detailed-22.ts",
  "seed-detailed-23.ts",
  "seed-detailed-24.ts",
];

const drain = () => new Promise<void>((r) => setImmediate(r));

async function run(files: string[]) {
  for (const f of files) {
    const url = pathToFileURL(resolve(SEED_DIR, f)).href;
    try {
      await import(url);
      await drain();
      await drain();
    } catch (e) {
      console.error(`! Проблем при ${f}:`, (e as Error).message);
    }
  }
}

// Адаптация за Дупница: подменя само споменавания на референтния град/домейн.
function adapt(s: string): string {
  return s
    .replace(/Бобов\s*дол/g, "Дупница")
    .replace(/Бобовдол/g, "Дупница")
    .replace(/бобовдол/g, "дупница")
    .replace(/zabobovdol/g, "zadupnitsa");
}
function adaptMaybe(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  return adapt(v);
}

type Guide = {
  slug: string;
  question: string;
  category: string;
  answer: string;
  steps: string[];
  tags: string;
  relatedLinks: string[];
  order: number;
};

function toSteps(v: unknown): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v.split("\n").map((x) => adapt(x)).filter(Boolean);
}

async function main() {
  await run(BASE_FILES);
  await run(OVERRIDE_FILES);

  const bucket = globalThis.__GUIDES__!;
  const map = new Map<string, Guide>();

  for (const r of bucket.base) {
    const slug = String(r.slug ?? "");
    if (!slug) continue;
    map.set(slug, {
      slug,
      question: adaptMaybe(r.question) ?? "",
      category: adaptMaybe(r.category) ?? "Други",
      answer: adaptMaybe(r.answer) ?? "",
      steps: toSteps(r.steps),
      tags: adaptMaybe(r.tags) ?? "",
      relatedLinks: toSteps(r.relatedLinks),
      order: typeof r.order === "number" ? r.order : 999,
    });
  }

  let applied = 0;
  let missing = 0;
  for (const o of bucket.override) {
    const slug = String(o.where?.slug ?? "");
    const g = map.get(slug);
    if (!g) {
      missing++;
      continue;
    }
    applied++;
    const d = o.data;
    const ans = adaptMaybe(d.answer);
    if (ans) g.answer = ans;
    const st = toSteps(d.steps);
    if (st.length) g.steps = st;
    const tg = adaptMaybe(d.tags);
    if (tg) g.tags = tg;
    const rl = toSteps(d.relatedLinks);
    if (rl.length) g.relatedLinks = rl;
  }

  const guides = [...map.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category, "bg") ||
      a.order - b.order ||
      a.slug.localeCompare(b.slug),
  );

  // Ред на категориите по първо появяване (за стабилно подреждане в хъба).
  const categoryOrder: string[] = [];
  for (const g of guides) {
    if (!categoryOrder.includes(g.category)) categoryOrder.push(g.category);
  }
  categoryOrder.sort((a, b) => a.localeCompare(b, "bg"));

  const header =
    "// АВТОМАТИЧНО ГЕНЕРИРАН ФАЙЛ — не редактирайте на ръка.\n" +
    "// Източник: ../../zabobovdol/prisma/seed-*.ts (read-only reference).\n" +
    "// Регенериране: npm run import:guides\n" +
    `// Брой ръководства: ${guides.length}.\n\n` +
    'import type { Guide } from "./guides";\n\n';

  const body =
    "export const CATEGORY_ORDER: string[] = " +
    JSON.stringify(categoryOrder, null, 2) +
    ";\n\n" +
    "export const GUIDES: Guide[] = " +
    JSON.stringify(guides, null, 2) +
    ";\n";

  writeFileSync(OUT, header + body, "utf8");

  console.log(`\n✔ Базови записи: ${bucket.base.length}`);
  console.log(`✔ Override записи: ${bucket.override.length} (приложени ${applied}, без съвпадение ${missing})`);
  console.log(`✔ Уникални ръководства: ${guides.length}`);
  console.log(`✔ Категории: ${categoryOrder.length}`);
  console.log(`✔ Записано: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
