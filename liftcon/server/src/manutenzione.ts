// Периодично чистене по сроковете: заявки (privacy, 6 месеца), изтекли сесии, регистър (12 месеца);
// първият MASTER от средата, ако няма потребители (спецификация т. 11, 17, 18).
import type { Logger } from "pino";
import type { Store } from "./store/types.js";
import { hashPassword } from "./auth/password.js";

export async function pulizia(store: Store, logger: Logger, ora = new Date()): Promise<void> {
  const anno = new Date(ora);
  anno.setMonth(anno.getMonth() - 12);
  const [r, s, e] = await Promise.all([store.richieste.eliminaScadute(ora), store.sessioni.eliminaScadute(ora), store.eventi.eliminaPrimaDi(anno)]);
  if (r || s || e) logger.info({ event: "pulizia", richieste: r, sessioni: s, eventi: e });
  if (r) await store.eventi.registra({ utenteId: null, azione: "richieste.scadute_eliminate", oggetto: null, dettagli: { numero: r }, ipHmac: null });
}

export async function primoMaster(store: Store, logger: Logger, o: { email?: string | undefined; nome: string; password?: string | undefined }): Promise<boolean> {
  if ((await store.utenti.conta()) > 0) return false;
  if (!o.email || !o.password) {
    logger.warn({ event: "primo_master", esito: "mancano ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD" });
    return false;
  }
  await store.utenti.crea({ email: o.email, nome: o.nome, ruolo: "MASTER", passwordHash: await hashPassword(o.password), cambiarePassword: true });
  logger.info({ event: "primo_master", esito: "creato" });
  return true;
}
