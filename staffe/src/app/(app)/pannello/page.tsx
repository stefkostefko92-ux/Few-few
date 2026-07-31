import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { formatCents, formatQty } from '@/lib/money';
import { formatDateTime, MOVEMENT_LABELS } from '@/lib/labels';
import { Card, PageHeader, Table, Td, Th } from '@/components/ui';
import {
  BarreOrizzontali,
  Metodo,
  SchedaKpi,
  Variazione,
  Voce,
  Vuoto,
} from '@/components/report';
import { DEFINIZIONI, meseCorrenteEPrecedente, variazione } from '@/lib/report';
import { datiCruscotto } from '../report/_dati';

export const metadata: Metadata = { title: 'Cruscotto' };

/**
 * Cruscotto — la prima schermata dopo l'accesso.
 *
 * Mostra solo ciò che il ruolo può vedere: valorizzazione e margini stanno
 * dietro `costi:leggi` (il magazziniere non vede quanto guadagna l'azienda su
 * ogni staffa), le vendite dietro `vendite:leggi`. Ogni riquadro dichiara il
 * periodo a cui si riferisce: un numero senza periodo non è confrontabile.
 */
export default async function PaginaPannello() {
  const user = await getSessionUser();
  if (!user) redirect('/accesso');

  const vedeCosti = can(user.role, 'costi:leggi');
  const vedeVendite = can(user.role, 'vendite:leggi');
  const vedeReport = can(user.role, 'report:leggi');

  const { corrente, precedente } = meseCorrenteEPrecedente();
  const dati = await datiCruscotto({
    mese: corrente,
    mesePrecedente: precedente,
    vedeCosti,
    vedeVendite,
  });

  return (
    <>
      <PageHeader
        title={`Ciao, ${user.name}`}
        description="Stato del magazzino, ordini aperti e andamento del mese."
      />

      {/* Magazzino */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Magazzino</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SchedaKpi
            etichetta="Pezzi a magazzino"
            valore={formatQty(dati.giacenzaTotale)}
            dettaglio={`${dati.prodottiAttivi} prodotti attivi`}
            href="/giacenze"
          />
          {vedeCosti && (
            <SchedaKpi
              etichetta="Valorizzazione"
              valore={formatCents(dati.valorizzazioneCents ?? 0)}
              dettaglio="Costo medio ponderato dai ricevimenti"
              href={vedeReport ? '/report/valorizzazione' : undefined}
            />
          )}
          <SchedaKpi
            etichetta="Sotto scorta"
            valore={formatQty(dati.sottoScorta)}
            dettaglio="Giacenza ≤ scorta minima"
            evidenza={dati.sottoScorta > 0 ? 'avviso' : 'ok'}
            href="/giacenze?stato=sotto"
          />
          <SchedaKpi
            etichetta="Esauriti"
            valore={formatQty(dati.esauriti)}
            dettaglio="Giacenza a zero"
            evidenza={dati.esauriti > 0 ? 'errore' : 'ok'}
            href="/giacenze?stato=esaurito"
          />
        </div>
      </section>

      {/* Lavoro aperto */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Da lavorare adesso</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SchedaKpi
            etichetta="Ordini di acquisto aperti"
            valore={formatQty(dati.acquistiAperti)}
            dettaglio="Ordinati o ricevuti solo in parte"
            href="/acquisti"
          />
          <SchedaKpi
            etichetta="Merce in arrivo"
            valore={formatQty(dati.merceInArrivo)}
            dettaglio="Pezzi ordinati e non ancora ricevuti"
            href="/ricevimenti"
          />
          <SchedaKpi
            etichetta="Ordini di vendita aperti"
            valore={formatQty(dati.venditeAperte)}
            dettaglio="Confermati, in prelievo o imballati"
            href="/vendite"
          />
          <SchedaKpi
            etichetta="Spedizioni pronte"
            valore={formatQty(dati.spedizioniPronte)}
            dettaglio="Ordini imballati in attesa di partire"
            evidenza={dati.spedizioniPronte > 0 ? 'avviso' : 'neutro'}
            href="/spedizioni"
          />
        </div>
        {dati.notificheNonLette > 0 && (
          <p className="mt-3 text-sm">
            <Link href="/notifiche" className="font-medium text-brand hover:underline">
              {dati.notificheNonLette} notifiche da leggere
            </Link>
          </p>
        )}
      </section>

      {/* Mese corrente */}
      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold">Mese corrente</h2>
        <p className="mb-3 text-sm text-fg-muted">
          {corrente.etichetta} confrontato con {precedente.etichetta}: lo stesso numero di
          giorni, altrimenti il calo sarebbe solo un effetto del calendario.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {vedeVendite && (
            <>
              <SchedaKpi
                etichetta="Fatturato del mese"
                valore={formatCents(dati.venditeMese.fatturatoCents)}
                dettaglio={
                  <Variazione
                    rapporto={variazione(
                      dati.venditeMese.fatturatoCents,
                      dati.venditeMesePrecedente.fatturatoCents,
                    )}
                  />
                }
                href={vedeReport ? '/report/vendite?periodo=mese' : undefined}
              />
              <SchedaKpi
                etichetta="Ordini di vendita"
                valore={formatQty(dati.venditeMese.ordini)}
                dettaglio={
                  <Variazione
                    rapporto={variazione(
                      dati.venditeMese.ordini,
                      dati.venditeMesePrecedente.ordini,
                    )}
                  />
                }
              />
            </>
          )}
          {vedeCosti && (
            <>
              <SchedaKpi
                etichetta="Acquisti del mese"
                valore={formatCents(dati.acquistiMese.spesaCents)}
                dettaglio={
                  <Variazione
                    rapporto={variazione(
                      dati.acquistiMese.spesaCents,
                      dati.acquistiMesePrecedente.spesaCents,
                    )}
                    invertiTono
                  />
                }
                href={vedeReport ? '/report/acquisti?periodo=mese' : undefined}
              />
              <SchedaKpi
                etichetta="Ordini di acquisto"
                valore={formatQty(dati.acquistiMese.ordini)}
                dettaglio={
                  <Variazione
                    rapporto={variazione(
                      dati.acquistiMese.ordini,
                      dati.acquistiMesePrecedente.ordini,
                    )}
                    invertiTono
                  />
                }
              />
            </>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {vedeVendite && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Prodotti più venduti del mese</h2>
            <BarreOrizzontali
              intestazione="Prodotto"
              intestazioneValore="Pezzi"
              vuoto="Nessuna vendita registrata questo mese."
              voci={dati.piuVenduti.map((p) => ({
                etichetta: `${p.sku} — ${p.nome}`,
                valore: p.pezzi,
                testo: vedeCosti
                  ? `${formatQty(p.pezzi)} · ${formatCents(p.fatturatoCents)}`
                  : formatQty(p.pezzi),
              }))}
            />
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Ultimi movimenti</h2>
          {dati.ultimiMovimenti.length === 0 ? (
            <Vuoto testo="Nessun movimento registrato." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Causale</Th>
                  <Th>Prodotto</Th>
                  <Th className="text-right">Q.tà</Th>
                  <Th>Operatore</Th>
                </tr>
              </thead>
              <tbody>
                {dati.ultimiMovimenti.map((m) => (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(m.createdAt)}</Td>
                    <Td>{MOVEMENT_LABELS[m.tipo]}</Td>
                    <Td>
                      <span className="font-mono text-xs">{m.sku}</span> — {m.nome}
                    </Td>
                    <Td className="text-right tabular-nums">{formatQty(m.qty)}</Td>
                    <Td className="text-xs text-fg-muted">{m.utente ?? 'sistema'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-2 text-sm">
            <Link href="/giacenze/movimenti" className="text-brand hover:underline">
              Tutti i movimenti
            </Link>
          </p>
        </section>
      </div>

      {!vedeCosti && (
        <Card className="mt-8">
          <p className="text-sm text-fg-muted">
            Valorizzazione, costi e margini non sono visibili al tuo ruolo. Questo non cambia i
            numeri di magazzino qui sopra: sono gli stessi per tutti.
          </p>
        </Card>
      )}

      {vedeReport && (
        <Metodo
          definizione={DEFINIZIONI.cruscotto}
          aggiunte={
            <Voce etichetta="Dove sono le definizioni complete">
              Ogni riquadro rimanda al report corrispondente, dove il metodo è scritto per
              esteso. Le definizioni vivono in un solo posto (<code>src/lib/report.ts</code>):
              cruscotto, report ed esportazioni contano la stessa cosa.
            </Voce>
          }
        />
      )}
    </>
  );
}
