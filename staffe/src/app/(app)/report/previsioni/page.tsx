import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatQty } from '@/lib/money';
import { UOM_LABELS } from '@/lib/labels';
import { Badge, Field, Input, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  Avvertenza,
  LinkEsportaCsv,
  Metodo,
  NonCalcolabile,
  PiedeStampa,
  SchedaKpi,
  StileStampa,
  Voce,
  Vuoto,
} from '@/components/report';
import { PulsanteStampa } from '@/components/report/PulsanteStampa';
import {
  DEFINIZIONI,
  formatDecimale,
  interoDaParametro,
  periodoDaParametri,
} from '@/lib/report';
import {
  riepilogoTendenzeAcquisti,
  Z_LIVELLO_SERVIZIO,
  type Confidenza,
  type LivelloServizio,
} from '@/lib/forecast';
import { datiPrevisioni } from '../_dati';

export const metadata: Metadata = { title: 'Previsioni e riordino' };

const LIMITE_SCHERMO = 200;

const TONO_CONFIDENZA: Record<Confidenza, 'ok' | 'avviso' | 'errore' | 'neutro'> = {
  alta: 'ok',
  media: 'avviso',
  bassa: 'errore',
  nulla: 'neutro',
};

const LIVELLI: LivelloServizio[] = [90, 95, 97.5, 99];

export default async function PaginaPrevisioni({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }

  const sp = await searchParams;
  const periodo = periodoDaParametri(sp, 'tutto');
  const giorni = interoDaParametro(sp.giorni, { predefinito: 90, min: 7, max: 730 });
  const servizioGrezzo = Number(Array.isArray(sp.servizio) ? sp.servizio[0] : sp.servizio);
  const livelloServizio: LivelloServizio = LIVELLI.includes(servizioGrezzo as LivelloServizio)
    ? (servizioGrezzo as LivelloServizio)
    : 95;

  const dati = await datiPrevisioni({ giorni, livelloServizio });
  const righe = dati.righe.slice(0, LIMITE_SCHERMO);
  const riepilogo = riepilogoTendenzeAcquisti(
    dati.righe.map((r) => ({
      nome: r.sku,
      consumoGiornaliero: r.consumoGiornaliero ?? 0,
      tendenzaGiornaliera: r.tendenzaGiornaliera ?? 0,
      copertura: r.copertura,
      quantitaSuggerita: r.quantitaSuggerita,
      statoPrevisione: r.stato,
    })),
  );
  const senzaPrevisione = dati.righe.filter((r) => r.stato !== 'ok').length;

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Previsioni e riordino"
        description={`Calcolo deterministico su ${giorni} giorni di uscite · livello di servizio ${livelloServizio}%`}
        actions={
          <>
            <LinkEsportaCsv
              report="previsioni"
              periodo={periodo}
              parametriExtra={{ giorni, servizio: livelloServizio }}
            />
            <PulsanteStampa />
          </>
        }
      />

      <form
        method="get"
        action="/report/previsioni"
        className="no-print mb-4 flex flex-wrap items-end gap-3 rounded border border-border bg-surface p-3"
      >
        <div className="w-48">
          <Field label="Finestra di analisi" htmlFor="giorni" hint="Giorni di uscite osservate">
            <Input id="giorni" name="giorni" type="number" min={7} max={730} defaultValue={giorni} />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Livello di servizio" htmlFor="servizio" hint="Copertura della variabilità">
            <Select id="servizio" name="servizio" defaultValue={String(livelloServizio)}>
              {LIVELLI.map((l) => (
                <option key={l} value={l}>
                  {l}% (z = {Z_LIVELLO_SERVIZIO[l]})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          Ricalcola
        </button>
      </form>

      <Avvertenza>
        <strong>Come leggere questi numeri.</strong> Sono calcolati dai movimenti registrati con
        un metodo statistico dichiarato (livellamento esponenziale), non da un modello che
        &laquo;indovina&raquo;: gli stessi dati danno sempre lo stesso risultato e ogni riga si può
        rifare a mano. Il metodo estrapola il passato e non conosce commesse straordinarie, fermi
        impianto o cambi di listino: la quantità suggerita è una proposta da approvare, non un
        ordine.
      </Avvertenza>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Da riordinare"
          valore={formatQty(dati.daRiordinare)}
          dettaglio={`su ${dati.righe.length} prodotti attivi`}
          evidenza={dati.daRiordinare > 0 ? 'avviso' : 'ok'}
        />
        <SchedaKpi
          etichetta="Pezzi suggeriti"
          valore={formatQty(dati.pezziSuggeriti)}
          dettaglio="Somma delle quantità proposte"
        />
        <SchedaKpi
          etichetta="Senza previsione"
          valore={formatQty(senzaPrevisione)}
          dettaglio="Dati insufficienti o nessun consumo"
        />
        <SchedaKpi
          etichetta="Finestra"
          valore={`${giorni} gg`}
          dettaglio="Uscite per ordine cliente (prelievo, spedizione)"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Riepilogo delle tendenze</h2>
        <ul className="list-disc space-y-1 rounded border border-border bg-surface p-4 pl-8 text-sm">
          {riepilogo.map((riga) => (
            <li key={riga}>{riga}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-fg-muted">
          Testo composto da un modello di frase riempito con i numeri della tabella: nessun
          contenuto generato, nulla che non sia verificabile qui sotto.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Proposta di riordino</h2>
        {righe.length === 0 ? (
          <Vuoto testo="Nessun prodotto attivo da analizzare." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Prodotto</Th>
                <Th className="text-right">Disponibile</Th>
                <Th className="text-right">In arrivo</Th>
                <Th className="text-right">Consumo/giorno</Th>
                <Th className="text-right">Copertura</Th>
                <Th className="text-right">Lead time</Th>
                <Th className="text-right">Punto di riordino</Th>
                <Th className="text-right">Quantità suggerita</Th>
                <Th>Metodo · confidenza</Th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.productId}>
                  <Td>
                    <span className="font-mono text-xs">{r.sku}</span> — {r.nome}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatQty(r.disponibile)} {UOM_LABELS[r.uom]}
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.inArrivo)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.stato === 'ok' ? (
                      <>
                        {formatDecimale(r.consumoGiornaliero, 2)}
                        {r.tendenzaGiornaliera != null && r.tendenzaGiornaliera !== 0 && (
                          <span
                            className={
                              r.tendenzaGiornaliera > 0 ? 'ml-1 text-danger' : 'ml-1 text-ok'
                            }
                          >
                            {r.tendenzaGiornaliera > 0 ? '▲' : '▼'}
                            <span className="sr-only">
                              {r.tendenzaGiornaliera > 0 ? 'in crescita' : 'in calo'}
                            </span>
                          </span>
                        )}
                      </>
                    ) : (
                      <NonCalcolabile titolo={r.motivo} />
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.copertura == null ? (
                      <NonCalcolabile titolo="Consumo nullo: copertura non calcolabile" />
                    ) : (
                      `${formatDecimale(r.copertura, 1)} gg`
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{r.leadTimeGiorni} gg</Td>
                  <Td className="text-right tabular-nums">
                    {r.puntoDiRiordino == null ? (
                      <NonCalcolabile />
                    ) : (
                      <>
                        {formatQty(r.puntoDiRiordino)}
                        {r.scortaSicurezza != null && r.scortaSicurezza > 0 && (
                          <span className="ml-1 text-xs text-fg-muted">
                            (+{r.scortaSicurezza} sicurezza)
                          </span>
                        )}
                      </>
                    )}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    <span title={r.notaQuantita}>
                      {r.quantitaSuggerita > 0 ? formatQty(r.quantitaSuggerita) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-fg-muted">{r.metodo}</span>{' '}
                    <Badge tone={TONO_CONFIDENZA[r.confidenza]}>{r.confidenza}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {dati.righe.length > LIMITE_SCHERMO && (
          <p className="mt-2 text-sm text-fg-muted">
            Mostrati i primi {LIMITE_SCHERMO} prodotti di {dati.righe.length}, ordinati per
            quantità suggerita. L&apos;esportazione CSV contiene l&apos;elenco completo.
          </p>
        )}
      </section>

      <Metodo
        definizione={DEFINIZIONI.previsioni}
        aggiunte={
          <>
            <Voce etichetta="Parametri usati">
              Finestra {giorni} giorni · livello di servizio {livelloServizio}% (z ={' '}
              {Z_LIVELLO_SERVIZIO[livelloServizio]}) · lead time dall&apos;anagrafica del
              fornitore (7 giorni quando manca).
            </Voce>
            <Voce etichetta="Confidenza">
              <strong>alta</strong>: almeno 60 giorni di finestra, 20 giorni movimentati e
              consumo regolare. <strong>media</strong>: almeno 30 giorni e 8 movimentati.{' '}
              <strong>bassa</strong>: serie irregolare o pochi dati. <strong>nulla</strong>:
              nessuna previsione prodotta. Non è una probabilità: è un&apos;etichetta di
              affidabilità.
            </Voce>
            <Voce etichetta="Quando NON viene proposto nulla">
              Finestra sotto 14 giorni, meno di 3 giorni con movimento, oppure nessuna uscita nel
              periodo. In questi casi la cella riporta «—»: un numero inventato farebbe comprare
              merce vera.
            </Voce>
            <Voce etichetta="Dove sta il calcolo">
              <code>src/lib/forecast.ts</code>, funzioni pure coperte da test
              (<code>src/lib/__tests__/forecast.test.ts</code>). Nessun servizio esterno, nessun
              modello linguistico: i dati del magazzino non escono dal server.
            </Voce>
          </>
        }
      />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
