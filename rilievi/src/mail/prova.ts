import { writeAudit } from '../audit.js';
import { diagnosiPosta, type DiagnosiPosta } from './diagnosi.js';
import { creaTransport, segnaInvio } from './mailer.js';
import {
  assicuraPosta,
  parametriSmtp,
  serverDi,
  versionePosta,
  type ServerPosta,
} from './posta.js';

/**
 * Пробното писмо от конзолата на MASTER (#32): връзка и вход в SMTP сървъра (`verify`), после писмо до самия
 * MASTER. При провал — диагнозата (mail/diagnosi.ts): на коя стъпка е спряло и какво е отговорил сървърът.
 * В одита — само стъпката и кодовете; отговорът с думи стои в паметта за страницата на пощата.
 */
export type EsitoProva =
  { esito: 'inviata' } | { esito: 'spenta' } | { esito: 'errore'; diagnosi: DiagnosiPosta };

/** Последната проба с настройката и сървъра, с които е правена (нова настройка — пробата вече не важи). */
let ultima: {
  at: Date;
  versione: number;
  server: ServerPosta | null;
  esito: EsitoProva;
} | null = null;

export const ultimaProva = (): {
  at: Date;
  server: ServerPosta | null;
  esito: EsitoProva;
} | null =>
  ultima && ultima.versione === versionePosta()
    ? { at: ultima.at, server: ultima.server, esito: ultima.esito }
    : null;

export async function provaPosta(
  actorId: string,
  to: string,
  oggetto: string,
  testo: string,
): Promise<EsitoProva> {
  await assicuraPosta();
  const p = parametriSmtp();
  // Версията — сега: пробата чака сървъра (до минути при блокиран порт), а настройката може да се смени.
  const versione = versionePosta();
  const server = p ? serverDi(p) : null;
  let esito: EsitoProva;
  if (!p) {
    esito = { esito: 'spenta' };
  } else {
    const t = creaTransport(p);
    try {
      await t.verify();
      await t.sendMail({ from: p.from, to, subject: oggetto, text: testo });
      esito = { esito: 'inviata' };
      // Истинско писмо през действащата настройка: „пощата работи“ и за `/stato` и здравето на системата.
      if (server && versione === versionePosta()) segnaInvio(true, { versione, server });
    } catch (error) {
      esito = { esito: 'errore', diagnosi: diagnosiPosta(error) };
    } finally {
      t.close();
    }
  }
  ultima = { at: new Date(), versione, server, esito };
  const d = esito.esito === 'errore' ? esito.diagnosi : null;
  await writeAudit({
    actorId,
    action: 'POSTA_PROVA',
    aziendaId: null,
    targetType: 'posta',
    targetId: 'posta',
    meta: {
      esito: esito.esito,
      ...(d ? { fase: d.fase, codice: d.codice } : {}),
      ...(d?.origine ? { origine: d.origine } : {}),
      ...(d && d.risposta !== null ? { risposta: d.risposta } : {}),
    },
  });
  return esito;
}
