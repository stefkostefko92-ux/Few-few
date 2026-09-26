// Кой може да ползва ИИ асистента — ЧИСТО решение, без база.
//
// Пет ключа, в този ред, и първият затворен печели:
//   1. глобално   — MASTER го е изключил за цялата инсталация;
//   2. функция    — само „Compila da un documento" или само „Scrivi con l'AI";
//   3. роля       — нивото на достъп не е сред разрешените;
//   4. акаунт     — изключен за конкретния човек;
//   5. доставчик — има ли изобщо конфигуриран (средата на сървъра).
// Редът има значение за СЪОБЩЕНИЕТО: човекът научава най-общата причина, а не
// „вашият акаунт е изключен", когато всъщност е изключено за всички. Решението
// на администратора стои ПРЕДИ доставчика: то е изрично и остава вярно и
// когато утре ключът на доставчика бъде добавен.

import type { Ruolo } from "@/lib/roles";

export type FunzioneAi = "estrai" | "testo";

export interface ImpostazioniAi {
  attiva: boolean;
  estraiAttiva: boolean;
  testoAttiva: boolean;
  ruoliAmmessi: Ruolo[];
}

/** Без запис в базата: включено за вътрешните роли, не и за CLIENTE. */
export const IMPOSTAZIONI_AI_PREDEFINITE: ImpostazioniAi = {
  attiva: true,
  estraiAttiva: true,
  testoAttiva: true,
  ruoliAmmessi: [
    "MASTER",
    "ADMIN",
    "DIREZIONE",
    "RESPONSABILE",
    "TECNICO",
    "OPERATORE",
  ],
};

export type MotivoBlocco =
  | "provider"
  | "globale"
  | "funzione"
  | "ruolo"
  | "utente";

export interface EsitoAi {
  consentita: boolean;
  motivo?: MotivoBlocco;
  /** Италианският текст за екрана — без технически подробности. */
  messaggio?: string;
}

const MESSAGGI: Record<MotivoBlocco, string> = {
  provider:
    "Assistente AI non configurato. Va abilitato dall'amministratore di sistema (variabili AI_PROVIDER e AI_API_KEY).",
  globale:
    "L'assistente AI è disattivato dall'amministratore per tutta l'installazione.",
  funzione:
    "Questa funzione dell'assistente AI è disattivata dall'amministratore.",
  ruolo:
    "L'assistente AI non è abilitato per il livello di accesso di questo account.",
  utente: "L'assistente AI è disattivato per questo account.",
};

export function decidiAi(v: {
  providerAttivo: boolean;
  cfg: ImpostazioniAi;
  ruolo: Ruolo;
  utenteConsentito: boolean;
  funzione: FunzioneAi;
}): EsitoAi {
  const blocca = (motivo: MotivoBlocco): EsitoAi => ({
    consentita: false,
    motivo,
    messaggio: MESSAGGI[motivo],
  });
  if (!v.cfg.attiva) return blocca("globale");
  const funzioneAttiva =
    v.funzione === "estrai" ? v.cfg.estraiAttiva : v.cfg.testoAttiva;
  if (!funzioneAttiva) return blocca("funzione");
  if (!v.cfg.ruoliAmmessi.includes(v.ruolo)) return blocca("ruolo");
  if (!v.utenteConsentito) return blocca("utente");
  if (!v.providerAttivo) return blocca("provider");
  return { consentita: true };
}

/** HTTP статусът за отказа: липсващ доставчик е 503 (услугата я няма), останалото — 403. */
export function statoHttpAi(e: EsitoAi): number {
  return e.motivo === "provider" ? 503 : 403;
}
