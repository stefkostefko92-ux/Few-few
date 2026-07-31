import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatCents, formatQty } from '@/lib/money';
import { PageHeader, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  BarreOrizzontali,
  FiltroPeriodo,
  LinkEsportaCsv,
  Metodo,
  PiedeStampa,
  SchedaKpi,
  StileStampa,
  Variazione,
  Voce,
  Vuoto,
} from '@/components/report';
import { PulsanteStampa } from '@/components/report/PulsanteStampa';
import {
  DEFINIZIONI,
  formatPercento,
  periodoDaParametri,
  periodoPrecedente,
  variazione,
} from '@/lib/report';
import { datiAcquisti } from '../_dati';

export const metadata: Metadata = { title: 'Report acquisti' };

export default async function PaginaAcquisti({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }
  if (!can(user.role, 'costi:leggi')) {
    return <AccessoNegato cosa="il report degli acquisti (contiene i costi d'acquisto)" />;
  }

  const sp = await searchParams;
  const periodo = periodoDaParametri(sp, '30g');
  const precedente = periodoPrecedente(periodo);
  const [dati, datiPrec] = await Promise.all([
    datiAcquisti(periodo),
    periodo.da ? datiAcquisti(precedente) : null,
  ]);

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Report acquisti"
        description={`Spesa imponibile degli ordini di acquisto · ${periodo.etichetta}`}
        actions={
          <>
            <LinkEsportaCsv report="acquisti" periodo={periodo} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/acquisti" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Spesa (imponibile)"
          valore={formatCents(dati.spesaCents)}
          dettaglio={
            datiPrec ? (
              <Variazione
                rapporto={variazione(dati.spesaCents, datiPrec.spesaCents)}
                invertiTono
              />
            ) : (
              'Nessun periodo precedente da confrontare'
            )
          }
        />
        <SchedaKpi etichetta="Ordini di acquisto" valore={formatQty(dati.numeroOrdini)} />
        <SchedaKpi
          etichetta="Ordine medio"
          valore={dati.ordineMedioCents == null ? '—' : formatCents(dati.ordineMedioCents)}
          dettaglio="Spesa ÷ numero di ordini"
        />
        <SchedaKpi
          etichetta="Pezzi ordinati"
          valore={formatQty(dati.pezzi)}
          dettaglio="Quantità ordinata, non quella ricevuta"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Spesa per fornitore</h2>
        {dati.perFornitore.length === 0 ? (
          <Vuoto testo="Nessun ordine di acquisto nel periodo selezionato." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fornitore</Th>
                <Th className="text-right">Ordini</Th>
                <Th className="text-right">Pezzi</Th>
                <Th className="text-right">Trasporto</Th>
                <Th className="text-right">Spesa</Th>
                <Th className="text-right">Quota</Th>
              </tr>
            </thead>
            <tbody>
              {dati.perFornitore.map((f) => (
                <tr key={f.nome}>
                  <Td>{f.nome}</Td>
                  <Td className="text-right tabular-nums">{formatQty(f.ordini)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(f.pezzi)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(f.trasportoCents)}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatCents(f.spesaCents)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatPercento(
                      dati.spesaCents === 0 ? null : f.spesaCents / dati.spesaCents,
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Spesa per categoria</h2>
        <BarreOrizzontali
          intestazione="Categoria"
          intestazioneValore="Spesa"
          voci={dati.perCategoria.map((c) => ({
            etichetta: `${c.categoria} — ${formatQty(c.pezzi)} pz`,
            valore: c.spesaCents,
            testo: formatCents(c.spesaCents),
          }))}
        />
      </section>

      <Metodo
        definizione={DEFINIZIONI.acquisti}
        periodo={periodo}
        aggiunte={
          <>
            <Voce etichetta="Trasporto">
              Le spese di trasporto di testata sono incluse nel totale del fornitore ma non
              nella ripartizione per categoria: non appartengono a una categoria di prodotto.
            </Voce>
            {datiPrec && (
              <Voce etichetta="Confronto">
                Periodo precedente di pari durata: {precedente.etichetta} — spesa{' '}
                {formatCents(datiPrec.spesaCents)} su {datiPrec.numeroOrdini} ordini.
              </Voce>
            )}
          </>
        }
      />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
