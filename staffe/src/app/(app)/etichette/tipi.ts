/** Tipi condivisi tra i componenti client del modulo etichette. */

export type FormatoFoglio = 'a4-griglia' | 'termica-62';

export const FORMATO_LABELS: Record<FormatoFoglio, string> = {
  'a4-griglia': 'Foglio A4 — griglia 3×8 (70×37 mm)',
  'termica-62': 'Termica 62 mm — un’etichetta per pagina',
};

export type VoceProdotto = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  categoria: string;
  ubicazione: string | null;
};

export type VoceUbicazione = {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
};

/**
 * Determina tipo e valore del codice a barre per un prodotto lato client,
 * senza importare `@/lib/barcode` (che porta con sé `bwip-js`): qui serve
 * solo scegliere `tipo` per la query a `/api/barcode`, il calcolo/validazione
 * veri restano lato server nella rotta.
 */
export function codiceProdotto(voce: VoceProdotto): { tipo: 'code128' | 'ean13'; valore: string } {
  const valore = voce.barcode ?? voce.sku;
  return /^\d{12,13}$/.test(valore) ? { tipo: 'ean13', valore } : { tipo: 'code128', valore };
}

/** Tronca un nome troppo lungo per l'etichetta, con ellissi. */
export function tronca(testo: string, max: number): string {
  return testo.length > max ? `${testo.slice(0, max - 1)}…` : testo;
}
