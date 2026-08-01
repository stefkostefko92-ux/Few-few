'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Scansione dalla fotocamera via `BarcodeDetector` (Chrome/Chromium su
 * Android — l'unico motore che lo implementa; **non esiste su iOS/Safari**,
 * dove non c'è equivalente nativo). Per questo la fotocamera è sempre
 * un'aggiunta opzionale: il campo manuale/scanner hardware resta il percorso
 * primario, mai l'unico (WCAG — nessuna funzione dietro un solo canale).
 */
export function CameraScanner({
  onRilevato,
  onChiudi,
}: {
  onRilevato: (valore: string) => void;
  onChiudi: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!('BarcodeDetector' in window) || !window.BarcodeDetector) {
      setErrore(
        'Scansione dalla fotocamera non supportata su questo browser: usa lo scanner o digita il codice.',
      );
      return;
    }

    let stream: MediaStream | null = null;
    let fermato = false;
    let frame = 0;
    const detector = new window.BarcodeDetector({
      formats: ['code_128', 'ean_13', 'qr_code'],
    });

    async function avvia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (fermato || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setPronto(true);
        ciclo();
      } catch {
        setErrore(
          'Fotocamera non disponibile o permesso negato: usa lo scanner o digita il codice.',
        );
      }
    }

    async function ciclo() {
      if (fermato || !video.current) return;
      try {
        const trovati = await detector.detect(video.current);
        if (trovati.length > 0 && !fermato) {
          onRilevato(trovati[0].rawValue);
          return; // il chiamante chiude la fotocamera dopo la lettura
        }
      } catch {
        // Frame non decodificabile: si riprova al prossimo giro.
      }
      frame = requestAnimationFrame(ciclo);
    }

    avvia();

    return () => {
      fermato = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onRilevato è stabile per la durata della sessione di scansione
  }, []);

  if (errore) {
    return (
      <div className="rounded border border-warn bg-warn/10 p-3 text-sm text-fg" role="alert">
        <p>{errore}</p>
        <Button size="sm" variant="secondario" className="mt-2" onClick={onChiudi}>
          Chiudi
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded border border-border bg-black">
        <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
        {!pronto && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white">
            Avvio fotocamera…
          </p>
        )}
      </div>
      <p className="text-xs text-fg-muted">Inquadra il codice a barre o il QR. La lettura è automatica.</p>
      <Button size="sm" variant="secondario" onClick={onChiudi}>
        Annulla
      </Button>
    </div>
  );
}
