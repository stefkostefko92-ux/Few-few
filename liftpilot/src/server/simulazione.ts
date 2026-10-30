import 'server-only';
// What the Simulazione of an installation simulates (round 53): a saved lift design — the one asked for (?design=, of
// this installation), else the latest — derived again from its form as entered, and the Progetto's draft on its
// «Calcolo argano», composed as the form composes it (lib/lift/progetto-bozza.ts): its inputs, or how many values it still
// needs. The draft is simulated when asked for (?fonte=bozza) or when nothing is saved yet. The page shows; nothing is
// saved or derived for a record here. Always the user's company: another company's design or installation is none.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import type { LiftInputs } from '@/lib/lift';
import { liftRecord } from '@/lib/lift-record';
import { liftDraftSchema } from '@/lib/draft-input';
import { inputsDellaBozza } from '@/lib/lift/progetto-bozza';
import { calcoloBase } from './calcolo-base';
import { readDraft } from './drafts';
import { getLiftDesign } from './queries';

export interface SalvatoSim {
  id: string;
  createdAt: Date;
  label: string | null;
  inputs: LiftInputs;
  /** the running engines no longer reproduce it: simulated as the software derives it now */
  vecchio: boolean;
}

export type BozzaSim = { at: string; inputs: LiftInputs } | { at: string; manca: number } | { at: string; senzaCalcolo: true };

export interface Simulazione {
  salvato: SalvatoSim | null;
  bozza: BozzaSim | null;
  /** what the page simulates; null: nothing yet (no design saved, no draft complete) */
  fonte: 'salvato' | 'bozza' | null;
}

export async function simulazioneDi(user: SessionUser, projectId: string, ask: { design?: string; bozza?: boolean }): Promise<Simulazione> {
  const pick = ask.design ? { id: ask.design } : null;
  const row = await prisma.liftDesign.findFirst({ where: { projectId, companyId: user.companyId, ...pick }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const d = row ? await getLiftDesign(user, row.id) : null;
  const r = d ? liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256) : null;
  const salvato = d && r ? { id: d.id, createdAt: d.createdAt, label: d.label, inputs: r.inputs, vecchio: !r.same } : null;
  const draft = await readDraft(user, projectId, 'lift', liftDraftSchema);
  let bozza: BozzaSim | null = null;
  if (draft) {
    const base = await calcoloBase(user, projectId, draft.data.base);
    bozza = !base || !base.same ? { at: draft.at, senzaCalcolo: true }
      : { at: draft.at, ...inputsDellaBozza({ progetto: draft.data.progetto, blank: draft.data.blank }, { values: base.values, collaudo: base.collaudo }) };
  }
  const bozzaPronta = !!bozza && 'inputs' in bozza;
  const fonte = (ask.bozza || !salvato) && bozzaPronta ? 'bozza' : salvato ? 'salvato' : null;
  return { salvato, bozza, fonte };
}
