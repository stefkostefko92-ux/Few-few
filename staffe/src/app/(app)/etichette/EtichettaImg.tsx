/** Immagine del codice a barre/QR, servita da `/api/barcode`. */
export function EtichettaImg({
  tipo,
  valore,
  className,
}: {
  tipo: 'code128' | 'ean13' | 'qr';
  valore: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG generato dal server, non ottimizzabile da next/image.
    <img
      src={`/api/barcode?tipo=${tipo}&testo=${encodeURIComponent(valore)}`}
      alt={`Codice a barre ${valore}`}
      className={className}
    />
  );
}
