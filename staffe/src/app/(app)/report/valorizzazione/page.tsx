import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatCents, formatQty } from '@/lib/money';
import { UOM_LABELS } from '@/lib/labels';
import { Badge, PageHeader, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  Avvertenza,
  BarreOrizzontali,
  FiltroPeriodo,
  LinkEsportaCsv,
  Metodo,
  PiedeStampa,
  SchedaKpi,
  StileStampa,
  Vuoto,
} from '@/components/report';
import { PulsanteStampa } from '@/components/report/PulsanteStampa';
import { DEFINIZIONI, formatPercento, periodoDaParametri, quota } from '@/lib/report';
import { datiValorizzazione } from '../_dati';

export const metadata: Metadata = { title: 'Valorizzazione del magazzino' };

/** Oltre questa soglia la tabella a schermo si ferma: il CSV contiene tutto. */
const LIMITE_SCHERMO = 200;

export default async function PaginaValorizzazione({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }
  if (!can(user.role, 'costi:leggi')) {
    return <AccessoNegato cosa="la valorizzazione del magazzino (contiene i costi d'acquisto)" />;
  }

  const sp = await searchParams;
  // Predefinito «tutto lo storico»: il costo medio ponderato è tanto più stabile
  // quanti più ricevimenti entrano nella media.
  const periodo = periodoDaParametri(sp, 'tutto');
  const dati = await datiValorizzazione(periodo);
  const righeMostrate = dati.righe.filter((r) => r.giacenza !== 0).slice(0, LIMITE_SCHERMO);
  const conGiacenza = dati.righe.filter((r) => r.giacenza !== 0).length;

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Valorizzazione del magazzino"
        description={`Metodo: costo medio ponderato dai ricevimenti · ${periodo.etichetta}`}
        actions={
          <>
            <LinkEsportaCsv report="valorizzazione" periodo={periodo} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/valorizzazione" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Valore del magazzino"
          valore={formatCents(dati.totaleValoreCents)}
          dettaglio="Giacenza × costo medio ponderato"
        />
        <SchedaKpi
          etichetta="Pezzi a magazzino"
          valore={formatQty(dati.totalePezzi)}
          dettaglio={`${conGiacenza} prodotti con giacenza`}
        />
        <SchedaKpi
          etichetta="Costo da movimenti"
          valore={formatPercento(quota(dati.fonti.movimenti, dati.righe.length))}
          dettaglio={`${dati.fonti.movimenti} prodotti su ${dati.righe.length}`}
        />
        <SchedaKpi
          etichetta="Costo da anagrafica"
          valore={formatPercento(quota(dati.fonti.anagrafica, dati.righe.length))}
          dettaglio={`${dati.fonti.anagrafica} prodotti · ${dati.fonti.assente} senza alcun costo`}
          evidenza={dati.fonti.assente > 0 ? 'avviso' : 'neutro'}
        />
      </div>

      {dati.fonti.assente > 0 && (
        <Avvertenza>
          {dati.fonti.assente} prodotti non hanno né un ricevimento valorizzato né un costo in
          anagrafica: entrano nel totale con valore zero. Il valore del magazzino qui sopra è
          quindi una <strong>sottostima</strong>, non un dato completo.
        </Avvertenza>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Valore per categoria</h2>
        <BarreOrizzontali
          intestazione="Categoria"
          intestazioneValore="Valore"
          voci={dati.perCategoria.map((c) => ({
            etichetta: `${c.categoria} — ${formatQty(c.pezzi)} pz`,
            valore: c.valoreCents,
            testo: formatCents(c.valoreCents),
          }))}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Dettaglio per prodotto</h2>
        {righeMostrate.length === 0 ? (
          <Vuoto testo="Nessun prodotto con giacenza." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th>Categoria</Th>
                <Th className="text-right">Giacenza</Th>
                <Th className="text-right">Impegnata</Th>
                <Th className="text-right">Costo unitario</Th>
                <Th>Fonte del costo</Th>
                <Th className="text-right">Valore</Th>
              </tr>
            </thead>
            <tbody>
              {righeMostrate.map((r) => (
                <tr key={r.productId}>
                  <Td className="font-mono text-xs">{r.sku}</Td>
                  <Td>{r.nome}</Td>
                  <Td>{r.categoria}</Td>
                  <Td className="text-right tabular-nums">
                    {formatQty(r.giacenza)} {UOM_LABELS[r.uom]}
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.impegnata)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(r.costoUnitarioCents)}</Td>
                  <Td>
                    {r.fonteCosto === 'movimenti' && <Badge tone="ok">Ricevimenti</Badge>}
                    {r.fonteCosto === 'anagrafica' && <Badge tone="avviso">Anagrafica</Badge>}
                    {r.fonteCosto === 'assente' && <Badge tone="errore">Assente</Badge>}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatCents(r.valoreCents)}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold">Totale</Td>
                <Td>&nbsp;</Td>
                <Td>&nbsp;</Td>
                <Td className="text-right font-semibold tabular-nums">
                  {formatQty(dati.totalePezzi)}
                </Td>
                <Td>&nbsp;</Td>
                <Td>&nbsp;</Td>
                <Td>&nbsp;</Td>
                <Td className="text-right font-semibold tabular-nums">
                  {formatCents(dati.totaleValoreCents)}
                </Td>
              </tr>
            </tbody>
          </Table>
        )}
        {conGiacenza > LIMITE_SCHERMO && (
          <p className="mt-2 text-sm text-fg-muted">
            Mostrati i primi {LIMITE_SCHERMO} prodotti di {conGiacenza}. Il totale in alto è
            calcolato su tutti; l&apos;esportazione CSV contiene l&apos;elenco completo.
          </p>
        )}
      </section>

      <Metodo definizione={DEFINIZIONI.valorizzazione} periodo={periodo} />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
