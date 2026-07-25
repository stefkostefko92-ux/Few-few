// Машина на състоянията за ордините на труд — само позволените преходи минават.
// Чиста логика (собствени литерали, не Prisma типове) → тестваема без база.

export const STATI_ORDINE = [
  "BOZZA",
  "EMESSO",
  "CONFERMATO",
  "IN_LAVORO",
  "SOSPESO",
  "COMPLETATO",
  "CHIUSO",
  "CONTESTATO",
  "ANNULLATO",
] as const;

export type Stato = (typeof STATI_ORDINE)[number];

// Таблицата на преходите от документацията — дословно.
export const TRANSIZIONI: Record<Stato, readonly Stato[]> = {
  BOZZA: ["EMESSO", "ANNULLATO"],
  EMESSO: ["CONFERMATO", "ANNULLATO"],
  CONFERMATO: ["IN_LAVORO", "SOSPESO", "ANNULLATO"],
  IN_LAVORO: ["COMPLETATO", "SOSPESO", "CONTESTATO"],
  SOSPESO: ["IN_LAVORO", "ANNULLATO"],
  COMPLETATO: ["CHIUSO", "CONTESTATO"],
  CONTESTATO: ["IN_LAVORO", "ANNULLATO"],
  CHIUSO: [], // финално
  ANNULLATO: [], // финално
};

export function isStatoOrdine(v: unknown): v is Stato {
  return typeof v === "string" && (STATI_ORDINE as readonly string[]).includes(v);
}

export function transizioneAmmessa(da: Stato, a: Stato): boolean {
  return TRANSIZIONI[da].includes(a);
}

export function statiFinali(): Stato[] {
  return STATI_ORDINE.filter((s) => TRANSIZIONI[s].length === 0);
}
