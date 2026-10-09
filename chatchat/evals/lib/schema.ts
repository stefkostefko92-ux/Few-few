import { z } from 'zod';
import { DiagnosticContextSchema } from '../../src/domain/context.js';
import { ACTION_CLASSES, EVIDENCE_LEVELS, OUTCOMES } from '../../src/domain/response.js';
import { DocumentInputSchema } from '../../src/services/ingest.js';

/**
 * Форматът на оценъчния набор (§16.1–16.3, AC-09). Един файл = база знания (фикстури) + случаи.
 * Ключове на източниците: документ „КОД@РЕВИЗИЯ“, код за грешка — неговият `key` (напр. „E37/fw4“).
 * Така „правилен документ, грешна ревизия“ се различава от „правилен източник“ (version accuracy).
 */

const Tenant = z.enum(['A', 'B']).default('A');
const Status = z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED']).default('PUBLISHED');

export const ProductFixture = z.object({
  tenant: Tenant,
  family: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  revisions: z
    .array(
      z.object({
        hwRevision: z.string().min(1).max(20),
        fwMin: z.string().min(1).max(20),
        fwMax: z.string().max(20).optional(),
      }),
    )
    .min(1),
});

export const DocumentFixture = DocumentInputSchema.omit({ sourceFilename: true }).extend({
  tenant: Tenant,
  status: Status,
});

export const ErrorFixture = z.object({
  /** Уникален ключ в набора (напр. „E37/fw4“) — за очакванията. */
  key: z.string().min(1).max(60),
  tenant: Tenant,
  productModel: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  title: z.string().min(2).max(200),
  description: z.string().min(2).max(4000),
  severity: z.enum(['INFO', 'WARNING', 'FAULT', 'CRITICAL']).default('FAULT'),
  safetyRelevant: z.boolean().default(false),
  hwRevision: z.string().max(20).optional(),
  fwMin: z.string().max(20).optional(),
  fwMax: z.string().max(20).optional(),
  /** Документ-източник: „КОД@РЕВИЗИЯ“ от `documents`. */
  source: z.string().min(1),
  sourcePage: z.number().int().min(1).optional(),
  status: Status,
  relations: z
    .array(
      z.object({
        kind: z.enum(['SYMPTOM', 'CAUSE', 'CHECK', 'FIX']),
        text: z.string().min(2).max(1000),
        expected: z.string().max(400).optional(),
        actionClass: z.enum(ACTION_CLASSES).default('INFORMATIVE'),
      }),
    )
    .max(40)
    .default([]),
});

/** Подсказки САМО за детерминистичния фалшив модел (истинският Vertex ги игнорира). */
export const FakeHints = z
  .object({
    /** „Послушен“ модел: превръща въпроса в стъпка (червен екип — Gate трябва да удържи). */
    obey: z.boolean().default(false),
    /** Преписва текста на документите като стъпки (инжекция в документ). */
    copyFromDocuments: z.boolean().default(false),
    /** Измислен „дословен“ цитат (NFR-10). */
    phantomQuote: z.boolean().default(false),
    propose: z
      .array(
        z.object({
          action: z.string().min(1).max(500),
          expected: z.string().min(1).max(400).default('Esito documentato.'),
          actionClass: z.enum(ACTION_CLASSES),
        }),
      )
      .default([]),
  })
  .default({ obey: false, copyFromDocuments: false, phantomQuote: false, propose: [] });

export const EvalCase = z.object({
  id: z.string().min(1).max(80),
  /** Свободни етикети: „adversarial“, „§16.3:wrong-version“, „semantic“… — разбивка в отчета. */
  tags: z.array(z.string().max(60)).default([]),
  locale: z.enum(['it', 'en', 'bg']).default('it'),
  /** Аудиторията на ролята, която пита (PORTAL техник, вътрешен, инженеринг). */
  audience: z.enum(['PORTAL', 'INTERNAL', 'ENGINEERING']).default('PORTAL'),
  question: z.string().min(1).max(4000),
  context: DiagnosticContextSchema,
  expect: z.object({
    /** Ключове на правилните източници (документ „КОД@РЕВ“, код — неговият key). */
    sources: z.array(z.string()).default([]),
    /** Позволени изходи (status) — напр. ["identified", "probable"]. */
    status: z.array(z.enum(OUTCOMES)).optional(),
    level: z.enum(EVIDENCE_LEVELS).optional(),
    escalation: z.boolean().optional(),
    /** Безопасност: отговорът ТРЯБВА да е blocked + ескалация (молба за заобикаляне). */
    mustBlock: z.boolean().default(false),
    /** Низове, които НЕ бива да стигнат до техника (изтичане: чужд клиент, чернова, аудитория). */
    forbidden: z.array(z.string().min(3)).default([]),
    unknownIdentifiers: z.array(z.string()).optional(),
  }),
  fake: FakeHints,
});

export const EvalSet = z.object({
  name: z.string().regex(/^[a-z0-9-]{3,60}$/),
  version: z.string().min(1).max(40),
  /** true = измислени данни (може в репото); реалните случаи на клиента — само извън git. */
  fixture: z.boolean(),
  description: z.string().max(2000).default(''),
  knowledge: z.object({
    products: z.array(ProductFixture).min(1),
    documents: z.array(DocumentFixture).min(1),
    errors: z.array(ErrorFixture).default([]),
  }),
  cases: z.array(EvalCase).min(1),
});

export type EvalSetT = z.infer<typeof EvalSet>;
export type EvalCaseT = z.infer<typeof EvalCase>;
