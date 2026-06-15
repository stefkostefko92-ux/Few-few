import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Споделена помощна логика за seed файловете с ръководства.
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* няма .env */
  }
}

export const prisma = new PrismaClient();

export type Guide = {
  slug: string;
  question: string;
  category: string;
  answer: string;
  steps?: string[];
  tags?: string;
  order: number;
};

export async function seedGuides(guides: Guide[], label: string): Promise<void> {
  for (const g of guides) {
    const data = {
      slug: g.slug,
      question: g.question,
      category: g.category,
      answer: g.answer,
      steps: (g.steps ?? []).join("\n"),
      tags: g.tags ?? "",
      order: g.order,
      published: true,
    };
    await prisma.faq.upsert({ where: { slug: g.slug }, update: data, create: data });
  }
  console.log(`✔ ${label}: ${guides.length}`);
  await prisma.$disconnect();
  console.log("Готово.");
}
