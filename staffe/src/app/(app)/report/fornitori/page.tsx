import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatQty } from '@/lib/money';
import { Badge, PageHeader, Table, Td, Th } from '@/components/ui';
import {
  AccessoNegato,
  Avvertenza,
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
  formatDecimale,
  formatPercento,
  mediaOppureNull,
  periodoDaParametri,
} from '@/lib/report';
import { datiFornitori } from '../_dati';

export const metadata: Metadata = { title: 'Prestazione dei fornitori' };

/** Sotto questo numero di ordini la media è troppo instabile per decidere. */
const ORDINI_MINIMI_AFFIDABILI = 3;

export default async function PaginaFornitori({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'report:leggi')) {
    return <AccessoNegato cosa="i report" />;
  }

  const sp = await searchParams;
  const periodo = periodoDaParametri(sp, 'anno');
  const righe = await datiFornitori(periodo);

  const ordiniTotali = righe.reduce((a, r) => a + r.ordiniRicevuti, 0);
  const completiTotali = righe.reduce((a, r) => a + r.ordiniCompleti, 0);
  const conPrevista = righe.reduce((a, r) => a + r.ordiniConDataPrevista, 0);
  const inRitardo = righe.reduce((a, r) => a + r.ordiniInRitardo, 0);
  const leadTimeMedio = mediaOppureNull(
    righe.flatMap((r) => (r.leadTimeMedio == null ? [] : [r.leadTimeMedio])),
  );
  const pochiDati = righe.filter((r) => r.ordiniRicevuti < ORDINI_MINIMI_AFFIDABILI).length;

  return (
    <div className="report-stampa">
      <StileStampa />
      <PageHeader
        title="Prestazione dei fornitori"
        description={`Lead time reale, completezza e puntualità · ${periodo.etichetta}`}
        actions={
          <>
            <LinkEsportaCsv report="fornitori" periodo={periodo} />
            <PulsanteStampa />
          </>
        }
      />

      <FiltroPeriodo periodo={periodo} azione="/report/fornitori" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SchedaKpi
          etichetta="Ordini ricevuti"
          valore={formatQty(ordiniTotali)}
          dettaglio={`${righe.length} fornitori nel periodo`}
        />
        <SchedaKpi
          etichetta="Lead time medio"
          valore={leadTimeMedio == null ? '—' : `${formatDecimale(leadTimeMedio, 1)} gg`}
          dettaglio="Media delle medie per fornitore"
        />
        <SchedaKpi
          etichetta="Ordini completi"
          valore={formatPercento(ordiniTotali === 0 ? null : completiTotali / ordiniTotali)}
          dettaglio={`${completiTotali} su ${ordiniTotali}`}
        />
        <SchedaKpi
          etichetta="Puntualità"
          valore={formatPercento(conPrevista === 0 ? null : (conPrevista - inRitardo) / conPrevista)}
          dettaglio={`${inRitardo} in ritardo su ${conPrevista} con data prevista`}
          evidenza={inRitardo > 0 ? 'avviso' : 'ok'}
        />
      </div>

      {pochiDati > 0 && (
        <Avvertenza>
          {pochiDati} fornitori hanno meno di {ORDINI_MINIMI_AFFIDABILI} ordini ricevuti nel
          periodo: le loro medie sono indicative, non una misura della prestazione. La colonna
          «ordini» va letta insieme al lead time.
        </Avvertenza>
      )}

      <section className="mt-8">
        {righe.length === 0 ? (
          <Vuoto testo="Nessun ordine ricevuto nel periodo selezionato." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fornitore</Th>
                <Th className="text-right">Ordini</Th>
                <Th className="text-right">Lead time reale</Th>
                <Th className="text-right">Dichiarato</Th>
                <Th className="text-right">Scostamento</Th>
                <Th className="text-right">Completi</Th>
                <Th className="text-right">Puntuali</Th>
                <Th className="text-right">Ritardo medio</Th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.fornitoreId}>
                  <Td>
                    {r.nome}
                    {r.ordiniRicevuti < ORDINI_MINIMI_AFFIDABILI && (
                      <>
                        {' '}
                        <Badge tone="neutro">pochi dati</Badge>
                      </>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{formatQty(r.ordiniRicevuti)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.leadTimeMedio == null ? (
                      <NonCalcolabile titolo="Manca la data d’ordine o di ricevimento" />
                    ) : (
                      `${formatDecimale(r.leadTimeMedio, 1)} gg`
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{r.leadTimeDichiarato} gg</Td>
                  <Td className="text-right tabular-nums">
                    {r.scostamentoLeadTime == null ? (
                      <NonCalcolabile />
                    ) : (
                      <span className={r.scostamentoLeadTime > 0 ? 'text-danger' : 'text-ok'}>
                        {r.scostamentoLeadTime > 0 ? '+' : ''}
                        {formatDecimale(r.scostamentoLeadTime, 1)} gg{' '}
                        <span className="sr-only">
                          {r.scostamentoLeadTime > 0
                            ? 'più lento del dichiarato'
                            : 'più veloce del dichiarato'}
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatPercento(r.quotaCompleti)}{' '}
                    <span className="text-fg-muted">({r.ordiniCompleti})</span>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.quotaPuntuali == null ? (
                      <NonCalcolabile titolo="Nessun ordine con data prevista" />
                    ) : (
                      formatPercento(r.quotaPuntuali)
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.ritardoMedio == null ? (
                      <NonCalcolabile titolo="Nessun ritardo registrato" />
                    ) : (
                      `${formatDecimale(r.ritardoMedio, 1)} gg`
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <Metodo
        definizione={DEFINIZIONI.fornitori}
        periodo={periodo}
        aggiunte={
          <Voce etichetta="Scostamento">
            Scostamento = lead time reale − lead time dichiarato in anagrafica. Positivo = il
            fornitore consegna più tardi di quanto promette, e il punto di riordino calcolato sul
            dichiarato è ottimista.
          </Voce>
        }
      />
      <PiedeStampa periodo={periodo} />
    </div>
  );
}
