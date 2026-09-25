/**
 * DSA чл. 17 — обосновка (statement of reasons) към ЗАСЕГНАТИЯ потребител
 * при ограничаване на съдържание (сваляне/нулиране/отмяна на обява).
 *
 * Чл. 17(3) изисква обосновката да съдържа: (а) какво е ограничено;
 * (б) фактите и обстоятелствата (вкл. дали е по сигнал); (в) дали е ползвано
 * автоматизирано средство; (г/д) правното или договорното основание;
 * (е) възможностите за защита. Доставя се във вътрешната поща на героя,
 * на езика на потребителя (по държавата при регистрация: BG → bg, IT → it,
 * иначе en). Чл. 20 (вътрешна жалба) е освободен за микро-предприятия
 * (чл. 19) — затова не обещаваме формален механизъм, а даваме реален
 * канал за контакт + извънсъдебно (чл. 21) и съдебно обжалване.
 */
import type Database from 'better-sqlite3';
import { sendMail } from './email';

export type Ground = 'terms' | 'illegal';
export type Lang = 'en' | 'bg' | 'it';

export interface Statement {
  subject: string;
  body: string;
  lang: Lang;
}

const WHAT: Record<string, Record<Lang, string>> = {
  character_name: { en: 'Your character name was reset.', bg: 'Името на героя ви беше нулирано.', it: 'Il nome del tuo personaggio è stato reimpostato.' },
  bio: { en: 'Your character bio was cleared.', bg: 'Биографията на героя ви беше изчистена.', it: 'La biografia del tuo personaggio è stata cancellata.' },
  guild_name: { en: 'The name of the guild you lead was reset.', bg: 'Името на гилдията, която водите, беше нулирано.', it: 'Il nome della gilda che guidi è stato reimpostato.' },
  guild_tag: { en: 'The tag of the guild you lead was reset.', bg: 'Тагът на гилдията, която водите, беше нулиран.', it: 'Il tag della gilda che guidi è stato reimpostato.' },
  guild_motto: { en: 'The motto of the guild you lead was cleared.', bg: 'Мотото на гилдията, която водите, беше изчистено.', it: 'Il motto della gilda che guidi è stato cancellato.' },
  guild_chat_message: { en: 'One of your guild chat messages was removed.', bg: 'Едно ваше съобщение в чата на гилдията беше премахнато.', it: 'Un tuo messaggio nella chat di gilda è stato rimosso.' },
  global_chat_message: { en: 'One of your public chat messages was removed.', bg: 'Едно ваше съобщение в публичния чат беше премахнато.', it: 'Un tuo messaggio nella chat pubblica è stato rimosso.' },
  market_listing: { en: 'One of your marketplace listings was cancelled; the item was returned to your inventory.', bg: 'Една ваша обява на пазара беше отменена; предметът е върнат в инвентара ви.', it: 'Un tuo annuncio al mercato è stato annullato; l’oggetto è tornato nel tuo inventario.' },
};

const T: Record<Lang, {
  subject: string; intro: string; reason: string; basis: string; terms: string; illegal: string;
  notice: string; ownInitiative: string; automated: string; redress: string;
}> = {
  en: {
    subject: 'Content moderation notice',
    intro: 'Our moderation team has restricted some of your content.',
    reason: 'Reason',
    basis: 'Ground',
    terms: 'Incompatible with our Terms of Service.',
    illegal: 'Reported as illegal content under applicable law.',
    notice: 'This decision follows a notice submitted by a third party (EU Digital Services Act, Art. 16).',
    ownInitiative: 'This decision was taken on our own initiative.',
    automated: 'The decision was taken by a human moderator; no automated means were used.',
    redress: 'If you believe this was a mistake, reply to this message and we will review it. You may also use a certified out-of-court dispute settlement body (DSA Art. 21) or seek redress before the courts.',
  },
  bg: {
    subject: 'Известие за модерация на съдържание',
    intro: 'Екипът ни по модерация ограничи част от вашето съдържание.',
    reason: 'Причина',
    basis: 'Основание',
    terms: 'Несъвместимо с Общите ни условия.',
    illegal: 'Сигнализирано като незаконно съдържание според приложимото право.',
    notice: 'Решението е взето след сигнал от трето лице (Акт за цифровите услуги на ЕС, чл. 16).',
    ownInitiative: 'Решението е взето по наша инициатива.',
    automated: 'Решението е взето от модератор (човек); не са използвани автоматизирани средства.',
    redress: 'Ако смятате, че е грешка, отговорете на това съобщение и ще го прегледаме отново. Можете също да се обърнете към сертифициран орган за извънсъдебно решаване на спорове (чл. 21 от Акта) или към съда.',
  },
  it: {
    subject: 'Avviso di moderazione dei contenuti',
    intro: 'Il nostro team di moderazione ha limitato alcuni tuoi contenuti.',
    reason: 'Motivo',
    basis: 'Fondamento',
    terms: 'Incompatibile con i nostri Termini di servizio.',
    illegal: 'Segnalato come contenuto illegale ai sensi della normativa applicabile.',
    notice: 'La decisione segue una segnalazione di terzi (Regolamento UE sui servizi digitali, art. 16).',
    ownInitiative: 'La decisione è stata presa di nostra iniziativa.',
    automated: 'La decisione è stata presa da un moderatore umano; non sono stati usati strumenti automatizzati.',
    redress: 'Se ritieni che si tratti di un errore, rispondi a questo messaggio e la riesamineremo. Puoi anche rivolgerti a un organismo certificato di risoluzione extragiudiziale delle controversie (art. 21 DSA) o all’autorità giudiziaria.',
  },
};

export function langForCountry(country: string | null | undefined): Lang {
  const c = (country || '').toUpperCase();
  if (c === 'BG') return 'bg';
  if (c === 'IT') return 'it';
  return 'en';
}

/** Сглобява обосновката по чл. 17(3) на езика на засегнатия. */
export function buildStatement(opts: { kind: string; reason: string; ground: Ground; fromNotice: boolean; lang: Lang }): Statement {
  const t = T[opts.lang];
  const what = WHAT[opts.kind]?.[opts.lang] || t.intro;
  const body = [
    t.intro,
    '',
    what,
    `${t.reason}: ${opts.reason}`,
    `${t.basis}: ${opts.ground === 'illegal' ? t.illegal : t.terms}`,
    opts.fromNotice ? t.notice : t.ownInitiative,
    t.automated,
    '',
    t.redress,
  ].join('\n');
  return { subject: t.subject, body, lang: opts.lang };
}

/**
 * Доставя обосновката до героя (вътрешна поща). Езикът се взима от
 * държавата на собственика. Изпълни ВЪТРЕ в транзакцията на действието —
 * така или и двете се записват, или нищо (без свалено-но-неуведомено).
 */
export function deliverStatement(
  db: Database.Database,
  characterId: number,
  opts: { kind: string; reason: string; ground: Ground; fromNotice: boolean },
): Statement {
  const owner = db
    .prepare('SELECT u.country AS country FROM characters c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?')
    .get(characterId) as { country: string | null } | undefined;
  const st = buildStatement({ ...opts, lang: langForCountry(owner?.country) });
  db.prepare('INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(characterId, 'Trust & Safety', st.subject, st.body, Date.now());
  return st;
}

/* ═════════════ DSA чл. 16(5) — уведомяване на ПОДАТЕЛЯ на сигнала ═════════════
 * „Доставчикът… уведомява без ненужно забавяне физическото или юридическото
 * лице за своето решение по отношение на информацията, за която се отнася
 * сигналът, като предоставя информация за възможностите за защита." Досега
 * решението се пишеше само в dsa_notices и подателят не научаваше нищо.
 * Изпраща се, ако подателят е оставил имейл; езикът е по държавата от
 * подаването (BG → bg, IT → it, иначе en). Преводите са ръчни, не машинни.
 */
const N: Record<Lang, {
  subject: (id: number) => string; hello: string; actioned: string; rejected: string;
  decision: string; automated: string; redress: string; footer: string;
}> = {
  en: {
    subject: (id) => `Decision on your notice #${id} — Nexus Dominion`,
    hello: 'Hello,',
    actioned: 'We reviewed your notice and took action against the reported content.',
    rejected: 'We reviewed your notice and decided not to take action against the reported content.',
    decision: 'Decision',
    automated: 'The decision was taken by a human moderator; no automated means were used.',
    redress: 'If you disagree, reply to this message quoting the reference above and we will look at it again. You may also turn to a certified out-of-court dispute settlement body (EU Digital Services Act, Art. 21) or seek redress before the courts.',
    footer: 'Nexus Dominion · Carbon Stealth VCC — notice-and-action under the EU Digital Services Act (Art. 16).',
  },
  bg: {
    subject: (id) => `Решение по вашия сигнал №${id} — Nexus Dominion`,
    hello: 'Здравейте,',
    actioned: 'Прегледахме сигнала ви и предприехме действие срещу съдържанието, за което се отнася.',
    rejected: 'Прегледахме сигнала ви и решихме да не предприемаме действие срещу съдържанието, за което се отнася.',
    decision: 'Решение',
    automated: 'Решението е взето от модератор (човек); не са използвани автоматизирани средства.',
    redress: 'Ако не сте съгласни, отговорете на това писмо, като посочите номера по-горе, и ще го прегледаме отново. Можете също да се обърнете към сертифициран орган за извънсъдебно решаване на спорове (Акт за цифровите услуги на ЕС, чл. 21) или към съда.',
    footer: 'Nexus Dominion · Carbon Stealth VCC — механизъм за сигнали по Акта за цифровите услуги на ЕС (чл. 16).',
  },
  it: {
    subject: (id) => `Decisione sulla tua segnalazione n. ${id} — Nexus Dominion`,
    hello: 'Buongiorno,',
    actioned: 'Abbiamo esaminato la tua segnalazione e siamo intervenuti sul contenuto segnalato.',
    rejected: 'Abbiamo esaminato la tua segnalazione e abbiamo deciso di non intervenire sul contenuto segnalato.',
    decision: 'Decisione',
    automated: 'La decisione è stata presa da un moderatore umano; non sono stati usati strumenti automatizzati.',
    redress: 'Se non sei d’accordo, rispondi a questa email indicando il numero sopra e la riesamineremo. Puoi anche rivolgerti a un organismo certificato di risoluzione extragiudiziale delle controversie (Regolamento UE sui servizi digitali, art. 21) o all’autorità giudiziaria.',
    footer: 'Nexus Dominion · Carbon Stealth VCC — meccanismo di segnalazione ai sensi del Regolamento UE sui servizi digitali (art. 16).',
  },
};

/** Писмото до подателя (чиста функция — тестваема). */
export function buildNoticeDecisionMail(opts: { noticeId: number; outcome: 'actioned' | 'rejected'; decision: string; lang: Lang }): { subject: string; text: string; lang: Lang } {
  const t = N[opts.lang];
  const text = [
    t.hello,
    '',
    opts.outcome === 'actioned' ? t.actioned : t.rejected,
    `${t.decision}: ${opts.decision}`,
    t.automated,
    '',
    t.redress,
    '',
    '—',
    t.footer,
  ].join('\n');
  return { subject: t.subject(opts.noticeId), text, lang: opts.lang };
}

/**
 * Уведомява подателя на сигнала за решението (чл. 16(5)). Извиква се СЛЕД
 * като решението е записано. Best-effort: без имейл → нищо; SMTP не е
 * конфигуриран → лог; никога не хвърля. Връща дали писмото е изпратено и
 * отбелязва notifier_notified_at при успех.
 */
export async function notifyNoticeDecision(db: Database.Database, noticeId: number): Promise<boolean> {
  try {
    const n = db.prepare('SELECT id, status, decision, notifier_email, ip_country FROM dsa_notices WHERE id = ?').get(noticeId) as
      | { id: number; status: string; decision: string | null; notifier_email: string | null; ip_country: string | null } | undefined;
    if (!n || !n.notifier_email || (n.status !== 'actioned' && n.status !== 'rejected')) return false;
    const mail = buildNoticeDecisionMail({
      noticeId: n.id, outcome: n.status, decision: n.decision || '—', lang: langForCountry(n.ip_country),
    });
    const sent = await sendMail({ to: n.notifier_email, subject: mail.subject, text: mail.text });
    if (sent) db.prepare('UPDATE dsa_notices SET notifier_notified_at = ? WHERE id = ?').run(Date.now(), n.id);
    return sent;
  } catch (err: any) {
    console.warn(`[dsa] уведомяването на подателя (сигнал ${noticeId}) се провали: ${err?.message || err}`);
    return false;
  }
}
