// Първият MASTER — създава се при деплоя (спецификация т. 18): имейл и парола идват през stdin от deploy.sh,
// само ако в базата няма потребители. Паролата не минава през .env, лога, регистъра или аргументите на процес.
import type { Store } from "./store/types.js";
import { EMAIL_RE } from "./email/configurazione.js";
import { hashPassword, problemaPassword, type ProblemaPassword } from "./auth/password.js";

export const NOME_PREDEFINITO = "Amministratore";

export type EsitoPrimoMaster = { ok: true } | { ok: false; errore: "esiste" | "email" | ProblemaPassword };

export async function creaPrimoMaster(store: Store, o: { email: string; password: string; nome?: string }): Promise<EsitoPrimoMaster> {
  if ((await store.utenti.conta()) > 0) return { ok: false, errore: "esiste" };
  const email = o.email.trim().toLowerCase();
  if (email.length > 200 || !EMAIL_RE.test(email)) return { ok: false, errore: "email" };
  const nome = o.nome?.trim() || NOME_PREDEFINITO;
  const problema = problemaPassword(o.password, [email, nome]);
  if (problema) return { ok: false, errore: problema };
  // Паролата е въведена от собственика при деплоя — без задължителна смяна; 2FA се настройва при първия вход.
  const u = await store.utenti.crea({ email, nome, ruolo: "MASTER", passwordHash: await hashPassword(o.password), cambiarePassword: false });
  await store.eventi.registra({ utenteId: u.id, azione: "utente.creato", oggetto: u.id, dettagli: { ruolo: "MASTER", origine: "deploy" }, ipHmac: null });
  return { ok: true };
}

/** stdin: ред 1 — имейл, ред 2 — парола. Маха се само краят на реда (паролата може да има интервали). */
export function leggiCredenziali(testo: string): { email: string; password: string } {
  const righe = testo.split("\n").map((r) => r.replace(/\r$/, ""));
  return { email: (righe[0] ?? "").trim(), password: righe[1] ?? "" };
}
