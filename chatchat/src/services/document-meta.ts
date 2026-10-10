import { z } from 'zod';
import { compareVersions, isVersion } from '../domain/versions.js';

/**
 * Задължителните метаданни на документ (§7.2, §4.1): продукт (правило за приложимост), ревизия,
 * фърмуер — ИЗРИЧЕН обхват или изрично „всички версии“ (никога мълчалив null), език, тип, статус
 * (DRAFT при приемане), дата на валидност (effectiveFrom задължителна, effectiveTo по избор). По
 * избор правилото е за КОНКРЕТНО табло (сериен номер) — уникалната схема на таблото.
 */

const version = z.string().trim().max(20).refine(isVersion, 'версия като 4.2.1');

export const ApplicabilityInputSchema = z
  .object({
    productModel: z.string().trim().min(1).max(80),
    hwRevision: z.string().trim().max(20).optional(),
    fwMin: version.optional(),
    fwMax: version.optional(),
    /** Изрично „всички версии на фърмуера“ — тогава без fwMin/fwMax. */
    allFirmware: z.boolean().optional(),
    /** Само за това табло (сериен номер в клиента; моделът трябва да е неговият). */
    deviceSerial: z.string().trim().min(1).max(80).optional(),
  })
  .refine((a) => (a.allFirmware === true) !== (a.fwMin !== undefined || a.fwMax !== undefined), {
    path: ['allFirmware'],
    message: 'фърмуер: изричен обхват (fwMin/fwMax) или allFirmware: true',
  })
  .refine(
    (a) =>
      !a.fwMin ||
      !a.fwMax ||
      !isVersion(a.fwMin) ||
      !isVersion(a.fwMax) ||
      compareVersions(a.fwMin, a.fwMax) <= 0,
    {
      path: ['fwMax'],
      message: 'fwMax е преди fwMin',
    },
  );
export type ApplicabilityInput = z.infer<typeof ApplicabilityInputSchema>;

export const DocumentMetaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/),
  title: z.string().trim().min(2).max(200),
  type: z.enum([
    'MANUAL',
    'SCHEMATIC',
    'ERROR_LIST',
    'FAQ',
    'BULLETIN',
    'PROCEDURE',
    'SOLVED_CASE',
  ]),
  language: z.string().regex(/^[a-z]{2}$/),
  revision: z.string().trim().min(1).max(20),
  audience: z.enum(['PORTAL', 'INTERNAL', 'ENGINEERING']),
  safetyRelevant: z.boolean(),
  subsystem: z.string().trim().max(60).optional(),
  sourceFilename: z.string().trim().min(1).max(255),
  /** От кога документът важи (§7.2) — задължително. */
  effectiveFrom: z.coerce.date(),
  /** До кога важи (включително) — по избор; след него документът е неприложим, но се пази. */
  effectiveTo: z.coerce.date().optional(),
  /**
   * Предишната ревизия на същия код, която тази заменя — само проследяване (§4.1). Старата НЕ се
   * отписва автоматично: само изрично при публикуване („заменя старата за всички табла“).
   */
  supersedesRevision: z.string().trim().min(1).max(20).optional(),
  applicability: z.array(ApplicabilityInputSchema).min(1).max(50),
});

export const PagesSchema = z
  .array(
    z.object({
      page: z.number().int().min(1).max(100000),
      section: z.string().trim().max(200).optional(),
      text: z.string().max(40000),
    }),
  )
  .min(1)
  .max(3000);

/** effectiveTo, ако го има, е СЛЕД effectiveFrom (празен прозорец на валидност няма смисъл). */
export function effectiveRangeOk(d: { effectiveFrom: Date; effectiveTo?: Date | null }): boolean {
  return !d.effectiveTo || d.effectiveTo.getTime() > d.effectiveFrom.getTime();
}

/** Без проверките между полетата (за `.omit/.extend` във фикстурите) — те са в ingestDocument. */
export const DocumentInputSchema = DocumentMetaSchema.extend({ pages: PagesSchema });
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

/**
 * Заявката на POST /admin/documents: точно едно от двете — `pages` (тогава и `sourceFilename`)
 * или `sourceAttachmentId` (CLEAN PDF на същия клиент; името идва от файла).
 */
export const DocumentRequestSchema = DocumentMetaSchema.extend({
  sourceFilename: z.string().trim().min(1).max(255).optional(),
  pages: PagesSchema.optional(),
  sourceAttachmentId: z.string().min(1).max(40).optional(),
})
  .refine((d) => (d.pages === undefined) !== (d.sourceAttachmentId === undefined), {
    path: ['pages'],
    message: 'или pages, или sourceAttachmentId',
  })
  .refine((d) => d.pages === undefined || d.sourceFilename !== undefined, {
    path: ['sourceFilename'],
    message: 'sourceFilename е задължително с pages',
  })
  .refine(effectiveRangeOk, {
    path: ['effectiveTo'],
    message: 'effectiveTo е преди effectiveFrom',
  });
export type DocumentRequest = z.infer<typeof DocumentRequestSchema>;
