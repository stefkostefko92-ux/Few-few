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
  Sparkline,
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
import { datiVendite } from '../_dati';

export const metadata: Metadata = { title: 'Report vendite' };

const LIMITE_SCHERMO = 100;

export default async function PaginaVendite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi') || !can(user.role, 'vendite:leggi')) {
    return <AccessoNegato cosa="il report delle vendite" />;
  }
  const vedeCosti = can(user.role, 'costi:leggi');

  const sp = await searchParams;
  const periodo = periodoDaParametri(sp, '30g');
  const precedente = periodoPrecedente(periodo);
  const [dati, datiPrec] = await Promise.all([
    datiVendite(periodo, { conCosti: vedeCosti }),
    periodo.da ? datiVendite(precedente, { conCosti: false }) : null,
  ]);

  const serie = dati.perGiorno.map((g) => g.fatturatoCents);

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Report vendite"
        description={`Fatturato imponibile degli ordini · ${periodo.etichetta}`}
        actions={
          <>
            <LinkEsportaCsv report="vendite" periodo={periodo} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/vendite" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Fatturato (imponibile)"
          valore={formatCents(dati.fatturatoCents)}
          dettaglio={
            datiPrec ? (
              <Variazione
                rapporto={variazione(dati.fatturatoCents, datiPrec.fatturatoCents)}
              />
            ) : (
              'Nessun periodo precedente da confrontare'
            )
          }
        />
        <SchedaKpi
          etichetta="Ordini"
          valore={formatQty(dati.numeroOrdini)}
          dettaglio={
            datiPrec ? (
              <Variazione rapporto={variazione(dati.numeroOrdini, datiPrec.numeroOrdini)} />
            ) : undefined
          }
        />
        <SchedaKpi
          etichetta="Ordine medio"
          valore={dati.ordineMedioCents == null ? '—' : formatCents(dati.ordineMedioCents)}
          dettaglio="Fatturato ÷ numero di ordini"
        />
        {vedeCosti ? (
          <SchedaKpi
            etichetta="Margine lordo"
            valore={formatCents(dati.margineCents)}
            dettaglio={`${formatPercento(dati.marginePercento)} sul fatturato · costo al medio ponderato`}
            evidenza={dati.margineCents < 0 ? 'errore' : 'ok'}
          />
        ) : (
          <SchedaKpi
            etichetta="Pezzi venduti"
            valore={formatQty(dati.pezzi)}
            dettaglio="Somma delle quantità di riga"
          />
        )}
      </div>

      {serie.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Andamento giornaliero</h2>
          <Sparkline
            valori={serie}
            descrizione={`${serie.length} giorni con ordini · massimo ${formatCents(
              Math.max(...serie),
            )}, minimo ${formatCents(Math.min(...serie))}. I giorni senza ordini non compaiono.`}
          />
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Per categoria</h2>
          <BarreOrizzontali
            intestazione="Categoria"
            intestazioneValore="Fatturato"
            voci={dati.perCategoria.map((c) => ({
              etichetta: `${c.categoria} — ${formatQty(c.pezzi)} pz`,
              valore: c.fatturatoCents,
              testo: formatCents(c.fatturatoCents),
            }))}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Prodotti più venduti</h2>
          <BarreOrizzontali
            intestazione="Prodotto"
            intestazioneValore="Pezzi"
            voci={dati.perProdotto.slice(0, 10).map((p) => ({
              etichetta: `${p.sku} — ${p.nome}`,
              valore: p.pezzi,
              testo: `${formatQty(p.pezzi)} · ${formatCents(p.fatturatoCents)}`,
            }))}
          />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Per cliente</h2>
        {dati.perCliente.length === 0 ? (
          <Vuoto testo="Nessun ordine nel periodo selezionato." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="text-right">Ordini</Th>
                <Th className="text-right">Pezzi</Th>
                <Th className="text-right">Fatturato</Th>
                <Th className="text-right">Quota</Th>
              </tr>
            </thead>
            <tbody>
              {dati.perCliente.slice(0, LIMITE_SCHERMO).map((c) => (
                <tr key={c.nome}>
                  <Td>{c.nome}</Td>
                  <Td className="text-right tabular-nums">{formatQty(c.ordini)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(c.pezzi)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(c.fatturatoCents)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatPercento(
                      dati.fatturatoCents === 0 ? null : c.fatturatoCents / dati.fatturatoCents,
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Metodo
        definizione={DEFINIZIONI.vendite}
        periodo={periodo}
        aggiunte={
          <>
            {datiPrec && (
              <Voce etichetta="Confronto">
                Periodo precedente di pari durata: {precedente.etichetta} — fatturato{' '}
                {formatCents(datiPrec.fatturatoCents)} su {datiPrec.numeroOrdini} ordini.
              </Voce>
            )}
            {vedeCosti && (
              <Voce etichetta="Margine">
                Margine lordo = fatturato − (quantità venduta × costo medio ponderato dei
                ricevimenti; se assente, costo di anagrafica). Non comprende spese generali,
                trasporto né manodopera: è un margine di primo livello.
              </Voce>
            )}
            <Voce etichetta="Dati personali">
              Il report riporta il solo nome del cliente. Indirizzi, PEC, partite IVA e recapiti
              non vengono letti né esportati.
            </Voce>
          </>
        }
      />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
