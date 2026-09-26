// Седем йерархични нива 1..7 — по-малкото число включва правата на по-голямото.
// Чиста логика, без зависимости — тества се самостоятелно.

export const RUOLI = [
  "MASTER",
  "ADMIN",
  "DIREZIONE",
  "RESPONSABILE",
  "TECNICO",
  "OPERATORE",
  "CLIENTE",
] as const;

export type Ruolo = (typeof RUOLI)[number];

export const LIVELLO: Record<Ruolo, number> = {
  MASTER: 1,
  ADMIN: 2,
  DIREZIONE: 3,
  RESPONSABILE: 4,
  TECNICO: 5,
  OPERATORE: 6,
  CLIENTE: 7,
};

// Италиански етикети за интерфейса.
export const RUOLO_LABEL: Record<Ruolo, string> = {
  MASTER: "Master",
  ADMIN: "Amministratore di sistema",
  DIREZIONE: "Direzione",
  RESPONSABILE: "Responsabile",
  TECNICO: "Tecnico",
  OPERATORE: "Operatore",
  CLIENTE: "Cliente",
};

export function isRuolo(v: unknown): v is Ruolo {
  return typeof v === "string" && (RUOLI as readonly string[]).includes(v);
}

/** Вярно, когато `ruolo` има поне правата на `minimo` (по-ниско число = повече права). */
export function haPermesso(ruolo: Ruolo, minimo: Ruolo): boolean {
  return LIVELLO[ruolo] <= LIVELLO[minimo];
}
