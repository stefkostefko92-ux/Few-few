// Ролите (7 нива) и правата — матрицата от docs/admin-spec.md. Едно място за решенията за достъп.
import { RUOLI, type Ruolo } from "../store/types.js";

export const PERMESSI = [
  "richieste.leggi",
  "richieste.modifica",
  "richieste.elimina",
  "richieste.esporta",
  "contenuti.modifica",
  "contenuti.pubblica",
  "registro.leggi",
  "utenti.gestisci",
] as const;
export type Permesso = (typeof PERMESSI)[number];

/** По-малко число = по-високо ниво. */
export const livello = (r: Ruolo): number => RUOLI.indexOf(r);

const SOGLIA: Record<Permesso, Ruolo> = {
  "richieste.leggi": "OPERATORE",
  "richieste.modifica": "OPERATORE",
  "richieste.elimina": "DIREZIONE",
  "richieste.esporta": "DIREZIONE",
  "contenuti.modifica": "RESPONSABILE",
  "contenuti.pubblica": "DIREZIONE",
  "registro.leggi": "DIREZIONE",
  "utenti.gestisci": "ADMIN",
};

export function puo(r: Ruolo, p: Permesso): boolean {
  return livello(r) <= livello(SOGLIA[p]);
}

/** Достъп до /admin изобщо. */
export const accessoAdmin = (r: Ruolo): boolean => puo(r, "richieste.leggi");

/**
 * Може ли `attore` да управлява `bersaglio` и да му даде `nuovoRuolo`: MASTER — всеки; ADMIN — само роли
 * под своята и никога MASTER/ADMIN. Никой не сваля собствената си роля (да не остане системата без MASTER).
 */
export function puoGestire(attore: { id: string; ruolo: Ruolo }, bersaglio: { id: string; ruolo: Ruolo } | null, nuovoRuolo?: Ruolo): boolean {
  if (!puo(attore.ruolo, "utenti.gestisci")) return false;
  if (bersaglio && bersaglio.id === attore.id) return nuovoRuolo === undefined || nuovoRuolo === attore.ruolo;
  if (attore.ruolo === "MASTER") return true;
  if (bersaglio && livello(bersaglio.ruolo) <= livello(attore.ruolo)) return false;
  if (nuovoRuolo && livello(nuovoRuolo) <= livello(attore.ruolo)) return false;
  return true;
}

export const ETICHETTE_RUOLO: Record<Ruolo, string> = {
  MASTER: "Master",
  ADMIN: "Amministratore",
  DIREZIONE: "Direzione",
  RESPONSABILE: "Responsabile",
  TECNICO: "Tecnico",
  OPERATORE: "Operatore",
  CLIENTE: "Cliente (senza accesso)",
};
