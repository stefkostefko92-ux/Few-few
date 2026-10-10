import { z } from 'zod';

/**
 * Договорът на диагностичния отговор (§10.2, §14.3) в две стъпки:
 *  1. `ModelDiagnosisSchema` — каквото моделът ПРЕДЛАГА (през инструмента submit_diagnosis).
 *     Цитира само с референции от доказателствения пакет (E1, E2…) — не може да измисли документ.
 *  2. `DiagnosticAnswerSchema` — каквото стига до техника СЛЕД проверката на цитатите и Safety Gate.
 */

export const ACTION_CLASSES = [
  'INFORMATIVE',
  'DIAGNOSTIC',
  'CONFIGURATIVE',
  'SAFETY_RELEVANT',
  'DIRECT_COMMAND',
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

/** По-строгият от двата класа (редът в ACTION_CLASSES е по риск). */
export function stricterClass(a: ActionClass, b: ActionClass): ActionClass {
  return ACTION_CLASSES.indexOf(a) >= ACTION_CLASSES.indexOf(b) ? a : b;
}

export const OUTCOMES = ['identified', 'probable', 'undetermined'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export function lowerConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE.indexOf(a) >= CONFIDENCE.indexOf(b) ? a : b;
}

const ref = z.string().regex(/^E\d{1,3}$/, 'референция E1…E999');
const text = (max: number) => z.string().trim().min(1).max(max);

export const ModelDiagnosisSchema = z.object({
  status: z.enum(OUTCOMES),
  confidence: z.enum(CONFIDENCE),
  confidenceReason: text(400),
  summary: text(1200),
  causes: z.array(z.object({ text: text(400), evidenceRefs: z.array(ref).max(10) })).max(8),
  checks: z
    .array(
      z.object({
        step: z.number().int().min(1).max(50),
        action: text(500),
        expected: text(400),
        actionClass: z.enum(ACTION_CLASSES),
        evidenceRefs: z.array(ref).max(10),
      }),
    )
    .max(20),
  decisionPoints: z.array(z.object({ condition: text(300), then: text(300) })).max(10),
  /** Дословни откъси, на които се опира отговорът — проверяват се срещу пакета. */
  evidenceUsed: z.array(z.object({ ref, quote: text(600) })).max(20),
  conflicts: z
    .array(z.object({ description: text(400), refs: z.array(ref).min(2).max(10) }))
    .max(5),
  safetyNotes: z.array(text(400)).max(10),
  missingData: z.array(text(200)).max(10),
  escalation: z.object({ recommended: z.boolean(), reason: z.string().max(400).default('') }),
});
export type ModelDiagnosis = z.infer<typeof ModelDiagnosisSchema>;

export const EVIDENCE_LEVELS = ['strong', 'high', 'weak', 'conflict', 'none'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const SAFETY_LEVELS = ['standard', 'caution', 'blocked'] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const CitationSchema = z.object({
  ref,
  kind: z.enum(['document', 'error']),
  documentId: z.string(),
  documentCode: z.string(),
  documentTitle: z.string(),
  revision: z.string(),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  quote: z.string(),
  chunkId: z.string().nullable(),
  errorId: z.string().nullable(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const DiagnosticAnswerSchema = z.object({
  /** Прозрачност по чл. 50 от AI Act: отговорът е от AI система. */
  generatedBy: z.literal('ai'),
  status: z.enum(OUTCOMES),
  confidence: z.enum(CONFIDENCE),
  confidenceReason: z.string(),
  summary: z.string(),
  causes: z.array(z.object({ text: z.string(), evidenceRefs: z.array(ref) })),
  checks: z.array(
    z.object({
      step: z.number().int(),
      action: z.string(),
      expected: z.string(),
      actionClass: z.enum(ACTION_CLASSES),
      evidenceRefs: z.array(ref),
      /** Human-in-the-loop (§11.2): стъпката иска изрично потвърждение преди изпълнение. */
      requiresConfirmation: z.boolean(),
    }),
  ),
  decisionPoints: z.array(z.object({ condition: z.string(), then: z.string() })),
  evidence: z.array(CitationSchema),
  conflicts: z.array(z.object({ description: z.string(), refs: z.array(ref) })),
  safety: z.object({ level: z.enum(SAFETY_LEVELS), notes: z.array(z.string()) }),
  missingData: z.array(z.string()),
  escalation: z.object({
    recommended: z.boolean(),
    reason: z.string(),
    /** Какво да се събере преди тикета (§10.2 „Escalation“). */
    collect: z.array(z.string()),
  }),
  /** Какво е направил Safety Gate — показва се на техника и влиза в одита. */
  gate: z.object({
    evidenceLevel: z.enum(EVIDENCE_LEVELS),
    removedSteps: z.array(z.object({ step: z.number().int(), reason: z.string() })),
    droppedCitations: z.array(z.object({ ref: z.string(), reason: z.string() })),
    decisions: z.array(z.string()),
  }),
  knowledgeSnapshotId: z.string(),
  promptVersion: z.string(),
});
export type DiagnosticAnswer = z.infer<typeof DiagnosticAnswerSchema>;
