'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Select, Table, Td, Th } from '@/components/ui';
import { EtichettaImg } from './EtichettaImg';
import { FORMATO_LABELS, type FormatoFoglio, type VoceUbicazione } from './tipi';

type Selezione = VoceUbicazione & { copie: number };

/**
 * Etichette da scaffale: quello che l'addetto incolla sulle ubicazioni
 * fisiche. Il codice a barre è sempre Code128 sul `code` dell'ubicazione
 * (mai un EAN-13: non è un articolo commerciale).
 */
export function UbicazioniEtichette() {
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<VoceUbicazione[]>([]);
  const [caricamento, setCaricamento] = useState(false);
  const [selezione, setSelezione] = useState<Selezione[]>([]);
  const [formato, setFormato] = useState<FormatoFoglio>('a4-griglia');

  useEffect(() => {
    const annulla = new AbortController();
    const timer = setTimeout(async () => {
      setCaricamento(true);
      try {
        const res = await fetch(`/api/etichette/ubicazioni?q=${encodeURIComponent(q.trim())}&perPage=20`, {
          signal: annulla.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: VoceUbicazione[] };
        setRisultati(body.data);
      } catch {
        // richiesta annullata
      } finally {
        setCaricamento(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      annulla.abort();
    };
  }, [q]);

  function aggiungi(voce: VoceUbicazione) {
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
        <Field label="Cerca ubicazione" htmlFor="etichette-cerca-ubicazione" hint="Codice scaffale (es. A-02-S3-R1-V4).">
          <Input
            id="etichette-cerca-ubicazione"
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
                <Th>Codice</Th>
                <Th>Zona</Th>
                <Th>Corsia</Th>
                <Th><span className="sr-only">Azioni</span></Th>
              </tr>
            </thead>
            <tbody>
              {risultati.map((r) => (
                <tr key={r.id}>
                  <Td>{r.code}</Td>
                  <Td>{r.zone}</Td>
                  <Td>{r.aisle}</Td>
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
        <Field label="Formato foglio" htmlFor="etichette-formato-ubicazioni">
          <Select
            id="etichette-formato-ubicazioni"
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
            title="Nessuna ubicazione selezionata"
            description="Cerca un’ubicazione sopra e aggiungila alla lista di stampa."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Codice</Th>
                  <Th className="w-28">Copie</Th>
                  <Th><span className="sr-only">Azioni</span></Th>
                </tr>
              </thead>
              <tbody>
                {selezione.map((v) => (
                  <tr key={v.id}>
                    <Td>{v.code}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={v.copie}
                        aria-label={`Copie per ${v.code}`}
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
          <style>{`
            @media screen {
              .etichette-stampa { display: none; }
            }
            @page { size: ${formato === 'a4-griglia' ? 'A4' : '62mm auto'}; margin: 0; }
            @media print {
              /* Vedi ProdottiEtichette: con margine di pagina zero la griglia
                 deve partire da 0,0, altrimenti il riempimento del guscio
                 disallinea tutte le etichette adesive. */
              body { margin: 0 !important; }
              #contenuto { padding: 0 !important; }
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
              .et-testo { font-size: 10pt; font-weight: 600; color: #000; }
            }
          `}</style>
          {etichette.map((v, i) => (
            <div className="et-cella" key={`${v.id}-${i}`}>
              <EtichettaImg tipo="code128" valore={v.code} />
              <p className="et-testo">{v.code}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
