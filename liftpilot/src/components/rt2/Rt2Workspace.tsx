'use client';

// The RT after the owner's model while it is prepared (round 52): its steps in the model's order — «Dati generali»,
// «Dati tecnici», «Componenti», one card per component of the fascicolo, «Allegati», «Firme ed emissione» — over one
// set of inputs (lib/rt2/input.ts), kept as the RT's draft as they are typed (FormDraft scope 'rt2'). The engine runs here
// on the base the server gave (the calculation's values and test, the registry) for the live checks and what is missing;
// the server derives everything again at the issue. The bar shows each step with what it still needs: the way through
// (components/passi, as «Calcolo argano» and «Progetto»: the step now marked).
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift/collaudo';
import type { Anagrafica } from '@/lib/rt/anagrafica';
import { CONDIVISI, moduloDi } from '@/lib/rt2/componenti';
import { datiCondivisi, deriveRt2 } from '@/lib/rt2/derive';
import { rt2DraftSchema, type Rt2Inputs } from '@/lib/rt2/input';
import { risultatiDi } from '@/lib/rt2/risultati';
import { COMPONENTI_RT2, type ComponenteRt2, type ValoreRt2 } from '@/lib/rt2/types';
import { TITOLI_RT2 } from '@/lib/rt2/titoli';
import type { Passo } from '@/lib/passi';
import DraftBar from '@/components/draft/DraftBar';
import BarraPassi from '@/components/passi/BarraPassi';
import { useDraft, type DraftTarget } from '@/components/draft/useDraft';
import { setPath } from '@/components/rt/paths';
import CardAllegati, { type FileRt2 } from './CardAllegati';
import CardComponente from './CardComponente';
import CardComponenti from './CardComponenti';
import CardFirme from './CardFirme';
import CardGenerale from './CardGenerale';
import CardTecnici, { type TecniciValori } from './CardTecnici';

export interface BaseClient {
  V: FormValues;
  C: Collaudo;
  anagrafica: Anagrafica;
  liftUse?: 'passengers' | 'goods' | 'goodsHeavy';
}

export interface Rt2WorkspaceProps {
  projectId: string;
  initial: Rt2Inputs;
  draftAt: string | null;
  revisione: { id: string; label: string } | null;
  base: BaseClient;
  files: FileRt2[];
  canEdit: boolean;
  canIssue: boolean;
  oggi: string;
  calcHref: string;
  panel: ReactNode;
}

type Obj = Record<string, unknown>;
const DISPONIBILI = new Set(COMPONENTI_RT2.filter((c) => moduloDi(c) !== null));

export default function Rt2Workspace(p: Rt2WorkspaceProps) {
  const [inputs, setInputs] = useState<Rt2Inputs>(p.initial);
  const res = useMemo(() => risultatiDi(p.base.V), [p.base.V]);
  const d = useMemo(() => deriveRt2({ ...p.base, res }, inputs), [p.base, res, inputs]);
  const condivisi = useMemo(() => datiCondivisi(inputs.dati), [inputs.dati]);
  const parsed = useMemo(() => rt2DraftSchema.safeParse(inputs), [inputs]), valid = parsed.success;
  const bad = useMemo(() => new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))), [parsed]);
  const target = useMemo<DraftTarget | null>(() => (p.canEdit ? { projectId: p.projectId, scope: 'rt2', resumed: p.draftAt } : null), [p.canEdit, p.projectId, p.draftAt]);
  const draft = useDraft(target, p.revisione ? { inputs, revisionOf: p.revisione.id } : { inputs }, valid);
  const set = useCallback((path: string, v: unknown) => setInputs((prev) => setPath(prev as Obj, path, v) as Rt2Inputs), []);
  const ro = !p.canEdit;

  const richiesti = useMemo(() => new Map(d.richiesti.map((r) => [r.id, r.motivi])), [d.richiesti]);
  // a component's need of the technical data (the car's area and capacity) is filled in «Dati tecnici»: counted there
  const tecnico = (campo: string): boolean => campo.startsWith('tecnici.');
  const mancantiDi = (dove: (x: string, campo: string) => boolean): number => d.mancanti.filter((m) => dove(m.dove, m.campo)).length;
  const steps: Passo[] = [
    { id: 'rt2-generale', label: 'Dati generali', manca: mancantiDi((x) => x === 'doc' || x === 'anagrafica') },
    { id: 'rt2-tecnici', label: 'Dati tecnici', manca: mancantiDi((x, campo) => x === 'base' || x === 'tecnici' || tecnico(campo)) },
    { id: 'rt2-componenti', label: 'Componenti', manca: 0 },
    ...d.componenti.map((c) => ({ id: `rt2-${c}`, label: TITOLI_RT2[c], manca: mancantiDi((x, campo) => x === c && !tecnico(campo)) })),
    { id: 'rt2-allegati', label: 'Allegati', manca: 0 },
    { id: 'rt2-firme', label: 'Firme ed emissione', manca: mancantiDi((x) => x === 'firme') },
  ].map((s, i) => ({ ...s, n: i + 1, primo: null }));
  const tecnici: TecniciValori = { prima: inputs.tecnici?.prima ?? {}, dopo: inputs.tecnici?.dopo ?? {} };
  const inclusi = (inputs.allegati ?? []).map((a) => a.attachmentId);
  return (
    <div className="rt-work" data-rt="workspace2">
      <BarraPassi className="rt-bar" passi={steps} label="Passi della relazione"
        stato={valid ? `${d.fails} non verificate · ${d.mancanti.length} dati mancanti` : `${bad.size} valori fuori dai limiti`}>
        {target ? <DraftBar target={target} draft={draft} /> : null}
      </BarraPassi>
      <CardGenerale n={1} doc={inputs.doc ?? {}} set={(k, v) => set(`doc.${k}`, v)} mancanti={new Set(d.mancanti.map((m) => m.campo))} readOnly={ro} oggi={p.oggi} />
      <CardTecnici n={2} ctx={d.ctx} x={tecnici} set={set} readOnly={ro} chiediAzPrima={!p.base.C.regolazione} calcHref={p.calcHref}
        mancanti={new Set(d.mancanti.map((m) => m.campo).filter(tecnico))} />
      <CardComponenti n={3} richiesti={richiesti} aggiunti={inputs.aggiunti ?? []} disponibili={DISPONIBILI} readOnly={ro}
        set={(c: ComponenteRt2, on: boolean) => {
          const prev = inputs.aggiunti ?? [], next = on ? [...prev.filter((x) => x !== c), c] : prev.filter((x) => x !== c);
          set('aggiunti', next.length ? next : undefined);
        }} />
      {d.componenti.map((c, i) => {
        const m = moduloDi(c);
        return m ? (
          <CardComponente key={c} n={4 + i} modulo={m} ctx={d.ctx} dati={condivisi[c] ?? {}} proposte={m.proposte?.(d.ctx) ?? {}} esito={d.esiti[c]}
            motivi={richiesti.get(c) ?? []} readOnly={ro} bad={new Set([...bad].filter((x) => x.startsWith(`dati.${c}.`)).map((x) => x.split('.')[2] ?? ''))}
            set={(campo: string, v: ValoreRt2 | undefined) => { for (const k of CONDIVISI[campo]?.includes(c) ? CONDIVISI[campo] ?? [c] : [c]) set(`dati.${k}.${campo}`, v); }} />
        ) : null;
      })}
      <CardAllegati n={4 + d.componenti.length} proposti={new Set(d.proposti)} scelte={inputs.dichiarati ?? {}} readOnly={ro} files={p.files} inclusi={inclusi}
        setScelta={(a, v) => set(`dichiarati.${a}`, v)} panel={p.panel}
        setInclusi={(ids) => set('allegati', ids.length ? ids.map((id) => inputs.allegati?.find((x) => x.attachmentId === id) ?? { attachmentId: id }) : undefined)} />
      <CardFirme n={5 + d.componenti.length} projectId={p.projectId} inputs={inputs} d={d} set={set} readOnly={ro} canIssue={p.canIssue} revisione={p.revisione}
        flush={draft.flush} stopDraft={draft.stop} />
    </div>
  );
}
