import type { Prisma } from '@prisma/client';
import { validityAt } from '../domain/versions.js';
import { parseRuleOptions } from '../store/scope.js';
import { fourEyesBlocked } from './kb-lifecycle.js';

/**
 * Как административната конзола вижда документ (списък, детайл, сравнение): метаданните §7.2,
 * валидността към момента, приложимостта с таблото (по сериен номер) и дали ТОЗИ човек може да
 * го публикува (четири очи) — UI го казва предварително, сървърът проверява наново.
 */

export const documentAdminInclude = {
  applicability: {
    include: {
      product: { select: { model: true } },
      device: { select: { serial: true } },
    },
    orderBy: { id: 'asc' },
  },
  _count: { select: { chunks: true } },
} satisfies Prisma.DocumentInclude;

export type AdminDocument = Prisma.DocumentGetPayload<{ include: typeof documentAdminInclude }>;

export function applicabilityView(a: AdminDocument['applicability'][number]) {
  return {
    productModel: a.product.model,
    hwRevision: a.hwRevision,
    fwMin: a.fwMin,
    fwMax: a.fwMax,
    allFirmware: a.allFirmware,
    deviceSerial: a.device?.serial ?? null,
    // FR-01: само за конфигурация с тези опции ({} = всички); неразчетено → null.
    options: parseRuleOptions(a.options),
  };
}

export function documentView(d: AdminDocument, me: string, now = new Date()) {
  return {
    id: d.id,
    code: d.code,
    title: d.title,
    type: d.type,
    language: d.language,
    revision: d.revision,
    status: d.status,
    audience: d.audience,
    safetyRelevant: d.safetyRelevant,
    subsystem: d.subsystem,
    sourceFilename: d.sourceFilename,
    checksum: d.checksum,
    chunks: d._count.chunks,
    supersedesId: d.supersedesId,
    effectiveFrom: d.effectiveFrom,
    effectiveTo: d.effectiveTo,
    validity: validityAt(d, now),
    // Четирите очи: качилият/пратилият за преглед не публикува документ по безопасност.
    uploadedByMe: d.uploadedById === me,
    fourEyesBlocked: d.safetyRelevant && fourEyesBlocked(me, [d.uploadedById, d.submittedById]),
    boardSpecific: d.applicability.some((a) => a.deviceId !== null),
    applicability: d.applicability.map(applicabilityView),
    publishedAt: d.publishedAt,
    approvedAt: d.approvedAt,
    deprecatedAt: d.deprecatedAt,
    createdAt: d.createdAt,
  };
}
