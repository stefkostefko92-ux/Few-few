// Validation of every external input (forms and server actions).
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, passwordPolicyOk } from './password-policy';

const trimmed = (max: number) => z.string().trim().max(max);
/** A name printed on one line (a document's header, a PDF's information): a control character pasted into it (a tab,
 *  U+0085) becomes a space before the trim and the length. */
const oneLine = (max: number, min: number) => z.string().transform((s) => s.replace(/\p{Cc}+/gu, ' ')).pipe(trimmed(max).min(min));
const optionalText = (max: number) => trimmed(max).transform((s) => (s === '' ? null : s));

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const newPasswordSchema = z
  .object({ current: z.string().max(200), next: z.string().max(200), confirm: z.string().max(200) })
  .refine((v) => passwordPolicyOk(v.next), { path: ['next'], message: 'weakPassword' })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalidLink');
const checked = z.literal('on', { errorMap: () => ({ message: 'consentRequired' }) });

/** Self-registration: the company and its owner; the address is confirmed by a link before the first sign-in. */
export const registerSchema = z
  .object({
    company: oneLine(160, 2),
    vatNumber: optionalText(40),
    city: optionalText(120),
    name: oneLine(120, 2),
    email: emailSchema,
    password: z.string().max(200),
    confirm: z.string().max(200),
    /** the terms of use (with the processing agreement), the declaration of acting as a business and the results as
     *  drafts (REGISTER_CONSENTS of src/lib/consents.ts); the clauses of arts. 1341–1342 c.c. are approved later, on the
     *  page of the e-mail link with the password (verifySchema) */
    accept: checked,
    business: checked,
    drafts: checked,
  })
  .refine((v) => passwordPolicyOk(v.password), { path: ['password'], message: 'weakPassword' })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailSchema });

/** A tick of a form: ticked or not (anything but 'on' is not). */
const tick = z.string().max(10).transform((v) => v === 'on');

/** The link of the registration and what its page sends: the password chosen there (empty is a field to fill, which
 *  the action says, never a bad link), `clauses` the specific approval of the clauses (arts. 1341–1342 c.c.), required
 *  when the link is a waiting registration's, and `accept` the terms in force, required when that registration was made
 *  under an earlier version (src/server/account-actions.ts). */
export const verifySchema = z.object({ token: linkToken, password: z.string().max(200), clauses: tick, accept: tick });

/** The token of a beta invitation (the fragment of its registration link, sent back as the form's `invito`,
 *  src/lib/beta-invites.ts): absent, or a link's token. */
export const betaTokenSchema = z.union([z.literal(''), linkToken]);

/** The platform administrator's beta invitation: the tester's address and the administrator's own note on it. */
export const betaInviteSchema = z.object({ email: emailSchema, note: optionalText(200) });

/** The link of a colleague's invitation and the password the colleague chooses. */
export const inviteAcceptSchema = z
  .object({ token: linkToken, next: z.string().max(200), confirm: z.string().max(200) })
  .refine((v) => passwordPolicyOk(v.next), { path: ['next'], message: 'weakPassword' })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

/** The link of a password reset and the new password. */
export const resetSchema = z
  .object({ token: linkToken, next: z.string().max(200), confirm: z.string().max(200) })
  .refine((v) => passwordPolicyOk(v.next), { path: ['next'], message: 'weakPassword' })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

export const projectSchema = z.object({
  name: oneLine(160, 1),
  address: optionalText(200),
  city: optionalText(120),
  province: optionalText(40),
  plantNumber: optionalText(80),
  client: optionalText(160),
  notes: optionalText(4000),
});
/** The roles a company's owner gives to the colleagues: Capotecnico, Progettista, Tecnico, Commerciale (src/lib/rbac.ts). */
export const roleSchema = z.enum(['CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES']);

export const userCreateSchema = z.object({
  email: emailSchema,
  name: oneLine(120, 1),
  role: roleSchema,
});

export const companyCreateSchema = z.object({
  name: oneLine(160, 1),
  vatNumber: optionalText(40),
  city: optionalText(120),
  ownerEmail: emailSchema,
  ownerName: oneLine(120, 1),
});

export const reviewSchema = z.object({ note: optionalText(1000) });
export const calcLabelSchema = optionalText(120);
export const idSchema = z.string().trim().min(1).max(40).regex(/^[a-z0-9]+$/i);

export { PASSWORD_MIN_LENGTH };
