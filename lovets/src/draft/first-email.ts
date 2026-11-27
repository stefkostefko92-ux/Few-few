import { createHash } from 'node:crypto';
import type { Market, Verdict } from '../compliance/types.js';
import { fingerprint } from '../registry/fingerprint.js';
import { suppressionKeys } from '../registry/keys.js';
import { SENDER } from './company.js';
import { formatSlot } from './slots.js';
import { makeUnsubToken } from './unsubscribe.js';

/**
 * Черновата на първия имейл (фаза 4а). Правната основа — прегледът на Правния Разбирач от 27.11.2026:
 * - чернова има САМО при „Може“ за имейл (verdict.ts; без съгласие в Италия няма „Може“);
 * - задължителни блокове: подател (ЗЕТ чл. 5, ал. 3, т. 2; ТЗ чл. 13; Codice чл. 130, ал. 5), обозначение
 *   в темата (ЗЕТ чл. 6, ал. 1 / чл. 5, ал. 3, т. 1; d.lgs. 70/2003 чл. 8), кратко известие по чл. 14 ОРЗД
 *   с конкретния източник и публична връзка към пълното, отделен абзац за възражение (чл. 21(4)) с работеща
 *   връзка за отписване;
 * - без проследяване: само текст, без HTML, без връзки с параметри (EDPB 2/2023, т. 48–51);
 * - източникът е видян преди не повече от месец (чл. 14(3)(а)).
 * Черновата не се пази: собственикът я копира и праща от своята поща (v1 — без Brevo, защото пикселът
 * там не се изключва доказуемо). Италианският текст е чернова за Преводача и италиански юрист.
 */
export const TEMPLATE_VERSION = 'first-email/1';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_SOURCE_AGE_DAYS = 30;

export interface DraftConfig {
  /** Публичният адрес на Ловеца — оттам е връзката за отписване (nginx пуска само /u/). */
  publicUrl: string;
  /** Публичната страница с пълното известие за проучването на клиенти (на carbonstealth.eu). */
  noticeUrl: string | null;
  unsubKey: string | null;
  pepper: string;
  retentionMonths: number;
}

export interface FirstEmailInput {
  verdict: Verdict;
  sourceUrl: string;
  /** Кога адресът е видян в източника. */
  seenAt: Date;
  /** Темата — на какво е предложението (влиза в темата и в известието). */
  topic: string;
  /** Текстът на предложението, писан от собственика. */
  offer: string;
  recipientName?: string;
  senderName: string;
  slots: Date[];
}

export type Basis = 'legitimate_interest' | 'consent';

export interface FirstEmailDraft {
  market: Market;
  basis: Basis;
  subject: string;
  text: string;
  textHash: string;
  templateVersion: string;
  sourceUrl: string;
  unsubscribeUrl: string;
  legalReview?: 'it_pending';
}

export type DraftRefusal =
  | 'not_email'
  | 'not_allowed'
  | 'source_mismatch'
  | 'source_stale'
  | 'seen_in_future'
  | 'notice_url_missing'
  | 'unsub_key_missing'
  | 'slots_invalid'
  | 'tracking_or_html'
  | 'blocks_missing';

export type DraftResult =
  { ok: true; draft: FirstEmailDraft } | { ok: false; code: DraftRefusal; missing?: string[] };

export type BlockCode =
  | 'sender_identity'
  | 'subject_marker'
  | 'art14_notice'
  | 'art21_objection'
  | 'unsubscribe_link'
  | 'tracking_or_html';

const URL_RX = /\bhttps?:\/\/[^\s]+/gi;

/** HTML, http:// или връзка с параметри/котва (носител на идентификатор) — забранени в писмото. */
function hasTracking(s: string, known: string[] = []): boolean {
  if (/<\s*[a-z!/]/i.test(s)) return true;
  // Нашите връзки (известието, отписването) и проверения източник не са проследяване — махат се преди проверката.
  const rest = known.filter(Boolean).reduce((acc, k) => acc.split(k).join(' '), s);
  for (const u of rest.match(URL_RX) ?? []) {
    if (/^http:/i.test(u) || /[?#]/.test(u) || /utm_/i.test(u)) return true;
  }
  return false;
}

const SUBJECT = {
  BG: { legitimate_interest: 'Непоискано търговско съобщение: ', consent: 'Търговско съобщение: ' },
  IT: {
    legitimate_interest: 'Comunicazione commerciale – ',
    consent: 'Comunicazione commerciale – ',
  },
} as const;

const OBJECTION_START = {
  BG: {
    legitimate_interest: 'Можете по всяко време да възразите',
    consent: 'Можете по всяко време да оттеглите',
  },
  IT: { legitimate_interest: 'Può revocare il consenso', consent: 'Può revocare il consenso' },
} as const;

const months = (n: number, m: Market): string =>
  m === 'BG' ? `${n} ${n === 1 ? 'месец' : 'месеца'}` : `${n} ${n === 1 ? 'mese' : 'mesi'}`;

const day = (d: Date, m: Market): string =>
  new Intl.DateTimeFormat(m === 'BG' ? 'bg-BG' : 'it-IT', {
    timeZone: m === 'BG' ? 'Europe/Sofia' : 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

function compose(
  i: FirstEmailInput,
  cfg: DraftConfig & { noticeUrl: string },
  basis: Basis,
  unsubscribeUrl: string,
): { subject: string; text: string } {
  const m = i.verdict.market;
  const email = i.verdict.normalizedValue ?? '';
  const slots = i.slots.map((s) => `– ${formatSlot(s, m)}`).join('\n');
  const name = i.recipientName?.trim();
  if (m === 'BG') {
    const why =
      basis === 'consent'
        ? `Защо получавате това писмо: съгласили сте се да получавате търговски съобщения по имейл; адресът ${email} е от ${i.sourceUrl}. Ползваме само името, служебния имейл и длъжността, за да Ви предложим ${i.topic}, на основание съгласие (чл. 6, пар. 1, б. „а“ ОРЗД).`
        : `Защо получавате това писмо: адресът ${email} е публикуван на ${i.sourceUrl} (видяхме го на ${day(i.seenAt, m)}). Ползваме само името, служебния имейл и длъжността, за да Ви предложим ${i.topic}, на основание законен интерес (чл. 6, пар. 1, б. „е“ ОРЗД).`;
    const objection =
      basis === 'consent'
        ? `${OBJECTION_START.BG.consent} съгласието си и да възразите срещу използването на данните Ви за директен маркетинг, безплатно: отворете ${unsubscribeUrl} или отговорете „Отказ“. Повече няма да Ви пишем.`
        : `${OBJECTION_START.BG.legitimate_interest} срещу използването на данните Ви за директен маркетинг, безплатно: отворете ${unsubscribeUrl} или отговорете „Отказ“. Повече няма да Ви пишем.`;
    return {
      subject: SUBJECT.BG[basis] + i.topic,
      text: [
        name ? `Здравейте, ${name}!` : 'Здравейте!',
        i.offer.trim(),
        `Ако темата Ви е интересна, предлагам кратък разговор от 20 минути в един от тези часове:\n${slots}\nОтговорете с удобния час или предложете друг.`,
        `Поздрави,\n${i.senderName.trim()}\n${SENDER.name}`,
        `Кои сме: ${SENDER.name} (${SENDER.nameBg}), ЕИК ${SENDER.eik}, седалище и адрес на управление: ${SENDER.address.bg}; ${SENDER.email}.`,
        `${why} Ако не отговорите, изтриваме данните до ${months(cfg.retentionMonths, m)}. Пълно известие (права, срокове, получатели, жалба до КЗЛД): ${cfg.noticeUrl}`,
        objection,
      ].join('\n\n'),
    };
  }
  // Италия — само със съгласие (verdict.ts). Чернова за Преводача и италиански юрист, не машинен превод.
  return {
    subject: SUBJECT.IT[basis] + i.topic,
    text: [
      name ? `Buongiorno ${name},` : 'Buongiorno,',
      i.offer.trim(),
      `Se l'argomento Le interessa, Le propongo una breve chiamata di 20 minuti in uno di questi orari:\n${slots}\nRisponda con l'orario che preferisce o ne proponga un altro.`,
      `Cordiali saluti,\n${i.senderName.trim()}\n${SENDER.name}`,
      `Chi siamo: ${SENDER.name} (Bulgaria), n. di registrazione (EIK) ${SENDER.eik}, sede: ${SENDER.address.it}; ${SENDER.email}.`,
      `Le scriviamo perché ha acconsentito a ricevere comunicazioni commerciali via e-mail; l'indirizzo ${email} proviene da ${i.sourceUrl}. Trattiamo solo nome, e-mail di lavoro e ruolo (art. 6, par. 1, lett. a GDPR; art. 130 Codice privacy). Se non risponde, cancelliamo i dati entro ${months(cfg.retentionMonths, m)}. Informativa completa (diritti, conservazione, destinatari, reclamo al Garante o alla KZLD): ${cfg.noticeUrl}`,
      `${OBJECTION_START.IT.consent} e opporsi in qualsiasi momento, gratuitamente: apra ${unsubscribeUrl} o risponda „Cancellami“. Non riceverà altre comunicazioni.`,
    ].join('\n\n'),
  };
}

/** Детерминистичният гейт: кои задължителни блокове липсват. Празен списък = писмото може да тръгне. */
export function checkEmailBlocks(
  d: FirstEmailDraft,
  cfg: Pick<DraftConfig, 'noticeUrl'>,
): BlockCode[] {
  const missing: BlockCode[] = [];
  const t = d.text;
  if (
    !t.includes(SENDER.eik) ||
    !t.includes(SENDER.email) ||
    !(t.includes('Бобов дол') || t.includes('Bobov dol'))
  ) {
    missing.push('sender_identity');
  }
  if (!d.subject.startsWith(SUBJECT[d.market][d.basis])) missing.push('subject_marker');
  if (!cfg.noticeUrl || !t.includes(cfg.noticeUrl) || !t.includes(d.sourceUrl))
    missing.push('art14_notice');
  const paras = t.split(/\n\s*\n/);
  const objection = paras.find((p) => p.startsWith(OBJECTION_START[d.market][d.basis]));
  if (!objection || !objection.includes(d.unsubscribeUrl)) missing.push('art21_objection');
  if (!t.includes(d.unsubscribeUrl)) missing.push('unsubscribe_link');
  if (
    hasTracking(d.subject) ||
    hasTracking(t, [d.sourceUrl, d.unsubscribeUrl, cfg.noticeUrl ?? ''])
  )
    missing.push('tracking_or_html');
  return missing;
}

export function composeFirstEmail(i: FirstEmailInput, cfg: DraftConfig, now: Date): DraftResult {
  const v = i.verdict;
  if (v.channel !== 'email') return { ok: false, code: 'not_email' };
  if (v.decision !== 'allowed' || !v.normalizedValue) return { ok: false, code: 'not_allowed' };
  if (!v.sourceUrl || v.sourceUrl !== i.sourceUrl) return { ok: false, code: 'source_mismatch' };
  const age = now.getTime() - i.seenAt.getTime();
  if (age < -5 * 60_000) return { ok: false, code: 'seen_in_future' };
  if (age > MAX_SOURCE_AGE_DAYS * DAY_MS) return { ok: false, code: 'source_stale' };
  if (!cfg.noticeUrl) return { ok: false, code: 'notice_url_missing' };
  if (!cfg.unsubKey) return { ok: false, code: 'unsub_key_missing' };
  const times = i.slots.map((s) => s.getTime());
  if (
    times.length !== 3 ||
    new Set(times).size !== 3 ||
    times.some((t) => !Number.isFinite(t) || t - now.getTime() < HOUR_MS)
  ) {
    return { ok: false, code: 'slots_invalid' };
  }
  const owned = [i.topic, i.offer, i.recipientName ?? '', i.senderName];
  if (
    owned.some((x) => hasTracking(x)) ||
    /[<>\s]/.test(i.sourceUrl) ||
    !/^https:\/\//.test(i.sourceUrl)
  ) {
    return { ok: false, code: 'tracking_or_html' };
  }

  const market = v.market;
  const basis: Basis = v.reasons.some((r) => r.code === 'consent_present')
    ? 'consent'
    : 'legitimate_interest';
  const fps = suppressionKeys(v.normalizedValue, 'value', market).map((k) =>
    fingerprint(k, cfg.pepper),
  );
  const unsubscribeUrl = `${cfg.publicUrl.replace(/\/+$/, '')}/u/${makeUnsubToken(fps, cfg.unsubKey)}`;
  const { subject, text } = compose(i, { ...cfg, noticeUrl: cfg.noticeUrl }, basis, unsubscribeUrl);
  const draft: FirstEmailDraft = {
    market,
    basis,
    subject,
    text,
    textHash: createHash('sha256').update(`${subject}\n\n${text}`).digest('hex'),
    templateVersion: TEMPLATE_VERSION,
    sourceUrl: i.sourceUrl,
    unsubscribeUrl,
    ...(market === 'IT' ? { legalReview: 'it_pending' as const } : {}),
  };
  const missing = checkEmailBlocks(draft, cfg);
  if (missing.length) return { ok: false, code: 'blocks_missing', missing };
  return { ok: true, draft };
}
