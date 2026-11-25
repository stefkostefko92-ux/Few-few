import { z } from 'zod';
import { writeAudit } from '../audit.js';

/**
 * Записаната карта по имейл от страницата ѝ (собственикът, 13 ноември 2026 — „Искам да имам опция да изпращам
 * запазената вече scheda по емайл директно от портала“): адресът се пише при изпращането и НЕ се пази никъде;
 * прикачен е същият PDF като при свалянето; по избор — кратко съобщение. Маршрутът — routes/schede-invio.ts.
 */

export const invioSchema = z.object({
  email: z.string().trim().max(254).email(),
  // Първо новите редове (браузърът праща CRLF, а в `maxlength` го брои за един знак), после дължината.
  messaggio: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(2000))
    .optional(),
});

/**
 * Най-големият PDF, който тръгва като прикачен файл: 4 MB — препоръката на Brevo за прикачен файл към
 * транзакционно писмо (цялото писмо — до 20 MB). По-голям (много снимки в печата) се сваля и се праща на ръка.
 */
export const MAX_PDF_EMAIL = 4 * 1024 * 1024;

export const troppoGrande = (bytes: number): boolean => bytes > MAX_PDF_EMAIL;

/** Какво записва тръгналото писмо: картата и фирмата — никога адреса (и дали е имало съобщение, не текста). */
export async function registraInvioScheda(
  actorId: string,
  scheda: { id: string; aziendaId: string },
  meta: { messaggio: boolean },
): Promise<void> {
  await writeAudit({
    actorId,
    action: 'SCHEDA_EMAIL',
    aziendaId: scheda.aziendaId,
    targetType: 'scheda',
    targetId: scheda.id,
    meta,
  });
}
