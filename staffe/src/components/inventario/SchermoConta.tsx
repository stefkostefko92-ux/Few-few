'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Input, Table, Td, Th } from '@/components/ui';

/**
 * Schermo di conteggio: si scansiona l'ubicazione, si contano gli articoli che
 * ci sono dentro, si salva.
 *
 * La quantità attesa NON viene mandata al browser finché il conteggio è aperto:
 * la conta è «cieca». Vedere il numero a sistema mentre si conta porta a
 * confermarlo invece di contare davvero, ed è esattamente ciò che l'inventario
 * dovrebbe scoprire. Le differenze compaiono nel rapporto, dopo il salvataggio.
 *
 * Lo scanner si comporta come una tastiera che digita e preme Invio: i due campi
 * di scansione bastano, senza altro codice.
 */

export type RigaConta = {
  id: string;
  sku: string;
  nome: string;
  barcode: string | null;
  uom: string;
  locationId: string;
  ubicazione: string;
  zona: string;
  countedQty: number | null;
  verified: boolean;
  note: string | null;
};

export function SchermoConta({
  inventarioId,
  righe,
}: {
  inventarioId: string;
  righe: RigaConta[];
}) {
  const router = useRouter();

  const ubicazioni = useMemo(() => {
    const viste = new Map<string, { code: string; id: string; totale: number }>();
    for (const r of righe) {
      const v = viste.get(r.ubicazione);
      if (v) v.totale += 1;
      else viste.set(r.ubicazione, { code: r.ubicazione, id: r.locationId, totale: 1 });
    }
    return [...viste.values()];
  }, [righe]);

  const [attiva, setAttiva] = useState<string | null>(null);
  const [codiceUbicazione, setCodiceUbicazione] = useState('');
  const [codiceProdotto, setCodiceProdotto] = useState('');
  // Valori digitati, per riga. Restano quelli locali anche dopo un
  // aggiornamento della pagina: è l'operatore che sta contando, non il server.
  const [valori, setValori] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      righe.map((r) => [r.id, r.countedQty === null ? '' : String(r.countedQty)]),
    ),
  );
  const [verificati, setVerificati] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(righe.map((r) => [r.id, r.verified])),
  );
  const [trovatoNonInElenco, setTrovatoNonInElenco] = useState<string | null>(null);
  const [qtaNuova, setQtaNuova] = useState('');
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const campoUbicazione = useRef<HTMLInputElement>(null);
  const campoProdotto = useRef<HTMLInputElement>(null);
  const campiQta = useRef(new Map<string, HTMLInputElement>());

  const righeAttive = useMemo(
    () => righe.filter((r) => r.ubicazione === attiva),
    [righe, attiva],
  );

  function apriUbicazione(codice: string) {
    const cercato = codice.trim().toUpperCase();
    if (!cercato) return;
    const trovata = ubicazioni.find((u) => u.code.toUpperCase() === cercato);
    if (!trovata) {
      setErrore(
        `L’ubicazione ${cercato} non fa parte di questo conteggio: controlla l’etichetta.`,
      );
      return;
    }
    setErrore(null);
    setMessaggio(null);
    setTrovatoNonInElenco(null);
    setAttiva(trovata.code);
    setCodiceUbicazione('');
    setCodiceProdotto('');
    // Dopo l'ubicazione si scansiona il prodotto: il fuoco ci va da solo.
    setTimeout(() => campoProdotto.current?.focus(), 0);
  }

  function scansionaProdotto(codice: string) {
    const cercato = codice.trim().toUpperCase();
    if (!cercato) return;
    const riga = righeAttive.find(
      (r) =>
        r.sku.toUpperCase() === cercato ||
        (r.barcode ?? '').toUpperCase() === cercato,
    );
    setCodiceProdotto('');
    if (!riga) {
      // Merce trovata dove il sistema non ne prevede: si può aggiungere al
      // conteggio, altrimenti l'eccedenza resterebbe fuori dal verbale.
      setTrovatoNonInElenco(cercato);
      setQtaNuova('');
      setErrore(null);
      setMessaggio(null);
      return;
    }
    setTrovatoNonInElenco(null);
    setErrore(null);
    // La verifica è la scansione: distingue una conta controllata da una
    // spunta a memoria.
    setVerificati((v) => ({ ...v, [riga.id]: true }));
    setMessaggio(`${riga.sku} verificato: digita la quantità.`);
    const campo = campiQta.current.get(riga.id);
    campo?.focus();
    campo?.select();
  }

  async function salva() {
    const daSalvare = righeAttive
      .filter((r) => valori[r.id] !== undefined)
      .map((r) => {
        const grezzo = (valori[r.id] ?? '').trim();
        return {
          lineId: r.id,
          countedQty: grezzo === '' ? null : Number(grezzo),
          verified: verificati[r.id] ?? false,
        };
      });
    if (daSalvare.some((r) => r.countedQty !== null && !Number.isInteger(r.countedQty))) {
      setErrore('Le quantità devono essere numeri interi.');
      return;
    }
    if (daSalvare.length === 0) return;

    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/inventario/${inventarioId}/righe`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ righe: daSalvare }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Salvataggio non riuscito.');
        return;
      }
      setMessaggio(
        `Ubicazione ${attiva} salvata · ${body.data.contate} righe contate su ${body.data.righe}.`,
      );
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile: le quantità NON sono state salvate.');
    } finally {
      setInCorso(false);
    }
  }

  async function aggiungiRiga() {
    const locationId = ubicazioni.find((u) => u.code === attiva)?.id;
    const qta = Number(qtaNuova.trim());
    if (!locationId || !trovatoNonInElenco) return;
    if (!Number.isInteger(qta) || qta < 0) {
      setErrore('Indica quanti pezzi hai trovato (numero intero).');
      return;
    }
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/inventario/${inventarioId}/righe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codice: trovatoNonInElenco,
          locationId,
          countedQty: qta,
          verified: true,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Riga non aggiunta.');
        return;
      }
      setMessaggio(`${trovatoNonInElenco} aggiunto al conteggio.`);
      setTrovatoNonInElenco(null);
      setQtaNuova('');
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile: la riga NON è stata aggiunta.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apriUbicazione(codiceUbicazione);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-64 flex-1">
            <label htmlFor="conta-ubicazione" className="block text-sm font-medium">
              Scansiona l’ubicazione
            </label>
            <Input
              id="conta-ubicazione"
              ref={campoUbicazione}
              list="conta-ubicazioni"
              autoComplete="off"
              inputMode="text"
              className="mt-1 h-12 text-base"
              placeholder="Es. A-02-S3-R1-V4"
              value={codiceUbicazione}
              onChange={(e) => setCodiceUbicazione(e.target.value)}
            />
            <datalist id="conta-ubicazioni">
              {ubicazioni.map((u) => (
                <option key={u.id} value={u.code}>
                  {u.totale} articoli
                </option>
              ))}
            </datalist>
          </div>
          <Button type="submit" size="lg" variant="secondario">
            Apri
          </Button>
        </form>
        <p className="mt-2 text-xs text-fg-muted">
          {ubicazioni.length} ubicazioni nel conteggio. La quantità a sistema non
          è mostrata: la conta è cieca, le differenze si vedono nel rapporto.
        </p>
      </Card>

      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}
      {messaggio && !errore && (
        <p className="rounded bg-ok/10 px-3 py-2 text-sm text-ok" aria-live="polite">
          {messaggio}
        </p>
      )}

      {attiva && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Ubicazione {attiva}</h2>
            <Button
              type="button"
              variant="fantasma"
              onClick={() => {
                setAttiva(null);
                setTrovatoNonInElenco(null);
                setTimeout(() => campoUbicazione.current?.focus(), 0);
              }}
            >
              Chiudi ubicazione
            </Button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              scansionaProdotto(codiceProdotto);
            }}
            className="mb-4"
          >
            <label htmlFor="conta-prodotto" className="block text-sm font-medium">
              Scansiona il prodotto (SKU o codice a barre)
            </label>
            <Input
              id="conta-prodotto"
              ref={campoProdotto}
              autoComplete="off"
              className="mt-1 h-12 max-w-md text-base"
              placeholder="Scansiona o digita e premi Invio"
              value={codiceProdotto}
              onChange={(e) => setCodiceProdotto(e.target.value)}
            />
          </form>

          {trovatoNonInElenco && (
            <div className="mb-4 rounded border border-warn/50 bg-warn/10 p-3">
              <p className="text-sm">
                <strong>{trovatoNonInElenco}</strong> non è in elenco per questa
                ubicazione. Se l’hai trovato qui, aggiungilo al conteggio.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="qta-nuova" className="block text-sm font-medium">
                    Pezzi trovati
                  </label>
                  <Input
                    id="qta-nuova"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="mt-1 h-12 w-32 text-base"
                    value={qtaNuova}
                    onChange={(e) => setQtaNuova(e.target.value)}
                  />
                </div>
                <Button type="button" size="lg" onClick={aggiungiRiga} disabled={inCorso}>
                  Aggiungi al conteggio
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="fantasma"
                  onClick={() => setTrovatoNonInElenco(null)}
                >
                  Ignora
                </Button>
              </div>
            </div>
          )}

          <Table>
            <thead>
              <tr>
                <Th>Articolo</Th>
                <Th className="text-right">Contati</Th>
                <Th>Verificato</Th>
              </tr>
            </thead>
            <tbody>
              {righeAttive.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span className="font-medium">{r.sku}</span>
                    <span className="block text-xs text-fg-muted">{r.nome}</span>
                  </Td>
                  <Td className="text-right">
                    <label htmlFor={`qta-${r.id}`} className="sr-only">
                      Quantità contata di {r.sku}
                    </label>
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        id={`qta-${r.id}`}
                        ref={(el) => {
                          if (el) campiQta.current.set(r.id, el);
                          else campiQta.current.delete(r.id);
                        }}
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="h-12 w-28 text-right text-base"
                        value={valori[r.id] ?? ''}
                        onChange={(e) =>
                          setValori((v) => ({ ...v, [r.id]: e.target.value }))
                        }
                      />
                      <span className="w-8 text-left text-xs text-fg-muted">
                        {r.uom}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {verificati[r.id] ? (
                      <Badge tone="ok">Scansionato</Badge>
                    ) : (
                      <Badge tone="neutro">A vista</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="lg" onClick={salva} disabled={inCorso}>
              {inCorso ? 'Salvataggio…' : 'Salva l’ubicazione'}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondario"
              disabled={inCorso}
              onClick={async () => {
                await salva();
                setAttiva(null);
                setTimeout(() => campoUbicazione.current?.focus(), 0);
              }}
            >
              Salva e passa alla prossima
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
