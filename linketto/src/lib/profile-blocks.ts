import 'server-only';
import type { BlockKind } from '@prisma/client';
import { prisma } from '@/lib/db';

/** Има ли профилът активен блок от този вид (формите приемат данни само тогава). */
export async function profileHasActiveBlock(
  profileId: string,
  kind: BlockKind,
): Promise<boolean> {
  return (
    (await prisma.link.count({ where: { profileId, kind, active: true } })) > 0
  );
}
