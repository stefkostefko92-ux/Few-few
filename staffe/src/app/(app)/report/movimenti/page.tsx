import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatQty } from '@/lib/money';
import { MOVEMENT_LABELS, UOM_LABELS } from '@/lib/labels';
import { PageHeader, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  BarreOrizzontali,
  FiltroPeriodo,
  LinkEsportaCsv,
  Metodo,
  NonCalcolabile,
  PiedeStampa,
  SchedaKpi,
  StileStampa,
  Vuoto,
} from '@/components/report';
import { PulsanteStampa } from '@/components/report/PulsanteStampa';
import { DEFINIZIONI, formatDecimale, periodoDaParametri } from '@/lib/report';
import { datiMovimenti } from '../_dati';

export const metadata: Metadata = { title: 'Movimenti e rotazione' };

const LIMITE_SCHERMO = 200;

export default async function PaginaMovimenti({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }

  const sp = await searchParams;
  const periodo = periodoDaParametri(sp, '30g');
  const dati = await datiMovimenti(periodo);
  const righe = dati.righe.slice(0, LIMITE_SCHERMO);

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Movimenti e rotazione"
        description={`Entrate, uscite e rotazione per prodotto · ${periodo.etichetta}`}
        actions={
          <>
            <LinkEsportaCsv report="movimenti" periodo={periodo} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/movimenti" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Movimenti registrati"
          valore={formatQty(dati.totaleMovimenti)}
          dettaglio="Tutte le causali, trasferimenti inclusi"
        />
        <SchedaKpi
          etichetta="Pezzi entrati"
          valore={formatQty(dati.totaleEntrate)}
          dettaglio="Movimenti con ubicazione di destinazione"
        />
        <SchedaKpi
          etichetta="Pezzi usciti"
          valore={formatQty(dati.totaleUscite)}
          dettaglio="Movimenti con ubicazione di partenza"
        />
        <SchedaKpi
          etichetta="Saldo del periodo"
          valore={formatQty(dati.totaleEntrate - dati.totaleUscite)}
          dettaglio="Entrate − uscite (esclusi i trasferimenti)"
          evidenza={dati.totaleEntrate - dati.totaleUscite < 0 ? 'avviso' : 'neutro'}
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Movimenti per causale</h2>
        <BarreOrizzontali
          intestazione="Causale"
          intestazioneValore="Movimenti"
          voci={dati.perTipo.map((t) => ({
            etichetta: `${MOVEMENT_LABELS[t.tipo]} — ${formatQty(t.pezzi)} pz`,
            valore: t.movimenti,
            testo: formatQty(t.movimenti),
          }))}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Dettaglio per prodotto</h2>
        {righe.length === 0 ? (
          <Vuoto testo="Nessun movimento nel periodo selezionato." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Prodotto</Th>
                <Th className="text-right">Entrate</Th>
                <Th className="text-right">Uscite</Th>
                <Th className="text-right">Saldo</Th>
                <Th className="text-right">Movimenti</Th>
                <Th className="text-right">Giacenza oggi</Th>
                <Th className="text-right">Rotazione</Th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.productId}>
                  <Td className="font-mono text-xs">{r.sku}</Td>
                  <Td>{r.nome}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.entrate)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.uscite)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.saldo)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(r.numeroMovimenti)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatQty(r.giacenza)} {UOM_LABELS[r.uom]}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.rotazione == null ? (
                      <NonCalcolabile titolo="Giacenza attuale a zero: la rotazione non è definita" />
                    ) : (
                      formatDecimale(r.rotazione, 2)
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {dati.righe.length > LIMITE_SCHERMO && (
          <p className="mt-2 text-sm text-fg-muted">
            Mostrati i primi {LIMITE_SCHERMO} prodotti di {dati.righe.length}, ordinati per pezzi
            usciti. L&apos;esportazione CSV contiene l&apos;elenco completo.
          </p>
        )}
      </section>

      <Metodo definizione={DEFINIZIONI.movimenti} periodo={periodo} />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
