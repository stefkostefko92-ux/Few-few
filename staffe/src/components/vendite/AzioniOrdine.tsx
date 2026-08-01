'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SalesOrderStatus } from '@prisma/client';
import { Button, Field, Textarea } from '@/components/ui';
import { invia } from './client';

/**
 * Azioni di stato dell'ordine. Ogni pulsante è solo un'intenzione: la
 * transizione, l'impegno della merce e i controlli sono del server, che rifiuta
 * anche l'ordine arrivato per una strada diversa dall'interfaccia.
 */
export function AzioniOrdine({
  ordineId,
  status,
  puoVendere,
  puoPrelevare,
}: {
  ordineId: string;
  status: SalesOrderStatus;
  puoVendere: boolean;
  puoPrelevare: boolean;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [chiedeMotivo, setChiedeMotivo] = useState(false);

  const confermabile = status === 'BOZZA' || status === 'PREVENTIVO';
  const annullabile =
    status === 'BOZZA' ||
    status === 'PREVENTIVO' ||
    status === 'CONFERMATO' ||
    status === 'IN_PRELIEVO';
  const prelevabile = status === 'CONFERMATO' || status === 'IN_PRELIEVO';

  async function esegui(nome: string, azione: () => Promise<void>) {
    setErrore(null);
    setAttesa(nome);
    try {
      await azione();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setAttesa(null);
    }
  }

  return (
    <div className="space-y-3 no-print">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {puoVendere && confermabile && (
          <Button
            type="button"
            disabled={attesa !== null}
            onClick={() =>
              esegui('conferma', async () => {
                await invia(`/api/vendite/${ordineId}/conferma`, 'POST', {});
                router.refresh();
              })
            }
          >
            {attesa === 'conferma' ? 'Conferma in corso…' : 'Conferma ordine'}
          </Button>
        )}

        {puoPrelevare && prelevabile && (
          <Button
            type="button"
            variant="secondario"
            disabled={attesa !== null}
            onClick={() =>
              esegui('prelievo', async () => {
                const lista = await invia<{ id: string }>('/api/prelievi', 'POST', {
                  salesOrderId: ordineId,
                });
                router.push(`/prelievi/${lista.id}`);
              })
            }
          >
            {attesa === 'prelievo' ? 'Generazione…' : 'Genera lista di prelievo'}
          </Button>
        )}

        {puoVendere && annullabile && !chiedeMotivo && (
          <Button type="button" variant="pericolo" onClick={() => setChiedeMotivo(true)}>
            Annulla ordine
          </Button>
        )}
      </div>

      {puoVendere && annullabile && chiedeMotivo && (
        <div className="max-w-md space-y-2 rounded border border-border p-3">
          <Field
            label="Motivo dell’annullamento"
            htmlFor="motivo-annullamento"
            required
            hint="Resta nella traccia di controllo: l’impegno della merce viene liberato."
          >
            <Textarea
              id="motivo-annullamento"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="pericolo"
              disabled={motivo.trim().length < 3 || attesa !== null}
              onClick={() =>
                esegui('annulla', async () => {
                  await invia(`/api/vendite/${ordineId}/annulla`, 'POST', {
                    motivo: motivo.trim(),
                  });
                  setChiedeMotivo(false);
                  setMotivo('');
                  router.refresh();
                })
              }
            >
              {attesa === 'annulla' ? 'Annullamento…' : 'Conferma annullamento'}
            </Button>
            <Button type="button" variant="fantasma" onClick={() => setChiedeMotivo(false)}>
              Torna indietro
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
