import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Метриките от §16.1, които искат експертна истина (кой източник е верният, коя ревизия важи,
 * трябваше ли ескалация), не се смятат от производствените данни — само от последния отчет на
 * оценъчния набор (`npm run eval` → `evals/reports/*.json`, формат `evals/lib/report.ts`).
 * Отчетът е на инсталацията (версия на промпта + правилата), не на клиента; връщаме само
 * агрегатите и описанието на набора — никога случаите, въпросите или етикетите от него.
 */

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

const Ratio = z.object({
  value: z.number().nullable(),
  num: z.number().int().nonnegative(),
  den: z.number().int().nonnegative(),
});

const ReportSchema = z.object({
  set: z.object({ name: z.string().max(200), version: z.string().max(80), fixture: z.boolean() }),
  promptVersion: z.string().max(200),
  diagnosisModel: z.string().max(200),
  startedAt: z.iso.datetime(),
  metrics: z.object({
    cases: z.number().int().nonnegative(),
    retrievalHitRate: Ratio,
    citationPrecision: Ratio,
    versionAccuracy: Ratio,
    escalationPrecision: Ratio,
    safetyViolationRate: Ratio,
  }),
});

export type EvalRatio = z.infer<typeof Ratio>;

export interface EvalSummary {
  set: { name: string; version: string; fixture: boolean };
  promptVersion: string;
  diagnosisModel: string;
  /** Детерминистичният фалшив модел: мери Safety Gate, НЕ качеството на отговорите. */
  fakeModel: boolean;
  startedAt: string;
  cases: number;
  retrievalHitRate: EvalRatio;
  citationPrecision: EvalRatio;
  versionAccuracy: EvalRatio;
  escalationPrecision: EvalRatio;
  safetyViolationRate: EvalRatio;
}

/**
 * Последният валиден отчет (по `startedAt`) от най-новите файлове в папката. Без папка, без отчет
 * или с повреден файл → null („изисква оценка“) — никога измислена стойност.
 */
export async function latestEvalReport(dir: string): Promise<EvalSummary | null> {
  if (!dir) return null;
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
  } catch {
    return null;
  }
  const files = await Promise.all(
    names.map(async (n) => {
      const path = join(dir, n);
      try {
        const st = await stat(path);
        return st.isFile() && st.size <= MAX_BYTES ? { path, mtime: st.mtimeMs } : null;
      } catch {
        return null;
      }
    }),
  );
  const newest = files
    .filter((f): f is { path: string; mtime: number } => f !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_FILES);
  let best: z.infer<typeof ReportSchema> | null = null;
  for (const f of newest) {
    try {
      const parsed = ReportSchema.safeParse(JSON.parse(await readFile(f.path, 'utf8')));
      if (parsed.success && (!best || parsed.data.startedAt > best.startedAt)) best = parsed.data;
    } catch {
      // повреден/непрочетим файл — прескачаме го
    }
  }
  if (!best) return null;
  const m = best.metrics;
  return {
    set: best.set,
    promptVersion: best.promptVersion,
    diagnosisModel: best.diagnosisModel,
    fakeModel: best.diagnosisModel.startsWith('fake'),
    startedAt: best.startedAt,
    cases: m.cases,
    retrievalHitRate: m.retrievalHitRate,
    citationPrecision: m.citationPrecision,
    versionAccuracy: m.versionAccuracy,
    escalationPrecision: m.escalationPrecision,
    safetyViolationRate: m.safetyViolationRate,
  };
}
