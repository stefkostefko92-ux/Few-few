import 'server-only';
// The checks behind a saved record's result, for the pill that shows it (VerdictChecks): the record of the company read
// as its counts were made (src/lib/verdict-checks.ts) and written in the reader's language — the names the pages give
// the checks, the value and the limit with their unit and sense. Read only; a record of another company, or none, is
// null, the same answer.
import { getMessages, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { asCalcDict } from '@/components/calc/dict';
import { INTL_LOCALE, type Locale } from '@/i18n/locales';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { prisma } from '@/lib/db';
import { liftRecord } from '@/lib/lift-record';
import type { Collaudo } from '@/lib/lift/collaudo';
import { textsFor, type ShownMachine } from '@/lib/present/texts';
import { makeFmt, makePres } from '@/lib/present/tr';
import { deriveRoom, roomCheckKey, type RoomDerived } from '@/lib/room/derive';
import { surveySchema } from '@/lib/room/survey';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import {
  agrees, calcList, isCalcCheckId, isShaftCheckId, liftListDerived, liftListStored, roomList, shaftList, type CheckList, type ListedCheck, type VerdictDetail, type VerdictKind, type VerdictRow,
} from '@/lib/verdict-checks';
import { isUpperLimit, layout, mergeChecks, shaftSnapshot, shownValue } from '@/shaft';
import type { ShaftCheck } from '@/shaft/types';
import { storedCollaudo } from './records';

const COUNTS = { failCount: true, warnCount: true } as const;

/** The machine of a stored calculation (results.inputs.N) as far as a check's value and limit need it. */
const storedMachine = z.object({ inputs: z.object({ N: z.object({ n: z.number(), d: z.number(), groove: z.object({ type: z.enum(['U', 'UU', 'VH', 'VN']), beta: z.number(), gamma: z.number() }) }) }) });
const machineOf = (results: unknown): ShownMachine | null => { const p = storedMachine.safeParse(results); return p.success ? p.data.inputs.N : null; };

/** A calculation's values read back and the standards of its acceptance test stored with it; null when unreadable. */
function collaudoOf(inputs: unknown, raw: unknown): Collaudo | null {
  const v = formValuesSchema.safeParse(inputs);
  return v.success ? storedCollaudo(v.data, raw) : null;
}

/** The running engines' derivation of an old record may meet inputs they no longer take: then nothing is taken from it. */
function attempt<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

interface Listed {
  list: CheckList;
  counts: { failCount: number; warnCount: number };
  machine: ShownMachine | null;
  /** the label key of a shaft check (messages shaft): the machine room names two of them by what it surveyed */
  key?: (id: string) => string;
}

async function listOf(user: SessionUser, kind: VerdictKind, id: string): Promise<Listed | null> {
  const where = { id, companyId: user.companyId };
  if (kind === 'calc') {
    const c = await prisma.calculation.findFirst({ where, select: { results: true, ...COUNTS } });
    return c ? { list: calcList(c.results), counts: c, machine: machineOf(c.results) } : null;
  }
  if (kind === 'shaft') {
    const d = await prisma.shaftDesign.findFirst({ where, select: { inputs: true, results: true, ...COUNTS } });
    if (!d) return null;
    // the decimals and the unit of each check: its definition in the running engine (the snapshot keeps neither)
    const inputs = shaftInputsReadSchema.safeParse(d.inputs), defs = inputs.success ? attempt(() => layout(inputs.data).checks) : null;
    return { list: shaftList(d.results, defs ?? []), counts: d, machine: null };
  }
  if (kind === 'room') {
    const r = await prisma.roomDesign.findFirst({ where, select: { inputs: true, results: true, ...COUNTS, calculation: { select: { inputs: true, collaudo: true } } } });
    if (!r) return null;
    const values = formValuesSchema.safeParse(r.calculation.inputs), survey = surveySchema.safeParse(r.inputs);
    const derived: RoomDerived | null = values.success && survey.success ? attempt(() => deriveRoom(values.data, survey.data)) : null;
    return {
      list: roomList(r.results, collaudoOf(r.calculation.inputs, r.calculation.collaudo), derived?.checks ?? []), counts: r, machine: null,
      key: (k) => (derived ? roomCheckKey(k, derived) : `c_${k}`),
    };
  }
  const d = await prisma.liftDesign.findFirst({
    where,
    select: {
      inputs: true, engineVersion: true, ...COUNTS,
      calculation: { select: { inputs: true, results: true, sha256: true, collaudo: true } }, shaftDesign: { select: { results: true, sha256: true } },
    },
  });
  if (!d) return null;
  const rec = attempt(() => liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256));
  if (rec?.same) {
    // reproduced: the save's own derivation (save.ts createLiftDesign), the beams under the machine included
    const dv = rec.dv, shaft = shaftSnapshot(dv.shaft).layout.checks;
    return { list: liftListDerived(dv.collaudo, dv.analysis.res.checks, shaft, dv.supportChecks), counts: d, machine: dv.analysis.ctx.N };
  }
  const defs: readonly ShaftCheck[] = rec ? mergeChecks(rec.dv.layout.checks, rec.dv.supportChecks) : [];
  return {
    list: liftListStored(d.calculation.results, d.shaftDesign.results, collaudoOf(d.calculation.inputs, d.calculation.collaudo), defs), counts: d,
    machine: machineOf(d.calculation.results),
  };
}

/** The failing and warning checks of a record of the user's company, in `locale`; null when there is none. */
export async function verdictDetail(user: SessionUser, kind: VerdictKind, id: string, locale: Locale): Promise<VerdictDetail | null> {
  const got = await listOf(user, kind, id);
  if (!got) return null;
  const [messages, ts, t] = await Promise.all([getMessages({ locale }), getTranslations({ locale, namespace: 'shaft' }), getTranslations({ locale, namespace: 'verdictChecks' })]);
  const fmt = makeFmt(INTL_LOCALE[locale]), X = textsFor(makePres(asCalcDict(messages.calc), INTL_LOCALE[locale]));
  // a number whose decimals and unit are not known: as it is, to two decimals at most
  const plain = (x: number | null): string => (x === null ? '—' : fmt(x, Number.isInteger(x) ? 0 : 2));
  const { list, counts, machine, key = (k: string) => `c_${k}` } = got;
  const row = (c: ListedCheck): VerdictRow => {
    if (c.src === 'calc') {
      if (!isCalcCheckId(c.id)) return { name: c.id, value: plain(c.value), limit: '' };
      const shown = { id: c.id, status: c.status, value: c.value, limit: c.limit, dec: c.dec };
      return { name: X.checkLabel(c.id), value: X.checkValue(shown, machine), limit: X.checkLimit(shown, machine) };
    }
    const k = key(c.id), name = ts.has(k) ? ts(k) : c.id, id = c.id;
    if (c.dec === null || !isShaftCheckId(id)) return { name, value: plain(c.value), limit: c.limit === null ? '' : plain(c.limit) };
    const unit = c.unit ? `\u00a0${c.unit}` : '';
    const sc: ShaftCheck = { id, status: c.status, value: c.value, limit: c.limit, dec: c.dec, unit: c.unit ?? '' };
    return {
      name, value: c.value === null ? '—' : `${shownValue(sc, fmt)}${unit}`,
      limit: c.limit === null ? '' : `${isUpperLimit(sc.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`,
    };
  };
  // a list that may not be, or is not, what the pill counts says why (with both numbers when they differ)
  const n = { fails: list.fails.length, warns: list.warns.length, failCount: counts.failCount, warnCount: counts.warnCount }, same = agrees(list, counts);
  const note = list.basis === 'unreadable' ? t('note_unreadable')
    : list.basis === 'partial' ? (same ? t('note_partial') : t('note_partial_diff', n))
      : same ? null : t('note_mismatch', n);
  return { fails: list.fails.map(row), warns: list.warns.map(row), failCount: counts.failCount, warnCount: counts.warnCount, note };
}
