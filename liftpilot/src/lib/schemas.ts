// Validation of every external input (forms and server actions).
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, passwordPolicyOk } from './password-policy';

const trimmed = (max: number) => z.string().trim().max(max);
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
    company: trimmed(160).min(2),
    vatNumber: optionalText(40),
    city: optionalText(120),
    name: trimmed(120).min(2),
    email: emailSchema,
    password: z.string().max(200),
    confirm: z.string().max(200),
    /** the terms of use (with the processing agreement), the declaration of acting as a business, the results as drafts
     *  and the specific approval of the clauses of arts. 1341–1342 c.c.: the four confirmations of src/lib/consents.ts */
    accept: checked,
    business: checked,
    drafts: checked,
    clauses: checked,
  })
  .refine((v) => passwordPolicyOk(v.password), { path: ['password'], message: 'weakPassword' })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailSchema });

/** The link of the registration and the password chosen there. */
export const verifySchema = z.object({ token: linkToken, password: z.string().min(1).max(200) });

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
  name: trimmed(160).min(1),
  address: optionalText(200),
  city: optionalText(120),
  province: optionalText(40),
  plantNumber: optionalText(80),
  client: optionalText(160),
  notes: optionalText(4000),
});
/** What the installation is for (Project.kind): the machine replacement alone, or a whole project. */
export const projectKindSchema = z.enum(['REPLACEMENT', 'FULL']);
export type ProjectKind = z.infer<typeof projectKindSchema>;

/** The roles a company's owner gives to the colleagues: Progettista, Commerciale, Tecnico (src/lib/rbac.ts). */
export const roleSchema = z.enum(['ENGINEER', 'SALES', 'TECHNICIAN']);

export const userCreateSchema = z.object({
  email: emailSchema,
  name: trimmed(120).min(1),
  role: roleSchema,
});

export const companyCreateSchema = z.object({
  name: trimmed(160).min(1),
  vatNumber: optionalText(40),
  city: optionalText(120),
  ownerEmail: emailSchema,
  ownerName: trimmed(120).min(1),
});

export const reviewSchema = z.object({ note: optionalText(1000) });
export const calcLabelSchema = optionalText(120);
export const idSchema = z.string().trim().min(1).max(40).regex(/^[a-z0-9]+$/i);

export { PASSWORD_MIN_LENGTH };
