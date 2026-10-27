'use client';

// Step 1 of the RT after the owner's model, «Dati generali»: what its first page and its cover ask that nothing else
// holds — the model's labels, each with its «?». The installation's identity, the owner, the regime and the documented
// data are the registry's (the card above) and the calculation's.
import { useId } from 'react';
import Etichetta from '../aiuto/Etichetta';
import type { Rt2Inputs } from '@/lib/rt2/input';
import type { CampoRt2 as Spec, ValoreRt2 } from '@/lib/rt2/types';
import CampoRt2 from './CampoRt2';
import { aiutoRt2 } from './aiuto';

type Doc = NonNullable<Rt2Inputs['doc']>;
const CAMPI: readonly (Exclude<Spec, { t: 'gruppo' }> & { id: keyof Doc })[] = [
  { id: 'costruttore', t: 'testo', label: 'Ascensore di costruzione:', max: 80 },
  { id: 'utentiEsperti', t: 'scelta', label: 'Utenti autorizzati ed esperti:', opzioni: [{ v: 'si', t: 'si' }, { v: 'no', t: 'no' }] },
  { id: 'ascensorista', t: 'testo', label: 'Ascensorista :', max: 160 },
  { id: 'annoRealizzazione', t: 'testo', label: 'Anno di realizzazione:', max: 4 },
  { id: 'commessa', t: 'testo', label: 'Commessa :', max: 40 },
];

function Testo({ id: campo, label, value, set, need, readOnly, max, esperto }: { id: string; label: string; value: string | undefined; set: (v: string | undefined) => void;
  need: boolean; readOnly: boolean; max: number; esperto?: boolean }) {
  const id = useId();
  return (
    <div className={['field', 'wide', need ? 'need' : '', esperto ? 'esperto' : ''].filter(Boolean).join(' ')}>
      <Etichetta htmlFor={id} aiuto={aiutoRt2(`doc.${campo}`)} nome={label}>{label}</Etichetta>
      <textarea id={id} className="input" maxLength={max} disabled={readOnly} value={value ?? ''} onChange={(e) => set(e.target.value || undefined)} />
    </div>
  );
}

export default function CardGenerale({ n, doc, set, mancanti, readOnly, oggi }: {
  n: number; doc: Doc; set: (k: keyof Doc, v: ValoreRt2 | undefined) => void; mancanti: ReadonlySet<string>; readOnly: boolean; oggi: string;
}) {
  const dataId = useId();
  return (
    <section className="panel rt-card" id="rt2-generale" aria-labelledby="rt2-generale-h">
      <h2 id="rt2-generale-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>Dati generali</h2>
      <p className="note">Matricola, indirizzo, proprietario e «Collaudato secondo» vengono dai dati dell’impianto qui sopra; portata, masse, velocità e corsa dal Calcolo argano.</p>
      <div className="rt2-campi">
        <div className="field">
          <Etichetta htmlFor={dataId} aiuto={aiutoRt2('doc.data')} nome="Data Relazione Tecnica:">Data Relazione Tecnica:</Etichetta>
          <input id={dataId} className="input" type="date" max={oggi} disabled={readOnly} value={doc.data ?? ''} onChange={(e) => set('data', e.target.value || undefined)} />
        </div>
        {CAMPI.map((c) => (
          <CampoRt2 key={c.id} spec={c} chiave={`doc.${c.id}`} value={doc[c.id]} proposta={undefined} set={(v) => set(c.id, v)}
            need={mancanti.has(`doc.${c.id}`)} bad={false} readOnly={readOnly} />
        ))}
        <Testo id="componentiModificati" label="Componenti modificati o tipologia modifica:" value={doc.componentiModificati} max={4000}
          set={(v) => set('componentiModificati', v)} need={mancanti.has('doc.componentiModificati')} readOnly={readOnly} />
        <Testo id="testoCopertina" label="Testo sulla copertina della relazione" value={doc.testoCopertina} max={600} esperto
          set={(v) => set('testoCopertina', v)} need={false} readOnly={readOnly} />
      </div>
    </section>
  );
}
