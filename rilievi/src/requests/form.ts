import type { TeamSize } from '@prisma/client';
import { z } from 'zod';
import { emailSchema } from '../auth/email.js';

/**
 * Формата „Richiedi l'accesso“ от публичната страница. Всичко идва от непознат човек: текстът се чисти
 * (без управляващи знаци), реже се до колоната в базата и се проверява тук, преди да стигне до услугата.
 */

/** Полетата по реда на екрана — по него излиза и обобщението на грешките. */
export const REQUEST_FIELDS = [
  'name',
  'company',
  'email',
  'phone',
  'city',
  'teamSize',
  'message',
  'privacy',
] as const;
export type RequestField = (typeof REQUEST_FIELDS)[number];

export const TEAM_SIZES = [
  'S1_5',
  'S6_20',
  'S21_50',
  'S50_PLUS',
] as const satisfies readonly TeamSize[];

export const REQUEST_LIMITS = {
  name: 120,
  company: 120,
  phone: 40,
  city: 120,
  message: 2000,
} as const;

export type RequestErrorCode = 'required' | 'tooShort' | 'tooLong' | 'email' | 'phone' | 'invalid';
export type RequestErrors = Partial<Record<RequestField, RequestErrorCode>>;
/** Въведеното, както да се покаже пак при грешка (низове, никога undefined). */
export type RequestValues = Record<RequestField, string>;

export interface RequestInput {
  name: string;
  company: string;
  email: string;
  phone: string | null;
  city: string | null;
  teamSize: TeamSize | null;
  message: string | null;
}

export type ParsedRequest =
  | { kind: 'ok'; data: RequestInput }
  | { kind: 'invalid'; errors: RequestErrors; values: RequestValues }
  /** Попълнен капан за ботове (скритото поле „website“): отговорът е като при успех, нищо не се пази. */
  | { kind: 'spam' };

/** Капанът за ботове: поле, скрито от хората (и от екранния четец), което само бот попълва. */
export const HONEYPOT = 'website';

const raw = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];
  return typeof value === 'string' ? value : '';
};

/** Един ред: управляващите знаци и поредните интервали стават един интервал. */
function oneLine(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Абзаци: новият ред остава, другите управляващи знаци стават интервал. */
function paragraphs(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function requiredText(value: string, max: number): RequestErrorCode | null {
  if (!value) return 'required';
  if (value.length < 2) return 'tooShort';
  return value.length > max ? 'tooLong' : null;
}

/** Телефон: цифри, интервали и + ( ) . / - — поне 6 цифри. */
const PHONE = /^[+0-9 ()./-]+$/;
const teamSizeSchema = z.enum(TEAM_SIZES);

export function parseAccessRequest(body: Record<string, unknown>): ParsedRequest {
  if (raw(body, HONEYPOT).trim() !== '') return { kind: 'spam' };
  const values: RequestValues = {
    name: oneLine(raw(body, 'name')).slice(0, REQUEST_LIMITS.name + 1),
    company: oneLine(raw(body, 'company')).slice(0, REQUEST_LIMITS.company + 1),
    email: oneLine(raw(body, 'email')).slice(0, 255),
    phone: oneLine(raw(body, 'phone')).slice(0, REQUEST_LIMITS.phone + 1),
    city: oneLine(raw(body, 'city')).slice(0, REQUEST_LIMITS.city + 1),
    teamSize: oneLine(raw(body, 'teamSize')).slice(0, 20),
    message: paragraphs(raw(body, 'message')).slice(0, REQUEST_LIMITS.message + 1),
    privacy: raw(body, 'privacy') === 'si' ? 'si' : '',
  };
  const errors: RequestErrors = {};
  const nameError = requiredText(values.name, REQUEST_LIMITS.name);
  if (nameError) errors.name = nameError;
  const companyError = requiredText(values.company, REQUEST_LIMITS.company);
  if (companyError) errors.company = companyError;
  const email = emailSchema.safeParse(values.email);
  if (!values.email) errors.email = 'required';
  else if (!email.success) errors.email = 'email';
  if (values.phone) {
    if (values.phone.length > REQUEST_LIMITS.phone) errors.phone = 'tooLong';
    else if (!PHONE.test(values.phone) || values.phone.replace(/\D/g, '').length < 6)
      errors.phone = 'phone';
  }
  if (values.city.length > REQUEST_LIMITS.city) errors.city = 'tooLong';
  const teamSize = values.teamSize ? teamSizeSchema.safeParse(values.teamSize) : null;
  if (teamSize && !teamSize.success) errors.teamSize = 'invalid';
  if (values.message.length > REQUEST_LIMITS.message) errors.message = 'tooLong';
  if (values.privacy !== 'si') errors.privacy = 'required';
  if (Object.keys(errors).length > 0 || !email.success) return { kind: 'invalid', errors, values };
  return {
    kind: 'ok',
    data: {
      name: values.name,
      company: values.company,
      email: email.data,
      phone: values.phone || null,
      city: values.city || null,
      teamSize: teamSize?.success ? teamSize.data : null,
      message: values.message || null,
    },
  };
}

/** Празната форма — за първото отваряне на страницата. */
export function emptyRequestValues(): RequestValues {
  return Object.fromEntries(REQUEST_FIELDS.map((key) => [key, ''])) as RequestValues;
}
