'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { CameraScanner } from './CameraScanner';

/**
 * Punto di ingresso della scansione: due canali, mai uno solo.
 *
 * (a) Scanner fisico/tastiera — il campo resta a fuoco e riceve i tasti che
 *     lo scanner "digita", terminati da Invio: è lo stesso principio già
 *     usato da `GlobalSearch`.
 * (b) Fotocamera del telefono via `BarcodeDetector`, dove supportata.
 *
 * Il campo manuale è sempre presente e utilizzabile anche senza scanner né
 * fotocamera (digitazione diretta) — nessuna azione dipende da un solo canale.
 */
export function ScanInput({ onScan }: { onScan: (valore: string) => void }) {
  const [valore, setValore] = useState('');
  const [fotocamera, setFotocamera] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  function invia(e: React.FormEvent) {
    e.preventDefault();
    const v = valore.trim();
    if (!v) return;
    onScan(v);
    setValore('');
    campo.current?.focus();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={invia} className="flex gap-2">
        <div className="flex-1">
          <Field label="Codice" htmlFor="scanner-campo" hint="Scansiona con il lettore, o digita e premi Invio.">
            <Input
              id="scanner-campo"
              ref={campo}
              value={valore}
              onChange={(e) => setValore(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-14 text-lg"
              placeholder="Scansiona o digita il codice…"
            />
          </Field>
        </div>
        <Button type="submit" size="lg" className="self-end">
          Cerca
        </Button>
      </form>

      {!fotocamera ? (
        <Button size="lg" variant="secondario" onClick={() => setFotocamera(true)}>
          Usa la fotocamera
        </Button>
      ) : (
        <CameraScanner
          onRilevato={(v) => {
            setFotocamera(false);
            onScan(v);
            campo.current?.focus();
          }}
          onChiudi={() => setFotocamera(false)}
        />
      )}
    </div>
  );
}
