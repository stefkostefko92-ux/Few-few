// Периодично чистене по сроковете: заявки (privacy, 6 месеца), изтекли сесии, регистър (12 месеца)
// (спецификация т. 11, 17). Първият MASTER — primo-admin.ts (при деплоя).
import type { Logger } from "pino";
import type { Store } from "./store/types.js";

export async function pulizia(store: Store, logger: Logger, ora = new Date()): Promise<void> {
  const anno = new Date(ora);
  anno.setMonth(anno.getMonth() - 12);
  const [r, s, e] = await Promise.all([store.richieste.eliminaScadute(ora), store.sessioni.eliminaScadute(ora), store.eventi.eliminaPrimaDi(anno)]);
  if (r || s || e) logger.info({ event: "pulizia", richieste: r, sessioni: s, eventi: e });
  if (r) await store.eventi.registra({ utenteId: null, azione: "richieste.scadute_eliminate", oggetto: null, dettagli: { numero: r }, ipHmac: null });
}
