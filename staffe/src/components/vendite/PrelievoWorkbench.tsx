'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PickListStatus, Uom } from '@prisma/client';
import { UOM_LABELS } from '@/lib/labels';
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { invia } from './client';

export type RigaPrelievo = {
  id: string;
  sortIndex: number;
  qty: number;
  pickedQty: number;
  verified: boolean;
  product: { id: string; sku: string; barcode: string | null; name: string; uom: Uom };
  location: { code: string; zone: string; aisle: string };
};

/**
 * Schermo di lavoro del magazziniere.
 *
 * Testo grande, bersagli da guanti (taglia `lg`, ≥44px) e un solo campo che
 * conta: quello della scansione. Uno scanner fisico digita e preme Invio, quindi
 * se il fuoco è lì il prelievo si fa senza toccare altro.
 */
export function PrelievoWorkbench({
  prelievoId,
  righe: righeIniziali,
  stato,
  puoScrivere,
}: {
  prelievoId: string;
  righe: RigaPrelievo[];
  stato: PickListStatus;
  puoScrivere: boolean;
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [righe, setRighe] = useState(righeIniziali);
  const [codice, setCodice] = useState('');
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null);
  const [attesa, setAttesa] = useState(false);
  const [rigaManuale, setRigaManuale] = useState<string | null>(null);
  const [motivoRiga, setMotivoRiga] = useState('');
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [motivoChiusura, setMotivoChiusura] = useState('');

  const chiusa = stato === 'COMPLETATA' || stato === 'ANNULLATA';
  const daFare = righe.filter((r) => !r.verified && r.pickedQty === 0).length;
  const prelevateSenzaScansione = useMemo(
    () => righe.filter((r) => r.pickedQty > 0 && !r.verified).length,
    [righe],
  );
  const prelevate = righe.filter((r) => r.pickedQty > 0).length;

  function applica(id: string, pickedQty: number, verified: boolean) {
    setRighe((prec) => prec.map((r) => (r.id === id ? { ...r, pickedQty, verified } : r)));
  }

  async function verifica(
    riga: RigaPrelievo,
    corpo: { barcode?: string; pickedQty?: number; motivo?: string },
  ) {
    setAttesa(true);
    setMessaggio(null);
    try {
      const esito = await invia<{ pickedQty: number; verified: boolean }>(
        `/api/prelievi/${prelievoId}/riga/${riga.id}/verifica`,
        'POST',
        corpo,
      );
      applica(riga.id, esito.pickedQty, esito.verified);
      setMessaggio({
        tono: 'ok',
        testo: `${riga.product.sku} · ${riga.location.code} · ${esito.pickedQty} ${
          UOM_LABELS[riga.product.uom]
        }${esito.verified ? ' — verificato con scansione.' : ' — confermato senza scansione.'}`,
      });
    } catch (err) {
      setMessaggio({
        tono: 'errore',
        testo: err instanceof Error ? err.message : 'Errore imprevisto.',
      });
    } finally {
      setAttesa(false);
    }
  }

  async function scansiona(e: React.FormEvent) {
    e.preventDefault();
    const letto = codice.trim();
    setCodice('');
    if (!letto) return;

    const corrispondenti = righe.filter(
      (r) =>
        !r.verified &&
        (r.product.sku.toLowerCase() === letto.toLowerCase() ||
          (r.product.barcode ?? '').toLowerCase() === letto.toLowerCase()),
    );
    const riga = corrispondenti[0];
    if (!riga) {
      setMessaggio({
        tono: 'errore',
        testo: `Codice «${letto}» non corrisponde a nessuna riga ancora da prelevare.`,
      });
      return;
    }
    const richiesta = Number.parseInt(quantita[riga.id] ?? '', 10);
    await verifica(riga, {
      barcode: letto,
      pickedQty: Number.isFinite(richiesta) ? richiesta : riga.qty,
    });
    campo.current?.focus();
  }

  async function completa() {
    setAttesa(true);
    setMessaggio(null);
    try {
      await invia(`/api/prelievi/${prelievoId}/completa`, 'POST', {
        motivoNonVerificate: motivoChiusura.trim() || null,
      });
      router.push(`/prelievi/${prelievoId}/imballaggio`);
      router.refresh();
    } catch (err) {
      setMessaggio({
        tono: 'errore',
        testo: err instanceof Error ? err.message : 'Errore imprevisto.',
      });
      setAttesa(false);
    }
  }

  return (
    <div className="space-y-4">
      {!chiusa && puoScrivere && (
        <Card className="no-print">
          <form onSubmit={scansiona} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor="scansione" className="block text-base font-medium">
                Scansiona il codice del prodotto
              </label>
              <Input
                id="scansione"
                ref={campo}
                autoFocus
                autoComplete="off"
                inputMode="text"
                className="h-14 text-2xl"
                placeholder="Codice a barre o SKU…"
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={attesa}>
              Conferma riga
            </Button>
          </form>
          <p className="mt-2 text-sm text-fg-muted">
            Da prelevare: <strong>{daFare}</strong> · prelevate: <strong>{prelevate}</strong> di{' '}
            {righe.length}
          </p>
        </Card>
      )}

      {messaggio && (
        <p
          role="status"
          className={
            messaggio.tono === 'ok'
              ? 'rounded border border-ok bg-ok/10 px-3 py-3 text-base text-ok'
              : 'rounded border border-danger bg-danger/10 px-3 py-3 text-base text-danger'
          }
        >
          {messaggio.testo}
        </p>
      )}

      <ol className="space-y-3">
        {righe.map((riga, i) => (
          <li key={riga.id}>
            <Card
              className={
                riga.verified
                  ? 'border-ok'
                  : riga.pickedQty > 0
                    ? 'border-warn'
                    : undefined
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-fg-muted">
                    Passo {i + 1} di {righe.length} · zona {riga.location.zone}, corsia{' '}
                    {riga.location.aisle}
                  </p>
                  <p className="text-3xl font-bold tracking-tight">{riga.location.code}</p>
                  <p className="mt-1 text-xl">
                    {riga.qty} {UOM_LABELS[riga.product.uom]} · {riga.product.sku}
                  </p>
                  <p className="text-base text-fg-muted">{riga.product.name}</p>
                </div>
                <div className="text-right">
                  {riga.verified ? (
                    <Badge tone="ok">Verificato con scansione</Badge>
                  ) : riga.pickedQty > 0 ? (
                    <Badge tone="avviso">Confermato senza scansione</Badge>
                  ) : (
                    <Badge tone="neutro">Da prelevare</Badge>
                  )}
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {riga.pickedQty} / {riga.qty}
                  </p>
                </div>
              </div>

              {!chiusa && puoScrivere && (
                <div className="mt-3 flex flex-wrap items-end gap-2 no-print">
                  <div>
                    <label htmlFor={`qta-${riga.id}`} className="block text-sm font-medium">
                      Quantità prelevata
                    </label>
                    <Input
                      id={`qta-${riga.id}`}
                      className="h-12 w-28 text-lg"
                      inputMode="numeric"
                      value={quantita[riga.id] ?? String(riga.qty)}
                      onChange={(e) =>
                        setQuantita((p) => ({ ...p, [riga.id]: e.target.value }))
                      }
                    />
                  </div>
                  {rigaManuale === riga.id ? (
                    <div className="w-full max-w-md space-y-2">
                      <Field
                        label="Perché non è stato scansionato?"
                        htmlFor={`motivo-${riga.id}`}
                        required
                        hint="Etichetta illeggibile, prodotto sfuso, scanner guasto…"
                      >
                        <Textarea
                          id={`motivo-${riga.id}`}
                          value={motivoRiga}
                          onChange={(e) => setMotivoRiga(e.target.value)}
                        />
                      </Field>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="lg"
                          disabled={motivoRiga.trim().length < 5 || attesa}
                          onClick={async () => {
                            const richiesta = Number.parseInt(quantita[riga.id] ?? '', 10);
                            await verifica(riga, {
                              motivo: motivoRiga.trim(),
                              pickedQty: Number.isFinite(richiesta) ? richiesta : riga.qty,
                            });
                            setRigaManuale(null);
                            setMotivoRiga('');
                          }}
                        >
                          Conferma senza scansione
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="fantasma"
                          onClick={() => {
                            setRigaManuale(null);
                            setMotivoRiga('');
                          }}
                        >
                          Annulla
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      variant="secondario"
                      onClick={() => {
                        setRigaManuale(riga.id);
                        setMotivoRiga('');
                      }}
                    >
                      Conferma senza scansione
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {!chiusa && puoScrivere && (
        <Card className="space-y-3 no-print">
          {prelevateSenzaScansione > 0 && (
            <Field
              label={`Motivo: ${prelevateSenzaScansione} righe prelevate senza scansione`}
              htmlFor="motivo-chiusura"
              required
              hint="Obbligatorio per chiudere la lista: resta nella traccia di controllo."
            >
              <Textarea
                id="motivo-chiusura"
                value={motivoChiusura}
                onChange={(e) => setMotivoChiusura(e.target.value)}
              />
            </Field>
          )}
          <Button
            type="button"
            size="lg"
            disabled={
              attesa ||
              prelevate === 0 ||
              (prelevateSenzaScansione > 0 && motivoChiusura.trim().length < 5)
            }
            onClick={completa}
          >
            {attesa ? 'Chiusura in corso…' : 'Completa prelievo'}
          </Button>
          <p className="text-sm text-fg-muted">
            Alla chiusura la merce esce dalla giacenza, l’impegno viene liberato e l’ordine
            avanza.
          </p>
        </Card>
      )}
    </div>
  );
}
