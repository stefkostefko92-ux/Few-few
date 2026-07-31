'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Select, Table, Td, Th } from '@/components/ui';
import { EtichettaImg } from './EtichettaImg';
import { codiceProdotto, tronca, FORMATO_LABELS, type FormatoFoglio, type VoceProdotto } from './tipi';

type Selezione = VoceProdotto & { copie: number };

export function ProdottiEtichette() {
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<VoceProdotto[]>([]);
  const [caricamento, setCaricamento] = useState(false);
  const [selezione, setSelezione] = useState<Selezione[]>([]);
  const [formato, setFormato] = useState<FormatoFoglio>('a4-griglia');

  useEffect(() => {
    const annulla = new AbortController();
    const timer = setTimeout(async () => {
      setCaricamento(true);
      try {
        const res = await fetch(`/api/etichette/prodotti?q=${encodeURIComponent(q.trim())}&perPage=20`, {
          signal: annulla.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: VoceProdotto[] };
        setRisultati(body.data);
      } catch {
        // richiesta annullata: si resta con i risultati precedenti
      } finally {
        setCaricamento(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      annulla.abort();
    };
  }, [q]);

  function aggiungi(voce: VoceProdotto) {
    setSelezione((prev) => {
      if (prev.some((v) => v.id === voce.id)) return prev;
      return [...prev, { ...voce, copie: 1 }];
    });
  }

  function rimuovi(id: string) {
    setSelezione((prev) => prev.filter((v) => v.id !== id));
  }

  function aggiornaCopie(id: string, copie: number) {
    setSelezione((prev) =>
      prev.map((v) => (v.id === id ? { ...v, copie: Math.max(1, Math.min(500, copie || 1)) } : v)),
    );
  }

  const etichette = selezione.flatMap((v) => Array.from({ length: v.copie }, () => v));

  return (
    <div className="space-y-4">
      <Card className="no-print space-y-3">
        <Field label="Cerca prodotto" htmlFor="etichette-cerca-prodotto" hint="SKU, nome o codice a barre.">
          <Input
            id="etichette-cerca-prodotto"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca o scansiona…"
            autoComplete="off"
          />
        </Field>

        {caricamento && <p className="text-sm text-fg-muted">Ricerca…</p>}

        {risultati.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Nome</Th>
                <Th>Categoria</Th>
                <Th><span className="sr-only">Azioni</span></Th>
              </tr>
            </thead>
            <tbody>
              {risultati.map((r) => (
                <tr key={r.id}>
                  <Td>{r.sku}</Td>
                  <Td>{r.name}</Td>
                  <Td>{r.categoria}</Td>
                  <Td>
                    <Button size="sm" variant="secondario" onClick={() => aggiungi(r)}>
                      Aggiungi
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="no-print space-y-3">
        <Field label="Formato foglio" htmlFor="etichette-formato-prodotti">
          <Select
            id="etichette-formato-prodotti"
            value={formato}
            onChange={(e) => setFormato(e.target.value as FormatoFoglio)}
          >
            {Object.entries(FORMATO_LABELS).map(([valore, etichetta]) => (
              <option key={valore} value={valore}>
                {etichetta}
              </option>
            ))}
          </Select>
        </Field>

        {selezione.length === 0 ? (
          <EmptyState
            title="Nessun prodotto selezionato"
            description="Cerca un prodotto sopra e aggiungilo alla lista di stampa."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Nome</Th>
                  <Th className="w-28">Copie</Th>
                  <Th><span className="sr-only">Azioni</span></Th>
                </tr>
              </thead>
              <tbody>
                {selezione.map((v) => (
                  <tr key={v.id}>
                    <Td>{v.sku}</Td>
                    <Td>{v.name}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={v.copie}
                        aria-label={`Copie per ${v.sku}`}
                        onChange={(e) => aggiornaCopie(v.id, Number(e.target.value))}
                        className="w-20"
                      />
                    </Td>
                    <Td>
                      <Button size="sm" variant="fantasma" onClick={() => rimuovi(v.id)}>
                        Rimuovi
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between">
              <p className="text-sm text-fg-muted">{etichette.length} etichette totali</p>
              <Button size="lg" onClick={() => window.print()}>
                Stampa {etichette.length} etichette
              </Button>
            </div>
          </>
        )}
      </Card>

      {etichette.length > 0 && (
        <div className="etichette-stampa" data-formato={formato}>
          {/* `@page` non si può annidare in un selettore: la dimensione pagina
              dipende dal formato scelto, quindi il CSS si genera qui in JS. */}
          <style>{`
            @media screen {
              .etichette-stampa { display: none; }
            }
            @page { size: ${formato === 'a4-griglia' ? 'A4' : '62mm auto'}; margin: 0; }
            @media print {
              .etichette-stampa[data-formato="a4-griglia"] {
                display: grid;
                grid-template-columns: repeat(3, 70mm);
                grid-auto-rows: 37mm;
                justify-content: center;
              }
              .etichette-stampa[data-formato="termica-62"] {
                display: block;
              }
              .et-cella {
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                overflow: hidden;
                break-inside: avoid;
              }
              .etichette-stampa[data-formato="a4-griglia"] .et-cella {
                width: 70mm;
                height: 37mm;
                padding: 3mm;
              }
              .etichette-stampa[data-formato="termica-62"] .et-cella {
                width: 62mm;
                min-height: 30mm;
                padding: 2mm;
                page-break-after: always;
              }
              .et-cella img { width: 90%; height: auto; }
              .et-testo { font-size: 8pt; line-height: 1.3; color: #000; }
            }
          `}</style>
          {etichette.map((v, i) => {
            const { tipo, valore } = codiceProdotto(v);
            return (
              <div className="et-cella" key={`${v.id}-${i}`}>
                <EtichettaImg tipo={tipo} valore={valore} />
                <p className="et-testo">
                  <strong>{v.sku}</strong>
                  <br />
                  {tronca(v.name, 32)}
                  <br />
                  {v.categoria}
                  {v.ubicazione ? ` · ${v.ubicazione}` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
