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

export type Ground = 'terms' | 'illegal';
type Lang = 'en' | 'bg' | 'it';

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
