import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';
import { mailLongDate, mailSignature, recipientLocale } from './locale.js';

/**
 * Писмата за предаването на собственост (SPEC 84–87, src/accounts/handover*.ts). Поканата към човека е
 * `transfer.invite` (с токена, templates.ts); тук са известията — без токени, на езика на получателя.
 */
export const HANDOVER_MAIL_KINDS = [
  'handover.accepted',
  'handover.memberRemoved',
  'handover.firmProposal',
  'handover.firmAccepted',
  'handover.firmDeclined',
  'handover.master',
] as const;

const Name = z.string().min(1).max(300);
const Accepted = z.object({ legalName: Name, newOwnerId: z.string().min(1).max(40) });
const Proposal = z.object({
  legalName: Name,
  fromUserId: z.string().min(1).max(40),
  expiresAt: z.string().datetime(),
});
const Removed = z.object({
  legalName: Name,
  firmName: Name,
  reason: z.string().max(200).nullable(),
});
const Decided = z.object({ legalName: Name, firmName: Name });
const Master = z.object({
  legalName: Name,
  role: z.enum(['newOwner', 'oldOwnerAdmin', 'oldOwnerRemoved', 'firm']),
  reason: z.string().max(200),
});

/** Името на човек — при изпращането (в опашката е само id: закрит профил не оставя името си там). */
async function nameOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? '—';
}

export async function composeHandoverMail(
  kind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const base = config().PUBLIC_BASE_URL;
  const contact = config().CONTACT_EMAIL;
  const locale = await recipientLocale(toEmail);
  const bg = locale === 'bg';
  let subject: string;
  let paragraphs: string[];
  if (kind === 'handover.accepted') {
    const { legalName, newOwnerId } = Accepted.parse(payload);
    const newOwnerName = await nameOf(newOwnerId);
    subject = bg
      ? `Фактурист — собствеността на „${legalName}“ е предадена`
      : `Fakturist — the ownership of “${legalName}” is handed over`;
    paragraphs = bg
      ? [
          `${newOwnerName} прие поканата и вече е собственик на „${legalName}“ във Фактурист. Вие оставате администратор, докато новият собственик не реши друго.`,
          `Ако не сте предавали собствеността, пишете ни веднага на ${contact}.`,
        ]
      : [
          `${newOwnerName} accepted the invitation and is now the owner of “${legalName}” in Fakturist. You stay an administrator until the new owner decides otherwise.`,
          `If you did not hand over the ownership, write to us at once at ${contact}.`,
        ];
  } else if (kind === 'handover.firmProposal') {
    const { legalName, fromUserId, expiresAt } = Proposal.parse(payload);
    const fromName = await nameOf(fromUserId);
    const date = mailLongDate(new Date(expiresAt), locale);
    subject = bg
      ? `Фактурист — предложение да поемете „${legalName}“`
      : `Fakturist — a proposal to take over “${legalName}”`;
    paragraphs = bg
      ? [
          `${fromName}, собственикът на „${legalName}“, предлага кантората Ви да поеме фирмата във Фактурист. Ако приемете, собственикът и членовете ѝ излизат, а кантората я води по действащото пълномощно и може по-късно да покани нов собственик.`,
          `Решете до ${date} от началната страница на кантората (${base}/app) → „Предложения за поемане“. Без решение нищо не се променя.`,
        ]
      : [
          `${fromName}, the owner of “${legalName}”, proposes that your firm takes over the company in Fakturist. If you accept, the owner and its members leave, and your firm manages it under the active authorisation and may later invite a new owner.`,
          `Decide by ${date} on your firm’s start page (${base}/app) → “Takeover proposals”. Without a decision nothing changes.`,
        ];
  } else if (kind === 'handover.memberRemoved') {
    const { legalName, firmName, reason } = Removed.parse(payload);
    subject = bg
      ? `Фактурист — членството Ви във „${legalName}“ е прекратено`
      : `Fakturist — your membership of “${legalName}” has ended`;
    paragraphs = bg
      ? [
          reason
            ? `Членството Ви във „${legalName}“ във Фактурист е прекратено: екипът на Фактурист повери фирмата на счетоводната ѝ кантора ${firmName}. Основание: ${reason}.`
            : `Членството Ви във „${legalName}“ във Фактурист е прекратено: собственикът повери фирмата на счетоводната ѝ кантора ${firmName}.`,
          'Документите остават при фирмата. API ключовете, които сте създали за нея, са оттеглени.',
          `Ако не сте съгласни, пишете ни на ${contact} — разглежда го човек. Можете да се обърнете и към компетентния български съд.`,
        ]
      : [
          reason
            ? `Your membership of “${legalName}” in Fakturist has ended: the Fakturist team entrusted the company to its accounting firm ${firmName}. Reason: ${reason}.`
            : `Your membership of “${legalName}” in Fakturist has ended: the owner entrusted the company to its accounting firm ${firmName}.`,
          'The documents stay with the company. The API keys you created for it are revoked.',
          `If you disagree, write to us at ${contact} — a person reviews it. You may also turn to the competent Bulgarian court.`,
        ];
  } else if (kind === 'handover.firmAccepted' || kind === 'handover.firmDeclined') {
    const { legalName, firmName } = Decided.parse(payload);
    const accepted = kind === 'handover.firmAccepted';
    subject = bg
      ? `Фактурист — ${firmName} ${accepted ? 'пое' : 'отказа'} „${legalName}“`
      : `Fakturist — ${firmName} ${accepted ? 'took over' : 'declined'} “${legalName}”`;
    paragraphs = accepted
      ? bg
        ? [
            `${firmName} прие предложението: „${legalName}“ вече се води от кантората по пълномощното, а Вие и членовете на фирмата нямате достъп до нея.`,
            `Ако не сте правили това предложение, пишете ни веднага на ${contact}.`,
          ]
        : [
            `${firmName} accepted the proposal: “${legalName}” is now managed by the firm under the authorisation, and you and the company’s members no longer have access to it.`,
            `If you did not make this proposal, write to us at once at ${contact}.`,
          ]
      : bg
        ? [
            `${firmName} отказа да поеме „${legalName}“. Вие оставате собственик — нищо не е променено.`,
          ]
        : [
            `${firmName} declined to take over “${legalName}”. You remain the owner — nothing has changed.`,
          ];
  } else if (kind === 'handover.master') {
    const { legalName, role, reason } = Master.parse(payload);
    subject = bg
      ? `Фактурист — промяна в собствеността на „${legalName}“`
      : `Fakturist — a change in the ownership of “${legalName}”`;
    const text = {
      bg: {
        newOwner: `Екипът на Фактурист Ви направи собственик на „${legalName}“ след проверка на документ за представителство. Влезте в ${base}/app — ако профилът Ви е нов, задайте парола с връзката от отделното писмо.`,
        oldOwnerAdmin: `Екипът на Фактурист предаде собствеността на „${legalName}“ на друг човек след проверка на документ за представителство. Вие оставате администратор на фирмата.`,
        oldOwnerRemoved: `Екипът на Фактурист прекрати членството Ви във „${legalName}“ и предаде собствеността ѝ след проверка на документ за представителство. Действаме така при спор за собствеността или изгубен достъп (т. 8 и 10 от общите условия).`,
        firm: `Екипът на Фактурист повери „${legalName}“ на кантората Ви по пълномощно, с декларацията по т. 1а от договора за обработване. Фирмата е в началната страница на кантората (${base}/app); можете да поканите нов собственик.`,
      },
      en: {
        newOwner: `The Fakturist team made you the owner of “${legalName}” after checking a document of representation. Sign in at ${base}/app — if your account is new, set a password with the link in the separate email.`,
        oldOwnerAdmin: `The Fakturist team handed the ownership of “${legalName}” over to another person after checking a document of representation. You stay an administrator of the company.`,
        oldOwnerRemoved: `The Fakturist team ended your membership of “${legalName}” and handed over its ownership after checking a document of representation. We do this in a dispute over ownership or after lost access (items 8 and 10 of the terms of service).`,
        firm: `The Fakturist team entrusted “${legalName}” to your firm under an authorisation, with the declaration under item 1a of the data processing agreement. The company is on your firm’s start page (${base}/app); you can invite a new owner.`,
      },
    } as const;
    paragraphs = [
      text[locale][role],
      bg ? `Основание: ${reason}.` : `Reason: ${reason}.`,
      bg
        ? `Ако не сте съгласни, пишете ни на ${contact} — решението се преглежда от човек. Можете да се обърнете и към компетентния български съд.`
        : `If you disagree, write to us at ${contact} — a person reviews the decision. You may also turn to the competent Bulgarian court.`,
    ];
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  const signature = await mailSignature(locale);
  return { to: toEmail, subject, ...wrap(paragraphs, signature, locale), attachments: [] };
}
