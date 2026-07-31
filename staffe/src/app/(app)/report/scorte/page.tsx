import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatCents, formatQty } from '@/lib/money';
import { formatDate, UOM_LABELS } from '@/lib/labels';
import { Badge, Field, Input, PageHeader, StockIndicator, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  FiltroPeriodo,
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
  formatPercento,
  interoDaParametro,
  periodoDaParametri,
  quota,
} from '@/lib/report';
import { datiScorte, type StatoScorta } from '../_dati';

export const metadata: Metadata = { title: 'Stato delle scorte' };

const LIMITE_SCHERMO = 300;

const ETICHETTE_STATO: Record<StatoScorta, string> = {
  esaurito: 'Esaurito',
  sotto_scorta: 'Sotto scorta',
  morta: 'Giacenza morta',
  regolare: 'Regolare',
};

export default async function PaginaScorte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');

  const sp = await searchParams;
  // Il periodo non filtra la giacenza (che è di oggi): resta per coerenza del
  // filtro e per l'esportazione, ed è dichiarato nel metodo.
  const periodo = periodoDaParametri(sp, 'tutto');
  const giorniMorta = interoDaParametro(sp.giorni, { predefinito: 90, min: 7, max: 730 });
  const dati = await datiScorte(giorniMorta);

  const daVedere = dati.righe
    .filter((r) => r.stato !== 'regolare')
    .sort((a, b) => b.valoreCents - a.valoreCents);

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Stato delle scorte"
        description={`Sotto scorta, esauriti e giacenza morta (soglia ${giorniMorta} giorni)`}
        actions={
          <>
            <LinkEsportaCsv report="scorte" periodo={periodo} parametriExtra={{ giorni: giorniMorta }} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/scorte">
        <div className="w-48">
          <Field label="Giorni senza uscite" htmlFor="giorni" hint="Soglia giacenza morta">
            <Input
              id="giorni"
              name="giorni"
              type="number"
              min={7}
              max={730}
              defaultValue={giorniMorta}
            />
          </Field>
        </div>
      </FiltroPeriodo>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Esauriti"
          valore={formatQty(dati.conteggi.esaurito)}
          dettaglio={`${formatPercento(quota(dati.conteggi.esaurito, dati.totaleProdotti))} dei ${dati.totaleProdotti} prodotti attivi`}
          evidenza={dati.conteggi.esaurito > 0 ? 'errore' : 'ok'}
        />
        <SchedaKpi
          etichetta="Sotto scorta"
          valore={formatQty(dati.conteggi.sotto_scorta)}
          dettaglio="Giacenza ≤ scorta minima di anagrafica"
          evidenza={dati.conteggi.sotto_scorta > 0 ? 'avviso' : 'ok'}
        />
        <SchedaKpi
          etichetta="Giacenza morta"
          valore={formatQty(dati.conteggi.morta)}
          dettaglio={`Nessuna uscita da ${giorniMorta} giorni`}
          evidenza={dati.conteggi.morta > 0 ? 'avviso' : 'neutro'}
        />
        {vedeCosti ? (
          <SchedaKpi
            etichetta="Capitale fermo"
            valore={formatCents(dati.valoreMortoCents)}
            dettaglio="Valore della sola giacenza morta"
          />
        ) : (
          <SchedaKpi
            etichetta="Regolari"
            valore={formatQty(dati.conteggi.regolare)}
            dettaglio="Sopra la scorta minima e movimentati"
            evidenza="ok"
          />
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Articoli da guardare</h2>
        {daVedere.length === 0 ? (
          <Vuoto testo="Nessun articolo esaurito, sotto scorta o fermo." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th>Categoria</Th>
                <Th>Stato</Th>
                <Th className="text-right">Giacenza</Th>
                <Th className="text-right">Disponibile</Th>
                <Th className="text-right">Minima</Th>
                <Th className="text-right">Ultima uscita</Th>
                {vedeCosti && <Th className="text-right">Valore</Th>}
              </tr>
            </thead>
            <tbody>
              {daVedere.slice(0, LIMITE_SCHERMO).map((r) => (
                <tr key={r.productId}>
                  <Td className="font-mono text-xs">{r.sku}</Td>
                  <Td>{r.nome}</Td>
                  <Td>{r.categoria}</Td>
                  <Td>
                    <Badge
                      tone={
                        r.stato === 'esaurito'
                          ? 'errore'
                          : r.stato === 'sotto_scorta'
                            ? 'avviso'
                            : 'neutro'
                      }
                    >
                      {ETICHETTE_STATO[r.stato]}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <StockIndicator
                      qty={r.giacenza}
                      minStock={r.minStock}
                      suffix={UOM_LABELS[r.uom]}
                    />
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.disponibile)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.minStock)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.ultimaUscita ? (
                      <>
                        {formatDate(r.ultimaUscita)}
                        {r.giorniDaUltimaUscita != null && (
                          <span className="ml-1 text-fg-muted">
                            ({r.giorniDaUltimaUscita} gg)
                          </span>
                        )}
                      </>
                    ) : (
                      <NonCalcolabile titolo="Nessuna uscita mai registrata" />
                    )}
                  </Td>
                  {vedeCosti && (
                    <Td className="text-right tabular-nums">{formatCents(r.valoreCents)}</Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {daVedere.length > LIMITE_SCHERMO && (
          <p className="mt-2 text-sm text-fg-muted">
            Mostrati i primi {LIMITE_SCHERMO} articoli di {daVedere.length}, ordinati per valore.
            L’esportazione CSV contiene tutti i prodotti attivi.
          </p>
        )}
      </section>

      <Metodo
        definizione={DEFINIZIONI.scorte}
        periodo={periodo}
        aggiunte={
          <>
            <Voce etichetta="Precedenza degli stati">
              Uno stato per articolo, in quest’ordine: esaurito, sotto scorta, giacenza
              morta, regolare. Un articolo esaurito non è anche «morto»: senza pezzi non c’è
              capitale fermo.
            </Voce>
            <Voce etichetta="Soglia impostata">
              Giacenza morta = nessuna uscita da {giorniMorta} giorni (valore modificabile nel
              filtro, da 7 a 730). Cambiare la soglia cambia i conteggi: va letta insieme ai
              numeri.
            </Voce>
            <Voce etichetta="Periodo">
              La giacenza è quella odierna: il filtro del periodo non la cambia. Serve solo a
              mantenere coerenti i collegamenti fra le schermate.
            </Voce>
          </>
        }
      />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
