import {
  calculate,
  InvoiceInputSchema,
  validateDocument,
  DEFAULT_RULE_OPTIONS,
} from '../einvoice/index.js';
import type { Issue, InvoiceInput } from '../einvoice/index.js';
import { cmp, dec, divRound, isDecimalText, toPlain, type Dec } from '../einvoice/decimal.js';
import { parseXml, XmlError } from '../xml/parse.js';
import { NotAnInvoice, type DeclaredTotals, type ReadResult } from './read-common.js';
import { readUbl } from './read-ubl.js';
import { readCii } from './read-cii.js';

/**
 * Входяща е-фактура (SPEC 55): строг XML (без DTD) → UBL 2.1 или CII → модела на EN 16931 → изчисление
 * и правилата на ядрото → сверка на обявените суми с изчислените. Резултатът е справка за получателя:
 * документът се записва и с грешки (той е получен), но те се показват. Срокът за издаване не се
 * проверява — той е задължение на издателя, не на получателя.
 */
export class IncomingError extends Error {
  constructor(readonly code: 'xml' | 'dtd' | 'notInvoice' | 'tooLarge') {
    super(code);
  }
}

export const MAX_INCOMING_BYTES = 2 * 1024 * 1024;

export interface IncomingCheck extends ReadResult {
  /** Входът, ако минава модела; null — разчетен частично (заглавните данни са в `input`). */
  parsed: InvoiceInput | null;
  issues: Issue[];
}

const TOTAL_FIELDS: Array<[keyof DeclaredTotals, string, string]> = [
  ['lineExtension', 'BT-106', 'Сбор на редовете'],
  ['taxExclusive', 'BT-109', 'Сума без ДДС'],
  ['vat', 'BT-110', 'ДДС'],
  ['taxInclusive', 'BT-112', 'Сума с ДДС'],
  ['payable', 'BT-115', 'Сума за плащане'],
];

function issue(rule: string, path: string, bg: string, en: string): Issue {
  return { rule, severity: 'fatal', path, message: { bg, en } };
}

/**
 * Данните по ЗДДС, които EN 16931 не носи структурирано, а българските издатели (и ядрото ни —
 * src/einvoice/notes.ts) пишат в бележката: основанието за нулева ставка и курсът на ЕЦБ. Курсът — и
 * от ДДС в евро (BT-111), ако бележката го няма.
 */
export function recoverBgFields(input: Record<string, unknown>, declared: DeclaredTotals): void {
  const notes = Array.isArray(input['notes']) ? (input['notes'] as unknown[]) : [];
  const lines = notes.flatMap((n) => (typeof n === 'string' ? n.split('\n') : []));
  const lineList = Array.isArray(input['lines'])
    ? (input['lines'] as Array<Record<string, unknown>>)
    : [];
  const hasZ = lineList.some(
    (l) => (l['vat'] as { category?: unknown } | undefined)?.category === 'Z',
  );
  const exemptions = Array.isArray(input['vatExemptions'])
    ? (input['vatExemptions'] as Array<Record<string, unknown>>)
    : [];
  const zeroReason = lines
    .map((line) => /^Основание за нулева ставка:\s*(.+)$/.exec(line.trim())?.[1])
    .find(Boolean);
  if (hasZ && zeroReason && !exemptions.some((e) => e['category'] === 'Z')) {
    input['vatExemptions'] = [...exemptions, { category: 'Z', reason: zeroReason }];
  }
  if (input['currency'] !== 'EUR' && input['eurExchangeRate'] === undefined) {
    const fromNote = lines
      .map((line) => /курса на ЕЦБ\s+(\d+(?:\.\d{1,6})?)\s+[A-Z]{3}\/EUR/.exec(line)?.[1])
      .find(Boolean);
    const vat = declared.vat;
    const vatEur = declared.vatEur;
    const derived =
      vat && vatEur && isDecimalText(vat) && isDecimalText(vatEur) && cmp(dec(vatEur), dec('0')) > 0
        ? toPlain(divRound(dec(vat), dec(vatEur), 6))
        : undefined;
    const rate = fromNote ?? derived;
    if (rate) input['eurExchangeRate'] = rate;
  }
}

/** XML → заглавните данни и входа (още непроверен); хвърля `IncomingError` за счупен файл. */
function readIncoming(xml: string): ReadResult {
  let read: ReadResult;
  try {
    const root = parseXml(xml);
    read = root.name === 'CrossIndustryInvoice' ? readCii(root) : readUbl(root);
  } catch (error) {
    if (error instanceof XmlError) throw new IncomingError(error.code === 'dtd' ? 'dtd' : 'xml');
    if (error instanceof NotAnInvoice) throw new IncomingError('notInvoice');
    throw error;
  }
  recoverBgFields(read.input, read.declared);
  return read;
}

/**
 * Само входът по модела, без изчисление и правила — за дневника, където проверката вече е записана при
 * получаването (`valid`, `issues`). null — файлът не се разчита по модела.
 */
export function parseIncoming(xml: string): InvoiceInput | null {
  try {
    const parsed = InvoiceInputSchema.safeParse(readIncoming(xml).input);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof IncomingError) return null;
    throw error;
  }
}

/** `limit` — таванът на качения файл; копието от шкафчето (наш, вече проверен XML) минава без него. */
export function checkIncoming(xml: string, limit = MAX_INCOMING_BYTES): IncomingCheck {
  if (Buffer.byteLength(xml, 'utf8') > limit) throw new IncomingError('tooLarge');
  const read = readIncoming(xml);
  const parsed = InvoiceInputSchema.safeParse(read.input);
  if (!parsed.success) {
    return {
      ...read,
      parsed: null,
      issues: parsed.error.issues.map((i) =>
        issue('INPUT', i.path.join('.'), i.message, i.message),
      ),
    };
  }
  const input = parsed.data;
  const calc = calculate(input);
  const issues = validateDocument(input, calc, {
    ...DEFAULT_RULE_OPTIONS,
    issueDeadlineDays: Number.MAX_SAFE_INTEGER,
  });
  const computed: Record<string, Dec> = {
    lineExtension: calc.totals.lineExtension,
    taxExclusive: calc.totals.taxExclusive,
    vat: calc.totals.vat,
    taxInclusive: calc.totals.taxInclusive,
    payable: calc.totals.payable,
  };
  for (const [field, term, label] of TOTAL_FIELDS) {
    const declared = read.declared[field];
    const mine = computed[field]!;
    if (declared === undefined) continue;
    if (!isDecimalText(declared) || cmp(dec(declared), mine) !== 0) {
      issues.push(
        issue(
          'TOTALS',
          term,
          `${label} (${term}): във файла ${declared}, по редовете ${toPlain(mine)}.`,
          `${term}: ${declared} in the file, ${toPlain(mine)} from the lines.`,
        ),
      );
    }
  }
  return { ...read, parsed: input, issues };
}
