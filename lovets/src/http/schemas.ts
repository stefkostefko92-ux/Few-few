import { z } from 'zod';

const market = z.enum(['BG', 'IT']);
const channel = z.enum(['email', 'phone', 'form', 'linkedin']);
const registry = z.enum(['KZP', 'RPO']);
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const LoginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().max(12),
});

export const CheckBody = z.object({
  query: z.string().min(1).max(300),
  market: market.optional(),
  sourceUrl: z.url().max(2000).nullable().optional(),
  phoneSource: z
    .enum(['public_directory', 'company_site', 'business_registry', 'other'])
    .optional(),
  businessLineConfirmed: z.boolean().optional(),
});

export const RegistryResultsBody = z.object({
  registry,
  checkedAt: isoDate,
  source: z.string().min(1).max(200),
  csv: z.string().max(20_000_000),
});

export const KzpSnapshotBody = z.object({
  takenAt: isoDate,
  /** Изрично потвърждение, ако снимката е под половината от предишната (подозрително отрязан файл). */
  confirmShrink: z.boolean().default(false),
  source: z.string().min(1).max(200),
  text: z.string().max(20_000_000),
});

export const RpoExportBody = z.object({
  numbers: z.array(z.string().max(40)).max(200_000),
  format: z.enum(['national', 'e164']).default('national'),
});

export const SuppressionBody = z.object({
  value: z.string().min(3).max(300),
  market: market.default('BG'),
  scope: z.enum(['value', 'domain']),
  reason: z.string().min(3).max(300),
});

export const ConsentBody = z.object({
  value: z.string().min(3).max(300),
  market: market.default('BG'),
  channel,
  givenAt: isoDate,
  method: z.string().min(3).max(200),
  wording: z.string().min(10).max(2000),
});
