import type { PrismaClient } from '@prisma/client';
import { canonicalJson } from '../audit.js';
import { sha256 } from '../crypto.js';

/**
 * Версия на знанието (§13.3): кои документи (ревизия + checksum) и кои версии на кодовете за
 * грешка са били публикувани в момента на отговора. Идентификаторът е хеш на подредения
 * манифест — същото знание дава същия идентификатор, затова записът е веднъж (upsert).
 * Така случай може да се възпроизведе и след нови публикации.
 */
export async function knowledgeSnapshotId(db: PrismaClient, tenantId: string): Promise<string> {
  const [documents, errors] = await Promise.all([
    db.document.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      select: { id: true, code: true, revision: true, checksum: true },
      orderBy: { id: 'asc' },
    }),
    db.errorCode.findMany({
      where: { tenantId, status: 'PUBLISHED' },
      select: { id: true, code: true, version: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const manifest = { documents, errors };
  const id = `ks_${sha256(canonicalJson(manifest)).slice(0, 32)}`;
  await db.knowledgeSnapshot.upsert({
    where: { id },
    create: { id, tenantId, manifest },
    update: {},
  });
  return id;
}
