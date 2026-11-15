import { writeAudit } from '../audit.js';
import { creaTransport } from './mailer.js';
import { assicuraPosta, parametriSmtp } from './posta.js';

/**
 * Пробното писмо от конзолата на MASTER (#32): връзка и вход в SMTP сървъра (`verify`), после писмо до самия
 * MASTER. Казва само кода на грешката (EAUTH, ECONNECTION…) — текстът на сървъра може да цитира адреси.
 */
export type EsitoProva =
  { esito: 'inviata' } | { esito: 'spenta' } | { esito: 'errore'; codice: string };

const CODICE = /^[A-Z][A-Z0-9_]{1,30}$/;

export async function provaPosta(
  actorId: string,
  to: string,
  oggetto: string,
  testo: string,
): Promise<EsitoProva> {
  await assicuraPosta();
  const p = parametriSmtp();
  let esito: EsitoProva;
  if (!p) {
    esito = { esito: 'spenta' };
  } else {
    const t = creaTransport(p);
    try {
      await t.verify();
      await t.sendMail({ from: p.from, to, subject: oggetto, text: testo });
      esito = { esito: 'inviata' };
    } catch (error) {
      const raw = (error as { code?: unknown }).code;
      esito = {
        esito: 'errore',
        codice: typeof raw === 'string' && CODICE.test(raw) ? raw : 'EERRORE',
      };
    } finally {
      t.close();
    }
  }
  await writeAudit({
    actorId,
    action: 'POSTA_PROVA',
    aziendaId: null,
    targetType: 'posta',
    targetId: 'posta',
    meta: { esito: esito.esito, ...(esito.esito === 'errore' ? { codice: esito.codice } : {}) },
  });
  return esito;
}
