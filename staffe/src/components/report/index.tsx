import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, Card, cx, Field, Input, Select, Table, Td, Th } from '@/components/ui';
import {
  ETICHETTE_PERIODO,
  isoGiorno,
  queryPeriodo,
  type Definizione,
  type Periodo,
  type PresetPeriodo,
} from '@/lib/report';

/**
 * Pezzi d'interfaccia dei report. Due regole li governano:
 *
 *  1. **Nessun numero senza definizione.** Ogni schermata monta `Metodo`, che
 *     stampa che cosa conta la metrica, su quale denominatore, in che finestra e
 *     con quali esclusioni. Un numero senza definizione non è un dato, è
 *     un'opinione con la virgola.
 *  2. **Nessun grafico senza tabella.** I grafici sono SVG/CSS scritti a mano
 *     (nessuna libreria: sarebbe una dipendenza per disegnare rettangoli) e il
 *     colore non porta mai da solo l'informazione — accanto c'è sempre il
 *     numero, leggibile anche da chi non distingue i colori o usa lo schermo
 *     al sole del magazzino.
 */

// ─────────────────────────── Accesso ───────────────────────────

/** Il permesso si verifica sul server anche nelle pagine, non solo nelle rotte. */
export function AccessoNegato({ cosa }: { cosa: string }) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <h1 className="text-lg font-semibold">Permesso negato</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Il tuo ruolo non consente di consultare {cosa}. Se ti serve, chiedi
        all’amministratore.
      </p>
    </Card>
  );
}

// ─────────────────────────── Definizione della metrica ───────────────────────────

/** Scheda «come è calcolato questo numero», sempre accanto alla tabella. */
export function Metodo({
  definizione,
  periodo,
  aggiunte,
}: {
  definizione: Definizione;
  periodo?: Periodo;
  aggiunte?: ReactNode;
}) {
  return (
    <details className="mt-6 rounded border border-border bg-muted/40 p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Metodo di calcolo — {definizione.nome}
      </summary>
      <dl className="mt-3 space-y-2">
        {periodo && (
          <Voce etichetta="Periodo mostrato">
            {periodo.etichetta}
            {periodo.da ? ` (dal ${isoGiorno(periodo.da)} al ${isoGiorno(periodo.a)})` : ''}
          </Voce>
        )}
        <Voce etichetta="Che cosa conta">{definizione.cosaConta}</Voce>
        {definizione.denominatore && (
          <Voce etichetta="Denominatore">{definizione.denominatore}</Voce>
        )}
        <Voce etichetta="Finestra temporale">{definizione.finestra}</Voce>
        <Voce etichetta="Esclusioni">{definizione.esclusioni}</Voce>
        {definizione.limiti && <Voce etichetta="Limiti noti">{definizione.limiti}</Voce>}
        {aggiunte}
      </dl>
    </details>
  );
}

export function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-fg">{etichetta}</dt>
      <dd className="text-fg-muted">{children}</dd>
    </div>
  );
}

/** Avvertenza in linea: un limite dichiarato vale più di un numero pulito. */
export function Avvertenza({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
      {children}
    </p>
  );
}

// ─────────────────────────── Indicatori ───────────────────────────

export function SchedaKpi({
  etichetta,
  valore,
  dettaglio,
  href,
  evidenza,
}: {
  etichetta: string;
  valore: string;
  dettaglio?: ReactNode;
  href?: string;
  evidenza?: 'neutro' | 'avviso' | 'errore' | 'ok';
}) {
  const bordo =
    evidenza === 'errore'
      ? 'border-danger/50'
      : evidenza === 'avviso'
        ? 'border-warn/50'
        : evidenza === 'ok'
          ? 'border-ok/50'
          : 'border-border';
  const contenuto = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{etichetta}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valore}</p>
      {dettaglio && <div className="mt-1 text-xs text-fg-muted">{dettaglio}</div>}
    </>
  );
  return (
    <div className={cx('rounded border bg-surface p-4', bordo)}>
      {href ? (
        <Link href={href} className="block hover:opacity-80">
          {contenuto}
        </Link>
      ) : (
        contenuto
      )}
    </div>
  );
}

/**
 * Variazione fra due periodi. Il segno è scritto a parole oltre che col colore
 * (WCAG 1.4.1) e una base a zero non diventa «+∞»: si dichiara non calcolabile.
 */
export function Variazione({
  rapporto,
  invertiTono,
}: {
  rapporto: number | null;
  invertiTono?: boolean;
}) {
  if (rapporto == null) {
    return <span className="text-fg-muted">variazione non calcolabile (base a zero)</span>;
  }
  const su = rapporto >= 0;
  const buono = invertiTono ? !su : su;
  const percentuale = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(rapporto) * 100);
  return (
    <span className={buono ? 'text-ok' : 'text-danger'}>
      {su ? '▲' : '▼'} {su ? 'in aumento' : 'in calo'} del {percentuale}%
    </span>
  );
}

// ─────────────────────────── Grafici (senza librerie) ───────────────────────────

export type VoceBarra = {
  etichetta: string;
  valore: number;
  /** Valore già formattato (euro, pezzi, percentuale): il grafico non formatta. */
  testo: string;
};

/**
 * Barre orizzontali dentro una tabella vera: l'ordinamento e i numeri restano
 * leggibili da tastiera, da lettore di schermo e in stampa, dove le barre
 * possono anche non rendersi.
 */
export function BarreOrizzontali({
  voci,
  intestazione,
  intestazioneValore,
  vuoto = 'Nessun dato nel periodo.',
}: {
  voci: readonly VoceBarra[];
  intestazione: string;
  intestazioneValore: string;
  vuoto?: string;
}) {
  if (voci.length === 0) return <Vuoto testo={vuoto} />;
  const massimo = voci.reduce((a, v) => Math.max(a, v.valore), 0);
  return (
    <Table>
      <thead>
        <tr>
          <Th>{intestazione}</Th>
          <Th className="text-right">{intestazioneValore}</Th>
          <Th className="w-1/3">Peso relativo</Th>
        </tr>
      </thead>
      <tbody>
        {voci.map((v) => {
          const quota = massimo > 0 ? Math.max(1, (v.valore / massimo) * 100) : 0;
          return (
            <tr key={v.etichetta}>
              <Td>{v.etichetta}</Td>
              <Td className="text-right tabular-nums">{v.testo}</Td>
              <Td>
                <div className="h-2 w-full rounded bg-muted" aria-hidden="true">
                  <div className="h-2 rounded bg-brand" style={{ width: `${quota}%` }} />
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * Sparkline: andamento a colpo d'occhio. È decorativa (`aria-hidden`) e sempre
 * accompagnata dal riepilogo testuale, perché una linea senza assi non è un
 * dato leggibile.
 */
export function Sparkline({
  valori,
  descrizione,
  altezza = 36,
  larghezza = 220,
}: {
  valori: readonly number[];
  descrizione: string;
  altezza?: number;
  larghezza?: number;
}) {
  if (valori.length < 2) {
    return <p className="text-sm text-fg-muted">{descrizione}</p>;
  }
  const massimo = Math.max(...valori);
  const minimo = Math.min(...valori);
  const scala = massimo - minimo || 1;
  const punti = valori
    .map((v, i) => {
      const x = (i / (valori.length - 1)) * larghezza;
      const y = altezza - ((v - minimo) / scala) * (altezza - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div>
      <svg
        viewBox={`0 0 ${larghezza} ${altezza}`}
        width="100%"
        height={altezza}
        aria-hidden="true"
        focusable="false"
        className="text-brand"
      >
        <polyline
          points={punti}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-xs text-fg-muted">{descrizione}</p>
    </div>
  );
}

// ─────────────────────────── Filtri e azioni ───────────────────────────

const PRESET_MOSTRATI: PresetPeriodo[] = [
  'oggi',
  '7g',
  '30g',
  '90g',
  'mese',
  'mese_scorso',
  'anno',
  'tutto',
];

/**
 * Filtro del periodo come modulo GET: niente JavaScript, quindi funziona anche
 * sui tablet vecchi del magazzino e lascia il filtro nell'URL (condivisibile,
 * ricaricabile, esportabile con gli stessi parametri).
 *
 * I campi data restano vuoti quando è attivo un preset: compilarli significa
 * scegliere un periodo personalizzato, e le due cose non devono contendersi.
 */
export function FiltroPeriodo({
  periodo,
  azione,
  children,
}: {
  periodo: Periodo;
  azione: string;
  children?: ReactNode;
}) {
  const personalizzato = periodo.preset === 'personalizzato';
  return (
    <form
      method="get"
      action={azione}
      className="no-print mb-4 flex flex-wrap items-end gap-3 rounded border border-border bg-surface p-3"
    >
      <div className="w-44">
        <Field label="Periodo" htmlFor="periodo">
          <Select
            id="periodo"
            name="periodo"
            defaultValue={personalizzato ? '' : periodo.preset}
          >
            {personalizzato && <option value="">Personalizzato</option>}
            {PRESET_MOSTRATI.map((p) => (
              <option key={p} value={p}>
                {ETICHETTE_PERIODO[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="w-40">
        <Field label="Dal" htmlFor="da" hint="Vince sul periodo">
          <Input
            id="da"
            name="da"
            type="date"
            defaultValue={personalizzato && periodo.da ? isoGiorno(periodo.da) : ''}
          />
        </Field>
      </div>
      <div className="w-40">
        <Field label="Al" htmlFor="a">
          <Input
            id="a"
            name="a"
            type="date"
            defaultValue={personalizzato ? isoGiorno(periodo.a) : ''}
          />
        </Field>
      </div>
      {children}
      <Button type="submit" variant="secondario">
        Filtra
      </Button>
    </form>
  );
}

/** Collegamento all'esportazione CSV, con gli stessi filtri della schermata. */
export function LinkEsportaCsv({
  report,
  periodo,
  parametriExtra,
}: {
  report: string;
  periodo: Periodo;
  parametriExtra?: Record<string, string | number>;
}) {
  const query = new URLSearchParams(queryPeriodo(periodo));
  query.set('formato', 'csv');
  for (const [k, v] of Object.entries(parametriExtra ?? {})) query.set(k, String(v));
  return (
    <a
      href={`/api/report/${report}/export?${query.toString()}`}
      className="inline-flex h-10 items-center justify-center gap-2 rounded border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
      download
    >
      Esporta CSV
    </a>
  );
}

/** Riga con la data di estrazione: una stampa senza data non è verificabile. */
export function PiedeStampa({ periodo }: { periodo: Periodo }) {
  return (
    <p className="mt-6 hidden text-xs text-fg-muted print:block">
      Staffe — estratto il {new Date().toLocaleString('it-IT')} · periodo: {periodo.etichetta}
    </p>
  );
}

export function Vuoto({ testo }: { testo: string }) {
  return (
    <p className="rounded border border-dashed border-border p-6 text-center text-sm text-fg-muted">
      {testo}
    </p>
  );
}

/** Valore assente: un trattino esplicito, mai uno zero che sembra un dato. */
export function NonCalcolabile({ titolo }: { titolo?: string }) {
  return (
    <span className="text-fg-muted" title={titolo ?? 'Non calcolabile con i dati disponibili'}>
      —
    </span>
  );
}

// ─────────────────────────── Stampa ───────────────────────────

const CSS_STAMPA = `
@page { size: A4 landscape; margin: 12mm; }
@media print {
  .report-stampa table { font-size: 9pt; width: 100%; }
  .report-stampa thead { display: table-header-group; }
  .report-stampa tr { break-inside: avoid; }
  .report-stampa details { display: block; }
  .report-stampa details > summary { list-style: none; font-weight: 600; }
  .report-salto { break-before: page; }
  a[href]::after { content: ""; }
}
`;

/**
 * Stile di stampa. Il PDF si ottiene dalla stampa del browser (Salva come PDF):
 * una libreria di generazione PDF sarebbe una dipendenza in più, un font da
 * imbarcare e un secondo modo — divergente — di impaginare gli stessi dati.
 */
export function StileStampa() {
  return <style dangerouslySetInnerHTML={{ __html: CSS_STAMPA }} />;
}
