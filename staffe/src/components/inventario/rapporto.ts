/**
 * Calcolo delle discrepanze di inventario — funzioni pure, senza database.
 *
 * Stanno qui perché le usano sia le pagine sia la rotta di chiusura, e devono
 * dare lo stesso numero in entrambe: il verbale che l'operatore vede a schermo e
 * la rettifica che finisce nel registro dei movimenti non possono divergere.
 */

export type RigaDiscrepanza = {
  id: string;
  expectedQty: number;
  /** `null` = riga non ancora contata. Non è la stessa cosa di «contata zero». */
  countedQty: number | null;
  /** Valorizzazione al costo d'acquisto. Assente per chi non vede i costi. */
  costCents?: number;
};

/** Differenza contato − atteso. `null` finché la riga non è stata contata. */
export function differenza(riga: RigaDiscrepanza): number | null {
  return riga.countedQty === null ? null : riga.countedQty - riga.expectedQty;
}

/** Impatto economico della differenza (negativo = ammanco). */
export function valoreDifferenzaCents(riga: RigaDiscrepanza): number {
  const d = differenza(riga);
  if (d === null) return 0;
  return d * (riga.costCents ?? 0);
}

export type Riepilogo = {
  righe: number;
  contate: number;
  nonContate: number;
  discordanti: number;
  /** Pezzi trovati in più rispetto al sistema. */
  pezziInPiu: number;
  /** Pezzi mancanti rispetto al sistema (valore positivo). */
  pezziInMeno: number;
  /** Saldo economico: eccedenze meno ammanchi. */
  valoreNettoCents: number;
  /** Somma dei valori assoluti: quanto «si muove» in totale. */
  valoreAssolutoCents: number;
};

export function riepiloga(righe: readonly RigaDiscrepanza[]): Riepilogo {
  const out: Riepilogo = {
    righe: righe.length,
    contate: 0,
    nonContate: 0,
    discordanti: 0,
    pezziInPiu: 0,
    pezziInMeno: 0,
    valoreNettoCents: 0,
    valoreAssolutoCents: 0,
  };
  for (const riga of righe) {
    const d = differenza(riga);
    if (d === null) {
      out.nonContate += 1;
      continue;
    }
    out.contate += 1;
    if (d === 0) continue;
    out.discordanti += 1;
    if (d > 0) out.pezziInPiu += d;
    else out.pezziInMeno += -d;
    const valore = valoreDifferenzaCents(riga);
    out.valoreNettoCents += valore;
    out.valoreAssolutoCents += Math.abs(valore);
  }
  return out;
}

/**
 * Rapporto ordinato per impatto: prima ciò che vale di più, in valore assoluto.
 * Un ammanco da 800 € deve stare in cima anche se la riga da 3 pezzi è più
 * vistosa: chi controlla ha tempo per le prime venti righe, non per tutte.
 */
export function ordinaPerImpatto<T extends RigaDiscrepanza>(
  righe: readonly T[],
): T[] {
  return [...righe].sort((a, b) => {
    const va = Math.abs(valoreDifferenzaCents(a));
    const vb = Math.abs(valoreDifferenzaCents(b));
    if (vb !== va) return vb - va;
    // A parità di valore (o senza costi visibili) decide la quantità.
    return Math.abs(differenza(b) ?? 0) - Math.abs(differenza(a) ?? 0);
  });
}

/**
 * Soglie oltre le quali la chiusura genera la notifica
 * `INVENTARIO_DISCREPANZA`. Sotto queste, la differenza è il normale rumore di
 * magazzino e una notifica per ogni conteggio verrebbe presto ignorata.
 */
export const SOGLIA_VALORE_CENTS = 5_000; // 50,00 €
export const SOGLIA_RIGHE_DISCORDANTI = 5;

export function discrepanzaRilevante(r: Riepilogo): boolean {
  return (
    r.valoreAssolutoCents >= SOGLIA_VALORE_CENTS ||
    r.discordanti >= SOGLIA_RIGHE_DISCORDANTI
  );
}

/** Livello della notifica: critico quando il valore supera di molto la soglia. */
export function livelloDiscrepanza(r: Riepilogo): 'AVVISO' | 'CRITICO' {
  return r.valoreAssolutoCents >= SOGLIA_VALORE_CENTS * 3 ? 'CRITICO' : 'AVVISO';
}
