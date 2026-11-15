import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "./_seedlib";

// Липсващи ръководства „Как да…“ в продукцията.
//
// scripts/deploy.sh засява базата САМО при първо пускане (иначе би презаписал
// редакциите от админ панела). Ръководствата, добавени в prisma/seed-*.ts след
// това, не стигат до живата база — страниците им дават 404, макар картинките
// да са качени. Скриптът:
//   1. засява ВСИЧКИ seed-ове във временна база на същия сървър;
//   2. сравнява по slug с истинската база;
//   3. само с --apply СЪЗДАВА липсващите. Съществуващите не се пипат — нито
//      текстът, нито броячът на прегледи, нито редакциите от админ панела.
// Временната база се трие накрая (и при грешка).
//   npm run db:sync:guides              # само показва какво липсва
//   npm run db:sync:guides -- --apply   # създава липсващите

const APPLY = process.argv.includes("--apply");
const TMP_DB = "zbd_seedtmp";

function tmpUrl(mainUrl: string): string {
  const u = new URL(mainUrl);
  u.pathname = `/${TMP_DB}`;
  return u.toString();
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, label: string): void {
  const r = spawnSync(cmd, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n");
    throw new Error(`${label} не успя (код ${r.status ?? "?"}):\n${out}`);
  }
}

async function dropTmp(): Promise<void> {
  // WITH (FORCE) затваря и забравени връзки от seed-овете (PostgreSQL ≥ 13).
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`);
}

async function main() {
  const mainUrl = process.env.DATABASE_URL;
  if (!mainUrl) throw new Error("Липсва DATABASE_URL.");
  const url = tmpUrl(mainUrl);
  // Временната база има свой администратор; паролата е случайна и умира с базата.
  const env = { ...process.env, DATABASE_URL: url, ADMIN_PASSWORD: randomBytes(24).toString("base64url") };

  await dropTmp();
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${TMP_DB}"`);
  const src = new PrismaClient({ datasources: { db: { url } } });
  try {
    console.log("→ Временна база: миграции…");
    run("npx", ["prisma", "migrate", "deploy"], env, "prisma migrate deploy");
    console.log("→ Временна база: всички seed-ове (минута-две)…");
    run("npm", ["run", "-s", "db:seed:all"], env, "db:seed:all");

    const all = await src.faq.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] });
    const have = new Set((await prisma.faq.findMany({ select: { slug: true } })).map((r) => r.slug));
    const missing = all.filter((r) => !have.has(r.slug));

    console.log(`\nРъководства: в seed-овете ${all.length}, в базата ${have.size}, липсват ${missing.length}.`);
    const byCat = new Map<string, number>();
    for (const r of missing) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    for (const [cat, n] of byCat) console.log(`  ${cat}: ${n}`);
    for (const r of missing.slice(0, 40)) console.log(`  · ${r.slug} — ${r.question}`);
    if (missing.length > 40) console.log(`  … и още ${missing.length - 40}`);

    if (missing.length === 0) {
      console.log("✔ Нищо не липсва.");
    } else if (!APPLY) {
      console.log("\nНищо не е записано. За да ги създадете:  npm run db:sync:guides -- --apply");
    } else {
      const data = missing.map((r) => ({
        slug: r.slug,
        question: r.question,
        answer: r.answer,
        category: r.category,
        tags: r.tags,
        steps: r.steps,
        relatedLinks: r.relatedLinks,
        seoTitle: r.seoTitle,
        seoDescription: r.seoDescription,
        order: r.order,
        reviewedAt: r.reviewedAt,
        localNote: r.localNote,
        published: r.published,
      }));
      const res = await prisma.faq.createMany({ data, skipDuplicates: true });
      console.log(`✔ Създадени ръководства: ${res.count}`);
    }
  } finally {
    await src.$disconnect();
    await dropTmp();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
