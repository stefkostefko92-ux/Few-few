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

export const projectSchema = z.object({
  name: trimmed(160).min(1),
  address: optionalText(200),
  city: optionalText(120),
  province: optionalText(40),
  plantNumber: optionalText(80),
  client: optionalText(160),
  notes: optionalText(4000),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const roleSchema = z.enum(['VIEWER', 'TECHNICIAN', 'ENGINEER', 'MANAGER', 'ADMIN', 'OWNER']);

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
