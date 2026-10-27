'use client';

// Step «Allegati» of the RT after the owner's model: the documents the fascicolo declares attached (the model's list of
// fifteen, each proposed or not by the components and the changes, confirmed or changed here) and the files uploaded to
// the installation to append after the body, in this order; the upload panel of the installation below.
import { useId, type ReactNode } from 'react';
import Aiuto from '../aiuto/Aiuto';
import { ALLEGATI_RT2, ALLEGATO_TESTO, type AllegatoRt2 } from '@/lib/rt2/allegati';
import { aiutoRt2 } from './aiuto';

export interface FileRt2 { id: string; title: string; kindLabel: string; pages: number }

export default function CardAllegati({ n, proposti, scelte, setScelta, files, inclusi, setInclusi, readOnly, panel }: {
  n: number; proposti: ReadonlySet<AllegatoRt2>; scelte: Partial<Record<AllegatoRt2, boolean>>; setScelta: (a: AllegatoRt2, v: boolean | undefined) => void;
  files: readonly FileRt2[]; inclusi: readonly string[]; setInclusi: (ids: string[]) => void; readOnly: boolean; panel: ReactNode;
}) {
  const id = useId();
  const toggle = (fid: string, on: boolean): void => setInclusi(on ? files.filter((f) => f.id === fid || inclusi.includes(f.id)).map((f) => f.id) : inclusi.filter((x) => x !== fid));
  return (
    <section className="panel rt-card" id="rt2-allegati" aria-labelledby="rt2-allegati-h">
      <h2 id="rt2-allegati-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>Allegati</h2>
      <h3>Documenti dichiarati allegati <Aiuto testo={aiutoRt2('dichiarati') ?? ''} nome="Documenti dichiarati allegati" /></h3>
      <ul className="rt2-dich">
        {ALLEGATI_RT2.map((a) => {
          const on = scelte[a] ?? proposti.has(a);
          return (
            <li key={a}>
              <label htmlFor={`${id}-${a}`}>
                <input id={`${id}-${a}`} type="checkbox" checked={on} disabled={readOnly}
                  onChange={(e) => setScelta(a, e.target.checked === proposti.has(a) ? undefined : e.target.checked)} />
                <span>{ALLEGATO_TESTO[a].stampa}{proposti.has(a) && scelte[a] === undefined ? <span className="note"> · proposto</span> : null}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <h3>File in coda al fascicolo <Aiuto testo={aiutoRt2('allegati.file') ?? ''} nome="File in coda al fascicolo" /></h3>
      {files.length ? (
        <ol className="rt2-dich">
          {files.map((f) => (
            <li key={f.id}>
              <label htmlFor={`${id}-f-${f.id}`}>
                <input id={`${id}-f-${f.id}`} type="checkbox" checked={inclusi.includes(f.id)} disabled={readOnly} onChange={(e) => toggle(f.id, e.target.checked)} />
                <span>{f.title}<span className="note"> · {f.kindLabel} · {f.pages} {f.pages === 1 ? 'pagina' : 'pagine'}</span></span>
              </label>
            </li>
          ))}
        </ol>
      ) : <p className="note">Nessun file caricato nell’impianto.</p>}
      {panel}
    </section>
  );
}
