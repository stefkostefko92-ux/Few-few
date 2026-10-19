// Документ от документ: оферта → ордин/фактура, ордин → фактура/DDT. Чисто.
//
// Дотогава веригата се прекъсваше на всяка стъпка: офертата ставаше
// „APPROVATO" и толкова — ордин, фактура и DDT се пишеха наново на ръка, ред по
// ред, с риск от разминаване в цената. Тук е само ПРЕВОДЪТ на редовете;
// номерацията, изолацията по фирма и одитът са в маршрутите.
//
// Сумите остават НИЗОВЕ, както идват от базата: тоталите на новия документ ги
// смята `ricalcolaFattura` в цели центесими — тук нищо не се умножава.

/** Ред на оферта, както е в базата (Decimal → низ). */
export interface VoceOrigine {
  descrizione: string;
  quantita: string;
  prezzoUnitario: string;
  aliquotaIva: string;
  naturaIva: string | null;
  ordine: number;
}

/** Ред на фактура за създаване (без `fatturaId`). */
export interface VoceNuova {
  descrizione: string;
  quantita: string;
  prezzoUnitario: string;
  aliquotaIva: string;
  naturaIva: string | null;
  ordine: number;
}

/** Материал, вложен в ордина (от рапортините). */
export interface MaterialeUsato {
  articoloId: string;
  codice: string;
  nome: string;
  quantita: number;
  prezzoVendita: string | null;
  aliquotaIva: string;
}

/** Редовете на офертата, в нейния ред — цената не се преизчислява. */
export function vociDaPreventivo(voci: readonly VoceOrigine[]): VoceNuova[] {
  return [...voci]
    .sort((a, b) => a.ordine - b.ordine)
    .map((v, i) => ({
      descrizione: v.descrizione,
      quantita: v.quantita,
      prezzoUnitario: v.prezzoUnitario,
      aliquotaIva: v.aliquotaIva,
      naturaIva: v.naturaIva,
      ordine: i,
    }));
}

/** Един артикул, вложен в няколко рапортина, е ЕДИН ред с общото количество. */
export function raggruppaMateriali(
  materiali: readonly MaterialeUsato[],
): MaterialeUsato[] {
  const per = new Map<string, MaterialeUsato>();
  for (const m of materiali) {
    const c = per.get(m.articoloId);
    if (c) c.quantita += m.quantita;
    else per.set(m.articoloId, { ...m });
  }
  return [...per.values()].filter((m) => m.quantita > 0);
}

/**
 * Материалите като редове на фактура.
 *
 * Артикул без продажна цена НЕ получава измислена: редът излиза с цена 0 и
 * името му се връща в `senzaPrezzo`, за да го види човекът в черновата. Нулата
 * е видима и поправима; предположената цена би минала незабелязана към SDI.
 */
export function vociDaMateriali(
  materiali: readonly MaterialeUsato[],
  inizio = 0,
): { voci: VoceNuova[]; senzaPrezzo: string[] } {
  const senzaPrezzo: string[] = [];
  const voci = raggruppaMateriali(materiali).map((m, i) => {
    if (m.prezzoVendita === null) senzaPrezzo.push(`${m.codice} — ${m.nome}`);
    return {
      descrizione: `${m.codice} — ${m.nome}`,
      quantita: String(m.quantita),
      prezzoUnitario: m.prezzoVendita ?? "0",
      aliquotaIva: m.aliquotaIva,
      naturaIva: null,
      ordine: inizio + i,
    };
  });
  return { voci, senzaPrezzo };
}

/** Материалите като редове на DDT: само стоката и количеството, без цени. */
export function righeDdtDaMateriali(materiali: readonly MaterialeUsato[]): {
  descrizione: string;
  quantita: string;
  um: string;
  ordine: number;
}[] {
  return raggruppaMateriali(materiali).map((m, i) => ({
    descrizione: `${m.codice} — ${m.nome}`,
    quantita: String(m.quantita),
    um: "pz",
    ordine: i,
  }));
}

/** Оферта, от която се ражда нещо, трябва да е приета от клиента. */
export const STATO_PREVENTIVO_GENERABILE = "APPROVATO";
