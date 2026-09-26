// Политиката за ИИ, приложена към сесия: чете настройката и акаунта от базата.
// Решението е в `politica.ts` (чисто, с тестове); тук е само четенето.

import { prisma } from "@/lib/prisma";
import type { Sessione } from "@/lib/auth";
import { isRuolo, type Ruolo } from "@/lib/roles";
import { configAi } from "@/lib/ai/config";
import {
  decidiAi,
  IMPOSTAZIONI_AI_PREDEFINITE,
  type EsitoAi,
  type FunzioneAi,
  type ImpostazioniAi,
} from "@/lib/ai/politica";

export async function impostazioniAi(): Promise<ImpostazioniAi> {
  const r = await prisma.configurazioneAi.findUnique({ where: { id: 1 } });
  if (!r) return IMPOSTAZIONI_AI_PREDEFINITE;
  return {
    attiva: r.attiva,
    estraiAttiva: r.estraiAttiva,
    testoAttiva: r.testoAttiva,
    ruoliAmmessi: r.ruoliAmmessi.filter(isRuolo) as Ruolo[],
  };
}

/** Може ли ТАЗИ сесия да ползва ТАЗИ функция сега. Свежо състояние от базата. */
export async function verificaAi(
  s: Sessione,
  funzione: FunzioneAi,
): Promise<EsitoAi> {
  const [cfg, u] = await Promise.all([
    impostazioniAi(),
    prisma.user.findUnique({
      where: { id: s.sub },
      select: { aiConsentita: true, ruolo: true },
    }),
  ]);
  return decidiAi({
    providerAttivo: configAi().effettivo !== "off",
    cfg,
    ruolo: (u?.ruolo as Ruolo) ?? s.ruolo,
    utenteConsentito: u?.aiConsentita ?? false,
    funzione,
  });
}
