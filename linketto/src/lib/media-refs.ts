// Колко профила сочат НАШ качен файл (без server-only — тества се срещу реален Postgres).
// Точно равенство на полетата avatarUrl/bgImageUrl в Profile.style — не подниз: чужд стил с
// https адрес, който съдържа името, не бива да задържа файла (Кодаджията, Н4).
import type { PrismaClient } from '@prisma/client';
import { mediaFileName } from '@/lib/image-process';

export async function mediaReferences(db: Pick<PrismaClient, '$queryRaw'>, url: string | null | undefined): Promise<number | null> {
  const name = mediaFileName(url);
  if (!name) return null;
  const own = `/media/${name}`;
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "Profile"
    WHERE "style"->>'avatarUrl' = ${own} OR "style"->>'bgImageUrl' = ${own}`;
  return Number(rows[0]?.n ?? 0);
}
