// The one line that names a saved machine room of a replacement (RoomDesign.summary) in the lists and at the head of its
// page: the room's size, the machine, what it stands on (on the HEB beams over the shaft's walls when it stands there;
// the existing support kept, to survey) and the calculation's drop spacing. Stored as data (JSON, v 1) and written in
// the reader's language where it is shown (src/server/room-summary.ts). Records saved before round 37 hold an Italian
// sentence instead: their line is read again from the record's survey and results, the HEB profile the software took
// (which the results do not keep) from that sentence. The support is named as sheet 1 names it (survey-data.ts
// supportName, by the same parts and the same rule for the existing support kept): one place. Pure.
import { z } from 'zod';
import { SUPPORT_KINDS, profileOf, supportOf, type SupportKind } from '@/shaft/support';
import type { RoomDerived } from './derive';
import { EXISTING_SUPPORTS, type Survey } from './survey';
import { keptKind } from './survey-site';

/** What the machine stands on: the kind, a frame's or the beams' profile, the maker's bedplate with the diverting pulley
 *  ("SICOR XTE3022"), or ours made to measure for it. */
export interface RoomSupportParts {
  kind: SupportKind;
  profile: string | null;
  maker: string | null;
  own: boolean;
}

export interface RoomSummary {
  /** the room's inner size [mm] */
  W: number;
  D: number;
  /** the catalogue's machine ("SICOR SH130"); null: entered by hand */
  machine: string | null;
  support: RoomSupportParts;
  /** the HEB beams' profile over the shaft's walls under the support; null: none */
  heb: string | null;
  /** the calculation's drop spacing [mm] */
  calata: number;
  /** the existing support the survey keeps, the new machine on it (round 37: sheet 1 «ESISTENTE, DA RILEVARE», the
   *  bedplate with the pulley «… SU ESISTENTE»): its kind; null: none kept */
  kept: ExistingKind | null;
}

type ExistingKind = (typeof EXISTING_SUPPORTS)[number];

/** The support's parts: `sup` as chosen (supportOf; a frame or beams without a profile have the typical one), the
 *  diverting pulley's bedplate `rf` as the derivation placed it. */
export function supportParts(sup: { kind: SupportKind; profile?: string }, rf: { on: string; maker: string | null } | null): RoomSupportParts {
  const profile = sup.kind === 'frame' || sup.kind === 'beams' ? sup.profile ?? profileOf({ kind: sup.kind }) : null;
  const onFrame = sup.kind === 'rinvio' && rf?.on === 'frame';
  return { kind: sup.kind, profile, maker: onFrame ? rf.maker : null, own: onFrame && rf.maker === null };
}

/** The support of a derived machine room (survey-data.ts supportName writes it on sheet 1). */
export const roomSupportOf = (d: RoomDerived): RoomSupportParts => {
  const rf = d.M.rinvio ?? null;
  return supportParts(supportOf(d.G?.room ?? null, d.M.Dp > 0), rf ? { on: rf.on, maker: rf.maker ? `${rf.maker.brand} ${rf.maker.code}` : null } : null);
};

/** The summary of a machine room the save derives from the survey `s`. */
export const roomSummaryOf = (d: RoomDerived, s: Pick<Survey, 'room' | 'existingSupport'>): RoomSummary => ({
  W: s.room.W, D: s.room.D, machine: d.made ? `${d.made.brand} ${d.made.model}` : null, support: roomSupportOf(d), heb: d.heb?.chosen.profile ?? null,
  calata: Math.round(d.calata.calc), kept: keptKind(s),
});

const n = z.number().finite();
const summarySchema = z.object({
  v: z.literal(1), W: n, D: n, machine: z.string().max(120).nullable(), heb: z.string().max(40).nullable(), calata: n,
  support: z.object({ kind: z.enum(SUPPORT_KINDS), profile: z.string().max(40).nullable(), maker: z.string().max(80).nullable(), own: z.boolean() }).strict(),
  // (round 37, after the first records: absent, read from the record's survey)
  kept: z.enum(EXISTING_SUPPORTS).nullable().optional(),
}).strict();

/** The summary as RoomDesign.summary keeps it. */
export const encodeRoomSummary = (s: RoomSummary): string => JSON.stringify({ v: 1, ...s });

// what a record saved before round 37 keeps of it, read leniently (older surveys and results had fewer fields)
const legacyInputs = z.object({
  room: z.object({
    W: n, D: n,
    support: z.object({ kind: z.enum(SUPPORT_KINDS), profile: z.string().optional() }).passthrough().optional(),
    heb: z.object({ profile: z.string().optional() }).passthrough().optional(),
  }).passthrough(),
}).passthrough();
// the existing support kept, from the record's survey (absent or unreadable: none)
const keptInputs = z.object({ existingSupport: z.object({ kind: z.enum(EXISTING_SUPPORTS), keep: z.boolean() }).passthrough().optional() }).passthrough();
const keptOf = (inputs: unknown): ExistingKind | null => {
  const i = keptInputs.safeParse(inputs);
  return i.success ? keptKind(i.data) : null;
};
const legacyResults = z.object({
  machine: z.object({ brand: z.string(), model: z.string() }).passthrough().nullable(),
  calata: z.object({ calc: n }).passthrough(),
  spec: z.object({ Dp: n, rinvio: z.object({ on: z.string(), maker: z.string().nullable() }).passthrough().nullable().optional() }).passthrough(),
}).passthrough();

function legacy(text: string, inputs: unknown, results: unknown): RoomSummary | null {
  const i = legacyInputs.safeParse(inputs), r = legacyResults.safeParse(results);
  if (!i.success || !r.success) return null;
  const R = i.data.room, { machine, calata, spec } = r.data, rf = spec.rinvio ?? null;
  // the support chosen, else the bedplate with the pulley when there is one, else shims (supportOf)
  const sup = R.support ?? { kind: spec.Dp > 0 ? 'rinvio' as const : 'shims' as const };
  // the maker's bedplate is the machine maker's (src/lib/catalog/bedplates.ts)
  const parts = supportParts(sup, rf ? { on: rf.on, maker: rf.maker ? `${machine?.brand ?? ''} ${rf.maker}`.trim() : null } : null);
  // the HEB beams: chosen with the survey, else the software's, named in the sentence of the time
  const onHeb = !!R.heb && sup.kind !== 'beams' && sup.kind !== 'plinth';
  const heb = onHeb ? R.heb?.profile ?? /su due (heb \d+) sui muri del vano/i.exec(text)?.[1]?.toUpperCase() ?? null : null;
  return { W: R.W, D: R.D, machine: machine ? `${machine.brand} ${machine.model}` : null, support: parts, heb, calata: Math.round(calata.calc), kept: keptOf(inputs) };
}

/** The summary of a saved machine room: the stored data, else read again from a record saved before round 37; null when
 *  neither can be read (the stored text is shown as it is). */
export function readRoomSummary(rec: { summary: string; inputs: unknown; results: unknown }): RoomSummary | null {
  if (rec.summary.startsWith('{')) {
    try {
      const s = summarySchema.safeParse(JSON.parse(rec.summary));
      if (s.success) {
        const { v: _v, kept, ...rest } = s.data;
        void _v;
        return { ...rest, kept: kept === undefined ? keptOf(rec.inputs) : kept };
      }
    } catch {
      return null;
    }
    return null;
  }
  return legacy(rec.summary, rec.inputs, rec.results);
}

type Tr = (key: string, values?: Record<string, string>) => string;

// (the survey's name of the existing support, inside the line)
const lowerFirst = (x: string): string => x.charAt(0).toLocaleLowerCase() + x.slice(1);

/** The summary written with the messages of the reader's language: `t` the room's, `ts` the shaft's (the supports'
 *  names), `num` the numbers as the screen writes them. The existing support kept as sheet 1 names it (survey-data.ts
 *  supportName): the bedplate with the pulley on it, else it, reused, to survey — its kind as the survey names it. */
export function roomSummaryText(s: RoomSummary, t: Tr, ts: Tr, num: (x: number) => string): string {
  const p = s.support, kind = ts(`sp_${p.kind}`), bed = Boolean(p.maker || p.own);
  const own = p.profile ? `${kind} ${p.profile}` : p.maker ? `${kind} ${p.maker}` : p.own ? `${kind} ${t('sum_own')}` : kind;
  const old = s.kept ? lowerFirst(t(`oldSupport_${s.kept}`)) : '', drawn = s.kept && !bed ? t('sum_existing', { kind: old }) : own;
  const onHeb = s.heb ? t('sum_heb', { support: drawn, profile: s.heb }) : drawn;
  const support = s.kept && bed ? t('sum_on_existing', { support: onHeb, kind: old }) : onHeb;
  return t('summary', { W: num(s.W), D: num(s.D), machine: s.machine ?? t('sum_machine'), support, calata: num(s.calata) });
}
