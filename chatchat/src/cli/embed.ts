import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { embeddingModelFrom } from '../ai/embeddings.js';
import { EU_REGION } from '../config.js';
import { embedPending } from '../store/embeddings.js';

/**
 * Векторите за семантичното търсене на всички ПУБЛИКУВАНИ парчета без вектор (или с вектор от
 * друг модел) — след първото включване, смяна на EMBEDDING_MODEL или прекъснат фонов прогон:
 *   npm run embed [-- --tenant <tenantId>]
 * DRAFT/REVIEW/DEPRECATED никога не се изпращат към модела. Изход ≠ 0 при грешка.
 */

const Env = z.object({
  VERTEX_PROJECT_ID: z.string().min(1, 'Липсва VERTEX_PROJECT_ID'),
  VERTEX_REGION: z
    .string()
    .default('eu')
    .refine((r) => EU_REGION.test(r), 'VERTEX_REGION трябва да е ЕС регион („eu“ или „europe-…“)'),
  EMBEDDING_MODEL: z.enum(['gemini-embedding-001', 'off']).default('gemini-embedding-001'),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(15000),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  const embedder = embeddingModelFrom(env);
  if (!embedder) {
    console.error('EMBEDDING_MODEL=off — няма какво да се индексира.');
    process.exitCode = 1;
    return;
  }
  const at = process.argv.indexOf('--tenant');
  const tenantId = at >= 0 ? process.argv[at + 1] : undefined;
  const db = new PrismaClient();
  try {
    const result = await embedPending(db, embedder, tenantId ? { tenantId } : {});
    console.log(
      JSON.stringify({
        model: embedder.id,
        embedded: result.embedded,
        remaining: result.remaining,
      }),
    );
    if (result.remaining) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  if (err instanceof z.ZodError) {
    console.error(
      `embed: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    process.exitCode = 1;
    return;
  }
  // Без съдържание и без тайни: само вида и статуса.
  const status = (err as { status?: unknown }).status;
  console.error(`embed: ${(err as Error).name}${typeof status === 'number' ? ` ${status}` : ''}`);
  process.exitCode = 1;
});
