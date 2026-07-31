'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { can } from '@/lib/rbac';
import { Badge, Button, Card, StockIndicator } from '@/components/ui';
import { ScanInput } from '@/components/scanner/ScanInput';
import { AzioneTrasferisci } from '@/components/scanner/AzioneTrasferisci';
import { AzioneRettifica } from '@/components/scanner/AzioneRettifica';

type RigaProdottoLista = { id: string; sku: string; barcode: string | null };
type RigaUbicazioneLista = { id: string; code: string };

type RigaGiacenzaProdotto = {
  qty: number;
  location: { id: string; code: string };
};

type ProdottoDettaglio = {
  id: string;
  sku: string;
  name: string;
  minStock: number;
  giacenza: { qty: number; reservedQty: number; availableQty: number };
  ubicazioni: RigaGiacenzaProdotto[];
};

type RigaContenutoUbicazione = {
  id: string;
  qty: number;
  product: { id: string; sku: string; name: string };
};

type UbicazioneDettaglio = {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  contenuto: RigaContenutoUbicazione[];
};

type Risultato =
  | { tipo: 'prodotto'; dati: ProdottoDettaglio }
  | { tipo: 'ubicazione'; dati: UbicazioneDettaglio };

function vibra(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

export function ScannerClient({ ruolo }: { ruolo: Role }) {
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [azione, setAzione] = useState<'trasferisci' | 'rettifica' | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const puoVedereProdotti = can(ruolo, 'prodotti:leggi');
  const puoVedereUbicazioni = can(ruolo, 'ubicazioni:leggi');
  const puoTrasferire = can(ruolo, 'giacenze:muovi');
  const puoRettificare = can(ruolo, 'giacenze:rettifica');
  const puoContare = can(ruolo, 'inventario:scrivi');

  async function ricaricaProdotto(id: string) {
    const res = await fetch(`/api/prodotti/${id}`);
    if (!res.ok) return;
    const body = (await res.json()) as { data: ProdottoDettaglio };
    setRisultato({ tipo: 'prodotto', dati: body.data });
  }

  async function cerca(valore: string) {
    setCaricamento(true);
    setErrore(null);
    setRisultato(null);
    setAzione(null);
    setMessaggio(null);
    try {
      if (puoVedereProdotti) {
        const res = await fetch(`/api/prodotti?q=${encodeURIComponent(valore)}&perPage=5`);
        if (res.ok) {
          const body = (await res.json()) as { data: RigaProdottoLista[] };
          const match =
            body.data.find((p) => p.sku === valore || p.barcode === valore) ??
            (body.data.length === 1 ? body.data[0] : null);
          if (match) {
            const detRes = await fetch(`/api/prodotti/${match.id}`);
            if (detRes.ok) {
              const det = (await detRes.json()) as { data: ProdottoDettaglio };
              setRisultato({ tipo: 'prodotto', dati: det.data });
              vibra(50);
              return;
            }
          }
        }
      }
      if (puoVedereUbicazioni) {
        const res = await fetch(`/api/ubicazioni?q=${encodeURIComponent(valore)}&perPage=5`);
        if (res.ok) {
          const body = (await res.json()) as { data: RigaUbicazioneLista[] };
          const match =
            body.data.find((u) => u.code.toUpperCase() === valore.toUpperCase()) ??
            (body.data.length === 1 ? body.data[0] : null);
          if (match) {
            const detRes = await fetch(`/api/ubicazioni/${match.id}`);
            if (detRes.ok) {
              const det = (await detRes.json()) as { data: UbicazioneDettaglio };
              setRisultato({ tipo: 'ubicazione', dati: det.data });
              vibra(50);
              return;
            }
          }
        }
      }
      setErrore(`Nessun prodotto o ubicazione trovato per «${valore}».`);
      vibra([40, 60, 40]);
    } catch {
      setErrore('Errore di rete durante la ricerca.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <ScanInput onScan={cerca} />
      </Card>

      {/*
        Regione viva SEMPRE presente (non montata insieme al testo): gli screen
        reader annunciano in modo affidabile solo i cambi di contenuto dentro
        una regione già nel documento.

        Dopo una scansione il fuoco resta nel campo e il risultato compare più
        in basso: senza questo annuncio, per un operatore non vedente non
        succede nulla di percepibile. Qui si riassume a voce ciò che gli altri
        vedono nella scheda.
      */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {caricamento
          ? 'Ricerca in corso…'
          : risultato?.tipo === 'prodotto'
            ? `Prodotto ${risultato.dati.sku}, ${risultato.dati.name}. Giacenza ${risultato.dati.giacenza.qty} pezzi.`
            : risultato?.tipo === 'ubicazione'
              ? `Ubicazione ${risultato.dati.code}.`
              : ''}
      </p>

      {caricamento && (
        <p className="text-sm text-fg-muted" aria-hidden="true">
          Ricerca in corso…
        </p>
      )}

      {errore && (
        <Card className="border-danger">
          {/* Lo stato non è solo colore: c'è sempre il testo, per chi non distingue il rosso. */}
          <p className="text-sm text-danger" role="alert">
            {errore}
          </p>
        </Card>
      )}

      {messaggio && (
        <Card className="border-ok">
          <p className="text-sm text-ok" role="status">
            {messaggio}
          </p>
        </Card>
      )}

      {risultato?.tipo === 'prodotto' && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{risultato.dati.sku}</p>
              <p className="text-sm text-fg-muted">{risultato.dati.name}</p>
            </div>
            <StockIndicator qty={risultato.dati.giacenza.qty} minStock={risultato.dati.minStock} suffix="pz" />
          </div>

          <p className="text-sm text-fg-muted">
            Disponibile: <span className="tabular-nums">{risultato.dati.giacenza.availableQty}</span> · Impegnato:{' '}
            <span className="tabular-nums">{risultato.dati.giacenza.reservedQty}</span>
          </p>

          {risultato.dati.ubicazioni.length > 0 && (
            <ul className="space-y-1 text-sm">
              {risultato.dati.ubicazioni.map((r) => (
                <li key={r.location.id} className="flex justify-between">
                  <span>{r.location.code}</span>
                  <span className="tabular-nums">{r.qty} pz</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Link href={`/prodotti/${risultato.dati.id}`}>
              <Button size="lg" variant="secondario">
                Vedi scheda
              </Button>
            </Link>
            {puoTrasferire && (
              <Button size="lg" onClick={() => setAzione('trasferisci')}>
                Trasferisci
              </Button>
            )}
            {puoRettificare && (
              <Button size="lg" variant="pericolo" onClick={() => setAzione('rettifica')}>
                Rettifica
              </Button>
            )}
            {puoContare && (
              <Link href={`/inventario?prodottoId=${risultato.dati.id}`}>
                <Button size="lg" variant="secondario">
                  Conta
                </Button>
              </Link>
            )}
          </div>

          {azione === 'trasferisci' && (
            <AzioneTrasferisci
              prodottoId={risultato.dati.id}
              righe={risultato.dati.ubicazioni}
              onAnnulla={() => setAzione(null)}
              onCompletato={async () => {
                await ricaricaProdotto(risultato.dati.id);
                setAzione(null);
                setMessaggio('Trasferimento registrato.');
              }}
            />
          )}
          {azione === 'rettifica' && (
            <AzioneRettifica
              prodottoId={risultato.dati.id}
              righe={risultato.dati.ubicazioni}
              onAnnulla={() => setAzione(null)}
              onCompletato={async () => {
                await ricaricaProdotto(risultato.dati.id);
                setAzione(null);
                setMessaggio('Rettifica registrata.');
              }}
            />
          )}
        </Card>
      )}

      {risultato?.tipo === 'ubicazione' && (
        <Card className="space-y-3">
          <div>
            <p className="text-lg font-semibold">{risultato.dati.code}</p>
            <p className="text-sm text-fg-muted">
              Zona {risultato.dati.zone}, corsia {risultato.dati.aisle}
            </p>
          </div>

          {risultato.dati.contenuto.length === 0 ? (
            <p className="text-sm text-fg-muted">Ubicazione vuota.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {risultato.dati.contenuto.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>
                    {r.product.sku} — {r.product.name}
                  </span>
                  <span className="tabular-nums">{r.qty} pz</span>
                </li>
              ))}
            </ul>
          )}

          <Link href={`/ubicazioni/${risultato.dati.id}`}>
            <Button size="lg" variant="secondario">
              Vedi scheda
            </Button>
          </Link>
        </Card>
      )}

      {!risultato && !errore && !caricamento && (
        <p className="text-sm text-fg-muted">
          <Badge tone="neutro">In attesa</Badge> Scansiona un codice per iniziare.
        </p>
      )}
    </div>
  );
}
