import type { PrismaClient } from '@prisma/client';
import { canonicalIdentifier } from '../../src/domain/normalize.js';
import { ingestDocument } from '../../src/services/ingest.js';
import type { EvalSetT } from './schema.js';

/**
 * Зарежда базата знания на набора в ТЕСТОВА база: клиенти A/B, продукти, табла, документи (през
 * истинското приемане `ingestDocument` — същото парчене и индекс), кодове за грешка. Статусите
 * се задават директно (оценката не проверява работния поток на публикуването, а отговора).
 */

export interface LoadedKnowledge {
  tenantA: string;
  tenantB: string;
  /** errorId → ключ от набора; документите се разпознават по „КОД@РЕВИЗИЯ“. */
  errorKeys: Map<string, string>;
  /** Таблата на клиент A: сериен номер → { id, модел } (случаят на таблото го ползва). */
  devicesA: Map<string, { id: string; productModel: string }>;
}

export function documentKey(code: string, revision: string): string {
  return `${code}@${revision}`;
}

/** Отказ, ако базата не е тестова — оценката я изчиства (TRUNCATE). */
export function assertTestDatabase(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/test/i.test(name)) {
    throw new Error(`Отказ: базата „${name}“ не е тестова (името трябва да съдържа „test“).`);
  }
}

/** Опасно: изтрива ВСИЧКО в базата — затова само с име, съдържащо „test“ (проверява run.ts). */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Tenant", "AuditEvent", "KnowledgeSnapshot" RESTART IDENTITY CASCADE',
  );
}

export async function loadKnowledge(db: PrismaClient, set: EvalSetT): Promise<LoadedKnowledge> {
  const tenants = {
    A: await db.tenant.create({ data: { slug: `eval-${set.name}-a`, name: 'Eval A (fittizio)' } }),
    B: await db.tenant.create({ data: { slug: `eval-${set.name}-b`, name: 'Eval B (fittizio)' } }),
  };
  const owners = {
    A: await owner(db, tenants.A.id, 'a'),
    B: await owner(db, tenants.B.id, 'b'),
  };

  for (const p of set.knowledge.products) {
    await db.product.create({
      data: {
        tenantId: tenants[p.tenant].id,
        family: p.family,
        model: p.model,
        revisions: {
          create: p.revisions.map((r) => ({
            hwRevision: r.hwRevision,
            fwMin: r.fwMin,
            fwMax: r.fwMax ?? null,
          })),
        },
      },
    });
  }

  const devicesA = new Map<string, { id: string; productModel: string }>();
  for (const d of set.knowledge.devices) {
    const revision = await db.productRevision.findFirst({
      where: {
        hwRevision: d.hwRevision,
        product: { tenantId: tenants[d.tenant].id, model: d.productModel },
      },
    });
    if (!revision) throw new Error(`табло ${d.serial}: непознат ${d.productModel}/${d.hwRevision}`);
    const device = await db.device.create({
      data: {
        tenantId: tenants[d.tenant].id,
        serial: d.serial,
        productRevisionId: revision.id,
        firmware: d.firmware,
      },
    });
    if (d.tenant === 'A') devicesA.set(d.serial, { id: device.id, productModel: d.productModel });
  }

  const documents = new Map<string, string>();
  for (const d of set.knowledge.documents) {
    const { tenant, status, ...input } = d;
    const result = await ingestDocument(db, tenants[tenant].id, owners[tenant], {
      ...input,
      sourceFilename: `${d.code}.pdf`,
    });
    if (!result.ok) {
      throw new Error(`документ ${documentKey(d.code, d.revision)}: ${result.error.code}`);
    }
    const now = new Date();
    await db.document.update({
      where: { id: result.documentId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' || status === 'DEPRECATED' ? now : null,
        deprecatedAt: status === 'DEPRECATED' ? now : null,
      },
    });
    documents.set(`${tenant}:${documentKey(d.code, d.revision)}`, result.documentId);
  }

  const errorKeys = new Map<string, string>();
  for (const e of set.knowledge.errors) {
    const tenantId = tenants[e.tenant].id;
    const product = await db.product.findUnique({
      where: { tenantId_model: { tenantId, model: e.productModel } },
    });
    if (!product) throw new Error(`код ${e.key}: непознат продукт ${e.productModel}`);
    const sourceId = documents.get(`${e.tenant}:${e.source}`);
    if (!sourceId) throw new Error(`код ${e.key}: непознат източник ${e.source}`);
    const code = canonicalIdentifier(e.code);
    const previous = await db.errorCode.count({ where: { productId: product.id, code } });
    const created = await db.errorCode.create({
      data: {
        tenantId,
        productId: product.id,
        code,
        title: e.title,
        description: e.description,
        severity: e.severity,
        safetyRelevant: e.safetyRelevant,
        hwRevision: e.hwRevision ?? null,
        fwMin: e.fwMin ?? null,
        fwMax: e.fwMax ?? null,
        status: e.status,
        version: previous + 1,
        sourceDocumentId: sourceId,
        sourcePage: e.sourcePage ?? null,
        relations: {
          create: e.relations.map((r, i) => ({
            kind: r.kind,
            ordinal: i + 1,
            text: r.text,
            expected: r.expected ?? null,
            actionClass: r.actionClass,
            sourceDocumentId: sourceId,
            sourcePage: e.sourcePage ?? null,
          })),
        },
      },
    });
    errorKeys.set(created.id, e.key);
  }
  return { tenantA: tenants.A.id, tenantB: tenants.B.id, errorKeys, devicesA };
}

async function owner(db: PrismaClient, tenantId: string, suffix: string): Promise<string> {
  const user = await db.user.create({
    data: {
      tenantId,
      role: 'KNOWLEDGE_OWNER',
      kind: 'INTERNAL',
      name: `Eval owner ${suffix}`,
      email: `eval-owner-${suffix}@example.test`,
      // Не е argon2 хеш → с този потребител не може да се влезе.
      passwordHash: 'eval-no-login',
    },
  });
  return user.id;
}
