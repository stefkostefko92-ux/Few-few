import { z } from 'zod';
import { config } from '../config.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';
import { mailLongDate, mailSignature, recipientLocale } from './locale.js';

/**
 * Писмата за предаването на собственост (SPEC 84–87, src/accounts/handover*.ts). Поканата към човека е
 * `transfer.invite` (с токена, templates.ts); тук са известията — без токени, на езика на получателя.
 */
export const HANDOVER_MAIL_KINDS = [
  'handover.accepted',
  'handover.firmProposal',
  'handover.firmAccepted',
  'handover.firmDeclined',
  'handover.master',
] as const;

const Name = z.string().min(1).max(300);
const Accepted = z.object({ legalName: Name, newOwnerName: Name });
const Proposal = z.object({ legalName: Name, fromName: Name, expiresAt: z.string().datetime() });
const Decided = z.object({ legalName: Name, firmName: Name });
const Master = z.object({
  legalName: Name,
  role: z.enum(['newOwner', 'oldOwnerAdmin', 'oldOwnerRemoved', 'firm']),
});

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
    const { legalName, newOwnerName } = Accepted.parse(payload);
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
    const { legalName, fromName, expiresAt } = Proposal.parse(payload);
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
    const { legalName, role } = Master.parse(payload);
    subject = bg
      ? `Фактурист — промяна в собствеността на „${legalName}“`
      : `Fakturist — a change in the ownership of “${legalName}”`;
    const text = {
      bg: {
        newOwner: `Екипът на Фактурист Ви направи собственик на „${legalName}“ след проверка на документите. Влезте в ${base}/app — ако профилът Ви е нов, задайте парола с връзката от отделното писмо.`,
        oldOwnerAdmin: `Екипът на Фактурист предаде собствеността на „${legalName}“ на друг човек след проверка на документите. Вие оставате администратор на фирмата.`,
        oldOwnerRemoved: `Екипът на Фактурист предаде „${legalName}“ след проверка на документите и достъпът Ви до фирмата е спрян.`,
        firm: `Екипът на Фактурист предаде „${legalName}“ на кантората Ви по пълномощно. Фирмата е в началната страница на кантората (${base}/app); можете да поканите нов собственик.`,
      },
      en: {
        newOwner: `The Fakturist team made you the owner of “${legalName}” after checking the documents. Sign in at ${base}/app — if your account is new, set a password with the link in the separate email.`,
        oldOwnerAdmin: `The Fakturist team handed the ownership of “${legalName}” over to another person after checking the documents. You stay an administrator of the company.`,
        oldOwnerRemoved: `The Fakturist team handed “${legalName}” over after checking the documents, and your access to the company is suspended.`,
        firm: `The Fakturist team handed “${legalName}” over to your firm under an authorisation. The company is on your firm’s start page (${base}/app); you can invite a new owner.`,
      },
    } as const;
    paragraphs = [
      text[locale][role],
      bg
        ? `Ако не сте съгласни, пишете ни на ${contact} — решението се преглежда от човек.`
        : `If you disagree, write to us at ${contact} — a person reviews the decision.`,
    ];
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  const signature = await mailSignature(locale);
  return { to: toEmail, subject, ...wrap(paragraphs, signature, locale), attachments: [] };
}
