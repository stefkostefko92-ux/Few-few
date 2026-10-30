'use client';

// The card of one component of the RT after the owner's model: why it is in, its fields as the model asks them (its
// groups, the «?» of each, the software's proposals), then its checks as the page will print them — value, limit,
// outcome, clause — and what is still missing to issue.
import { conValore, fmt } from '@/lib/rt2/campi';
import type { MotivoRt2 } from '@/lib/rt2/generale';
import type { ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2, ValoreRt2 } from '@/lib/rt2/types';
import CampoRt2 from './CampoRt2';
import { limiteTesto, ESITO_TESTO } from './esiti';

export interface CardComponenteProps {
  n: number;
  modulo: ModuloRt2;
  ctx: ContestoRt2;
  dati: DatiRt2;
  proposte: DatiRt2;
  esito: EsitoRt2 | undefined;
  motivi: readonly MotivoRt2[];
  set: (campo: string, v: ValoreRt2 | undefined) => void;
  readOnly: boolean;
  /** the field ids out of their range (the draft's schema) */
  bad: ReadonlySet<string>;
}

export default function CardComponente({ n, modulo: m, ctx, dati, proposte, esito, motivi, set, readOnly, bad }: CardComponenteProps) {
  const id = `rt2-${m.id}`, merged = { ...proposte, ...dati }, mancanti = new Set(esito?.mancanti ?? []);
  const campi = m.campi.filter((c) => !c.show || c.show(merged, ctx));
  return (
    <section className="panel rt-card" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>{m.titolo}</h2>
      {motivi.length ? <p className="note">{motivi.map((x) => x.testo).join('; ')}</p> : <p className="note">Aggiunto da te.</p>}
      {campi.length ? (
        <div className="rt2-campi">
          {campi.map((c) => (conValore(c)
            ? <CampoRt2 key={c.id} spec={c} chiave={`${m.id}.${c.id}`} value={dati[c.id]} proposta={proposte[c.id]} set={(v) => set(c.id, v)}
                need={mancanti.has(c.id)} bad={bad.has(c.id)} readOnly={readOnly} />
            : <h3 key={c.id} className="rt2-gruppo">{c.label}</h3>))}
        </div>
      ) : <p className="note">I dati di questa pagina vengono dal Calcolo argano: qui non c’è niente da inserire.</p>}
      {esito?.verifiche.length ? (
        <div className="table-scroll">
          <table className="table rt2-verifiche">
            <caption className="sr-only">Verifiche di {m.titolo}</caption>
            <thead><tr><th scope="col">Verifica</th><th scope="col">Valore</th><th scope="col">Limite</th><th scope="col">Esito</th><th scope="col">Riferimento</th></tr></thead>
            <tbody>
              {esito.verifiche.map((v) => (
                <tr key={v.id} data-esito={v.esito}>
                  <td>{v.testo}</td><td className="num">{fmt(v.valore, v.dec)}{v.unita ? ` ${v.unita}` : ''}</td><td className="num">{limiteTesto(v)}</td>
                  <td><span className={`pill ${v.esito}`}>{ESITO_TESTO[v.esito]}</span></td><td className="note">{v.rif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {esito?.mancanti.some((x) => x.startsWith('calcolo.')) ? (
        <p className="alert alert-warn" role="status">Il Calcolo argano non dà ancora i dati di questa pagina: completalo e salvalo.</p>
      ) : null}
    </section>
  );
}
