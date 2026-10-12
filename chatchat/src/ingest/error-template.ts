import { z } from 'zod';
import { canonicalIdentifier } from '../domain/normalize.js';
import { ACTION_CLASSES, type ActionClass } from '../domain/response.js';
import { compareVersions, isVersion } from '../domain/versions.js';
import type { SheetTable } from './xlsx.js';
import { INGEST_LIMITS, type ExtractedPage, type IngestWarning } from './types.js';

/**
 * Структуриран импорт на кодове за грешка от XLSX шаблон (§7.1 „Errori → DB strutturato“, FR-04):
 * листът, чийто заглавен ред има колони код + заглавие + описание + тежест (IT/EN/BG имена), става
 * списък от ЧЕРНОВИ кодове — те минават през нормалния преглед (submit → publish, четири очи за
 * безопасност). Тук е само разборът и проверката на редовете (без база): продуктът и източникът се
 * проверяват при записа (ingest/finalize.ts). Невалиден ред → предупреждение с номера му, не провал.
 * Връзките (симптоми/причини/проверки/поправки) са по ред в клетката; „[SAFETY_RELEVANT] текст“
 * задава класа изрично, иначе: проверка → DIAGNOSTIC, поправка → CONFIGURATIVE, другите → INFORMATIVE
 * (Safety Gate така или иначе взима по-строгия клас с речника).
 */

type Column =
  | 'code'
  | 'model'
  | 'title'
  | 'description'
  | 'severity'
  | 'subsystem'
  | 'safety'
  | 'hw'
  | 'fwMin'
  | 'fwMax'
  | 'page'
  | 'SYMPTOM'
  | 'CAUSE'
  | 'CHECK'
  | 'FIX';

const ALIASES: Record<Column, readonly string[]> = {
  code: ['code', 'error code', 'codice', 'codice errore', 'errore', 'код', 'код на грешка'],
  model: ['model', 'product', 'modello', 'prodotto', 'модел', 'продукт'],
  title: ['title', 'name', 'titolo', 'nome', 'заглавие', 'име'],
  description: ['description', 'descrizione', 'описание'],
  severity: ['severity', 'gravita', 'severita', 'тежест'],
  subsystem: ['subsystem', 'sottosistema', 'подсистема'],
  safety: ['safety', 'safety relevant', 'sicurezza', 'безопасност'],
  hw: ['hw', 'hw revision', 'hardware', 'revisione hw', 'хардуер', 'hw ревизия'],
  fwMin: ['fw min', 'firmware min', 'fw da', 'фърмуер от'],
  fwMax: ['fw max', 'firmware max', 'fw a', 'фърмуер до'],
  page: ['page', 'pagina', 'страница'],
  SYMPTOM: ['symptoms', 'sintomi', 'симптоми'],
  CAUSE: ['causes', 'cause', 'причини'],
  CHECK: ['checks', 'controlli', 'verifiche', 'проверки'],
  FIX: ['fixes', 'soluzioni', 'rimedi', 'поправки', 'решения'],
};

/** Име на колона за сравнение: малки букви, без диакритика и пунктуация. */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const LOOKUP = new Map<string, Column>(
  (Object.entries(ALIASES) as Array<[Column, readonly string[]]>).flatMap(([col, names]) =>
    names.map((n) => [normalizeHeader(n), col] as const),
  ),
);

const SEVERITY: Record<string, 'INFO' | 'WARNING' | 'FAULT' | 'CRITICAL'> = {
  info: 'INFO',
  informazione: 'INFO',
  информация: 'INFO',
  warning: 'WARNING',
  avviso: 'WARNING',
  attenzione: 'WARNING',
  предупреждение: 'WARNING',
  fault: 'FAULT',
  guasto: 'FAULT',
  повреда: 'FAULT',
  critical: 'CRITICAL',
  critico: 'CRITICAL',
  критична: 'CRITICAL',
  критично: 'CRITICAL',
};

const YES = new Set(['yes', 'y', 'true', '1', 'x', 'si', 'да']);

const version = z.string().trim().max(20).refine(isVersion);

export const TemplateRowSchema = z
  .object({
    row: z.number().int().min(1),
    sheetPage: z.number().int().min(1),
    productModel: z.string().trim().min(1).max(80).optional(),
    code: z.string().trim().min(1).max(20),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().min(2).max(4000),
    severity: z.enum(['INFO', 'WARNING', 'FAULT', 'CRITICAL']),
    subsystem: z.string().trim().max(60).optional(),
    safetyRelevant: z.boolean(),
    hwRevision: z.string().trim().max(20).optional(),
    fwMin: version.optional(),
    fwMax: version.optional(),
    sourcePage: z.number().int().min(1).max(100000).optional(),
    relations: z
      .array(
        z.object({
          kind: z.enum(['SYMPTOM', 'CAUSE', 'CHECK', 'FIX']),
          text: z.string().trim().min(2).max(1000),
          actionClass: z.enum(ACTION_CLASSES),
        }),
      )
      .max(40),
  })
  .refine((r) => !r.fwMin || !r.fwMax || compareVersions(r.fwMin, r.fwMax) <= 0);
export type TemplateRow = z.infer<typeof TemplateRowSchema>;

const DEFAULT_CLASS: Record<'SYMPTOM' | 'CAUSE' | 'CHECK' | 'FIX', ActionClass> = {
  SYMPTOM: 'INFORMATIVE',
  CAUSE: 'INFORMATIVE',
  CHECK: 'DIAGNOSTIC',
  FIX: 'CONFIGURATIVE',
};

function relationsOf(kind: keyof typeof DEFAULT_CLASS, cell: string | undefined) {
  return (cell ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*\d.)]+/, '').trim())
    .filter((l) => l !== '')
    .map((l) => {
      const m = /^\[([A-Z_]+)\]\s*(.*)$/.exec(l);
      const explicit = m && (ACTION_CLASSES as readonly string[]).includes(m[1] ?? '');
      return {
        kind,
        text: explicit ? (m?.[2] ?? '') : l,
        actionClass: explicit ? (m?.[1] as ActionClass) : DEFAULT_CLASS[kind],
      };
    });
}

/** Колоните на заглавния ред, ако листът е шаблон (код + заглавие + описание + тежест). */
function templateColumns(header: readonly string[]): Map<Column, number> | null {
  const cols = new Map<Column, number>();
  header.forEach((h, i) => {
    const col = LOOKUP.get(normalizeHeader(h));
    if (col && !cols.has(col)) cols.set(col, i);
  });
  return ['code', 'title', 'description', 'severity'].every((c) => cols.has(c as Column))
    ? cols
    : null;
}

export interface TemplateResult {
  sheet: string;
  rows: TemplateRow[];
  warnings: IngestWarning[];
}

/** Първият лист-шаблон (видим или скрит) → валидните редове + предупреждения за невалидните. */
export function findErrorTemplate(
  sheets: readonly SheetTable[],
  pages: readonly ExtractedPage[],
): TemplateResult | null {
  for (const sheet of sheets) {
    const [header, ...body] = sheet.rows;
    const cols = header ? templateColumns(header.cells) : null;
    if (!cols) continue;
    const sheetPage = pages.find((p) => p.section === sheet.name.slice(0, 200))?.page ?? 1;
    const rows: TemplateRow[] = [];
    const warnings: IngestWarning[] = [];
    for (const r of body.slice(0, INGEST_LIMITS.maxErrorRows)) {
      const get = (c: Column) => {
        const i = cols.get(c);
        const v = i === undefined ? '' : (r.cells[i] ?? '').trim();
        return v === '' ? undefined : v;
      };
      const severity = SEVERITY[normalizeHeader(get('severity') ?? '')] ?? get('severity');
      const page = Number(get('page'));
      const candidate = {
        row: r.index,
        sheetPage,
        productModel: get('model'),
        code: canonicalIdentifier(get('code') ?? ''),
        title: get('title'),
        description: get('description'),
        severity: typeof severity === 'string' ? severity.toUpperCase() : severity,
        subsystem: get('subsystem'),
        safetyRelevant: YES.has(normalizeHeader(get('safety') ?? '')),
        hwRevision: get('hw'),
        fwMin: get('fwMin'),
        fwMax: get('fwMax'),
        sourcePage: Number.isInteger(page) && page > 0 ? page : undefined,
        relations: (['SYMPTOM', 'CAUSE', 'CHECK', 'FIX'] as const).flatMap((k) =>
          relationsOf(k, get(k)),
        ),
      };
      const parsed = TemplateRowSchema.safeParse(candidate);
      if (parsed.success) rows.push(parsed.data);
      else warnings.push({ code: 'ingest.warn.errorRowInvalid', row: r.index });
    }
    if (body.length > INGEST_LIMITS.maxErrorRows) {
      warnings.push({
        code: 'ingest.warn.errorRowsTruncated',
        count: body.length - INGEST_LIMITS.maxErrorRows,
      });
    }
    return { sheet: sheet.name, rows, warnings };
  }
  return null;
}
