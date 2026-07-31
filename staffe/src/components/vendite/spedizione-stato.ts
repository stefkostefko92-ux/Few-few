import type { Tone } from '@/lib/labels';

/**
 * Stato leggibile della spedizione.
 *
 * `Shipment` non ha un campo `status`: lo stato *è* la sequenza delle tre date
 * (imballata → partita → consegnata). Derivarlo in un solo posto evita che
 * elenco e dettaglio raccontino due storie diverse sullo stesso documento.
 */
export type StatoSpedizione = {
  etichetta: string;
  tono: Tone;
  chiave: 'DA_IMBALLARE' | 'PRONTA' | 'SPEDITA' | 'CONSEGNATA';
};

export function statoSpedizione(s: {
  packedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}): StatoSpedizione {
  if (s.deliveredAt) return { etichetta: 'Consegnata', tono: 'ok', chiave: 'CONSEGNATA' };
  if (s.shippedAt) return { etichetta: 'Spedita', tono: 'corso', chiave: 'SPEDITA' };
  if (s.packedAt) return { etichetta: 'Pronta', tono: 'corso', chiave: 'PRONTA' };
  return { etichetta: 'Da imballare', tono: 'neutro', chiave: 'DA_IMBALLARE' };
}
