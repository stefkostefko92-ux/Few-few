import { calculate, type Calculated } from './calculate.js';
import { InvoiceInputSchema, type InvoiceInput, type Profile } from './model.js';
import {
  DEFAULT_RULE_OPTIONS,
  hasFatal,
  validateDocument,
  type Issue,
  type RuleOptions,
} from './rules.js';
import { toCii } from './cii.js';
import { toUbl } from './ubl.js';

export * from './model.js';
export * from './rules.js';
export { calculate, type Calculated } from './calculate.js';
export { toUbl } from './ubl.js';
export { toCii } from './cii.js';

export type BuildResult =
  | { ok: true; input: InvoiceInput; calc: Calculated; issues: Issue[]; ubl: string; cii: string }
  | { ok: false; issues: Issue[]; calc: Calculated | null };

/**
 * Целият път на ядрото: проверка на входа (zod) → изчисление → правила (EN 16931, профил, ЗДДС) →
 * UBL 2.1 и CII. С фатална грешка XML не се прави — документ, който нарушава стандарта или закона,
 * не се издава.
 */
export interface BuildOptions extends RuleOptions {
  /** Подписът на продукта в бележката на всеки документ (src/brand.ts; сменя се от мастър панела). */
  signature: string | undefined;
}

export function buildEInvoice(raw: unknown, options: Partial<BuildOptions> = {}): BuildResult {
  const parsed = InvoiceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      calc: null,
      issues: parsed.error.issues.map((issue) => ({
        rule: 'INPUT',
        severity: 'fatal',
        path: issue.path.join('.'),
        message: { bg: issue.message, en: issue.message },
      })),
    };
  }
  const input = parsed.data;
  const rules: RuleOptions = { ...DEFAULT_RULE_OPTIONS, ...options };
  const calc = calculate(input);
  const issues = validateDocument(input, calc, rules);
  if (hasFatal(issues)) return { ok: false, issues, calc };
  const profile: Profile = rules.profile;
  return {
    ok: true,
    input,
    calc,
    issues,
    ubl: toUbl(input, calc, profile, options.signature),
    cii: toCii(input, calc, profile, options.signature),
  };
}
