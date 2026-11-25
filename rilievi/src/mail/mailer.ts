import nodemailer, { type Transporter } from 'nodemailer';
import { allarme } from '../allarmi/servizio.js';
import { COMPANY } from '../company.js';
import { isProduction } from '../config.js';
import { translatorFor } from '../i18n.js';
import { logger } from '../logger.js';
import { diagnosiPosta, type DiagnosiPosta } from './diagnosi.js';
import {
  assicuraPosta,
  parametriSmtp,
  serverDi,
  versionePosta,
  type ParametriSmtp,
  type ServerPosta,
} from './posta.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Прикачени файлове (PDF-ът на листа за интервенция) — създадени на сървъра, никога пратени отвън. */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  /** Отговорът — до човека, който е пратил (поръчката до доставчика); иначе — до портала. */
  replyTo?: string;
}

/** `disabled` — няма SMTP: връзката се показва на екрана за копиране, нищо не е изгубено. */
export type MailResult = 'sent' | 'disabled' | 'failed';

let transport: { versione: number; fonte: string; t: Transporter } | null = null;

/** SMTP (Brevo на порт 2525 — минава и при блокирани 25/465/587), винаги шифровано (STARTTLS или TLS). */
export function creaTransport(p: ParametriSmtp): Transporter {
  return nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    requireTLS: !p.secure,
    auth: p.user && p.pass ? { user: p.user, pass: p.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Транспортът на текущата настройка — нов при всяка нова настройка от конзолата. */
function getTransport(p: ParametriSmtp): Transporter {
  if (transport && transport.versione === versionePosta() && transport.fonte === p.fonte)
    return transport.t;
  transport?.t.close();
  transport = { versione: versionePosta(), fonte: p.fonte, t: creaTransport(p) };
  return transport.t;
}

/** Кутията за разработка и тестове: какво би тръгнало. В продукция остава празна. */
export const outbox: Array<MailMessage & { at: number; result: MailResult }> = [];

function remember(message: MailMessage, result: MailResult): void {
  if (isProduction()) return;
  // В кутията — само името и размерът на прикаченото, не съдържанието.
  const attachments = message.attachments?.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.alloc(0),
    size: a.content.length,
  }));
  outbox.push({ ...message, ...(attachments ? { attachments } : {}), at: Date.now(), result });
  if (outbox.length > 200) outbox.shift();
}

/**
 * Последният изход от истинско пращане (в паметта на процеса) — за „Salute del sistema“, `/stato` и страницата
 * на пощата: пощата „работи“ по това дали писмата тръгват, не по това дали е настроена (одитът от 12 ноември
 * 2026). При провал — и диагнозата (стъпката, кодовете, отговорът на сървъра — той само за MASTER).
 */
export interface EsitoInvio {
  at: Date;
  riuscito: boolean;
  falliti: number;
  diagnosi: DiagnosiPosta | null;
  /**
   * Настройката, с която е пращано (`versionePosta`), и сървърът ѝ: след смяна на порта старата грешка не се
   * показва като грешка на новия (Кодаджията, 13 ноември 2026 — 587 → 2525).
   */
  versione: number;
  server: ServerPosta;
}
let ultimoInvio: EsitoInvio | null = null;
export const ultimoEsitoPosta = (): EsitoInvio | null => ultimoInvio;
/** И успешното пробно писмо е истинско писмо през същата настройка (mail/prova.ts). */
export const segnaInvio = (
  riuscito: boolean,
  con: { versione: number; server: ServerPosta },
  diagnosi: DiagnosiPosta | null = null,
): void => {
  ultimoInvio = {
    at: new Date(),
    riuscito,
    falliti: riuscito ? 0 : (ultimoInvio?.falliti ?? 0) + 1,
    diagnosi: riuscito ? null : diagnosi,
    ...con,
  };
};

/** Подписът, с който завършват текстовете на писмата в речника. */
const FIRMA_BREVE = 'Carbon Stealth VCC — https://carbonstealth.eu';

/**
 * Пълните данни на изпращача под всяко писмо (одитът от 12 ноември 2026 — чл. 5 от Дир. 2000/31): правната
 * форма, седалището, ЕИК и ДДС номерът — от едно място (company.ts и `company.*` в речника), не във всеки текст.
 */
export function conFirma(text: string): string {
  if (!text.endsWith(FIRMA_BREVE)) return text;
  const t = translatorFor('it');
  const firma = [
    `${t('company.legalName')} — ${t('company.legalForm')}`,
    `${t('company.street')}, ${COMPANY.postalCode} ${t('company.city')}, ${t('company.country')}`,
    `EIK ${COMPANY.eik} — ${t('company.vatLabel')} ${COMPANY.vat}`,
    COMPANY.url,
  ].join('\n');
  return text.slice(0, -FIRMA_BREVE.length) + firma;
}

export async function sendMail(grezzo: MailMessage): Promise<MailResult> {
  const message: MailMessage = { ...grezzo, text: conFirma(grezzo.text) };
  if (/[\r\n]/.test(message.to) || /[\r\n]/.test(message.replyTo ?? '')) return 'failed';
  await assicuraPosta();
  const parametri = parametriSmtp();
  if (!parametri) {
    remember(message, 'disabled');
    return 'disabled';
  }
  // Преди пращането: докато писмото чака сървъра, настройката може да се смени от конзолата.
  const con = { versione: versionePosta(), server: serverDi(parametri) };
  try {
    await getTransport(parametri).sendMail({ from: parametri.from, ...message });
    segnaInvio(true, con);
    remember(message, 'sent');
    return 'sent';
  } catch (error) {
    // В лога — само стъпката и кодовете: текстът от SMTP сървъра често цитира адреса на получателя.
    const d = diagnosiPosta(error);
    segnaInvio(false, con, d);
    logger.error(
      {
        evento: 'posta.fallita',
        fase: d.fase,
        code: d.codice,
        ...(d.origine ? { origine: d.origine } : {}),
        ...(d.risposta !== null ? { responseCode: d.risposta } : {}),
      },
      'писмото не тръгна',
    );
    remember(message, 'failed');
    // Пощата не тръгва: и в Discord (без адреса) — писмата са единственият път към клиентите.
    void allarme('posta');
    return 'failed';
  }
}
