'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { formatServerAddress, parseCfxJoinCode, parseServerAddress } from '@/lib/fivem';
import { withinGlobalRateLimit } from '@/lib/rate-limit';
import type { FormErrorCode } from '@/lib/messages';
import { readLocale } from './locale';

/**
 * Заявка за листване. Влиза в модераторска опашка — нищо не става публично
 * автоматично. Основание за имейла: чл. 6, ал. 1, б. „б“ и „е“ ОРЗД (стъпки по
 * искане на подателя + законен интерес да поддържаме директорията).
 */
const httpsUrl = z
  .string()
  .trim()
  .max(200)
  .url()
  .refine((value) => value.startsWith('https://'));

const submissionSchema = z
  .object({
    serverName: z.string().trim().min(2).max(80),
    cfxJoinCode: z.string().trim().max(120).optional(),
    address: z.string().trim().max(120).optional(),
    discordUrl: httpsUrl.optional(),
    contactEmail: z.string().trim().max(120).email(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Boolean(data.cfxJoinCode || data.address));

/** Полето → код на грешката, за да знае формата кое поле да маркира. */
const FIELD_ERROR: Record<string, FormErrorCode> = {
  serverName: 'required_name',
  contactEmail: 'required_email',
  cfxJoinCode: 'required_target',
  address: 'invalid_address',
  discordUrl: 'invalid_url',
};

function fail(locale: string, code: FormErrorCode, field?: string): never {
  const suffix = field ? `&field=${encodeURIComponent(field)}` : '';
  redirect(`/${locale}/submit?error=${code}${suffix}`);
}

export async function submitServerAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  // Honeypot: попълнено поле = бот.
  if (String(formData.get('website') ?? '').length > 0) redirect(`/${locale}/submit?ok=1`);
  if (!withinGlobalRateLimit('submit')) fail(locale, 'rate_limit');

  /** Празното поле е „непопълнено“, не „празен низ“. */
  const field = (name: string): string | undefined => {
    const value = formData.get(name);
    if (typeof value !== 'string') return undefined;
    return value.trim() === '' ? undefined : value;
  };

  const parsed = submissionSchema.safeParse({
    serverName: field('serverName'),
    cfxJoinCode: field('cfxJoinCode'),
    address: field('address'),
    discordUrl: field('discordUrl'),
    contactEmail: field('contactEmail'),
    note: field('note'),
  });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? '');
    fail(locale, FIELD_ERROR[path] ?? 'required_target', path || undefined);
  }

  const data = parsed.data;

  const joinCode = data.cfxJoinCode ? parseCfxJoinCode(data.cfxJoinCode) : null;
  if (data.cfxJoinCode && !joinCode) fail(locale, 'invalid_cfx', 'cfxJoinCode');

  const address = data.address ? parseServerAddress(data.address) : null;
  if (data.address && !address) fail(locale, 'invalid_address', 'address');

  try {
    await prisma.submission.create({
      data: {
        serverName: data.serverName,
        cfxJoinCode: joinCode,
        address: address ? formatServerAddress(address) : null,
        discordUrl: data.discordUrl ?? null,
        contactEmail: data.contactEmail,
        note: data.note ?? null,
      },
    });
  } catch (error) {
    // Глътната грешка без лог значи мълчалив провал в продукция.
    console.error('[submit] записът на заявката се провали', error);
    fail(locale, 'storage');
  }

  redirect(`/${locale}/submit?ok=1`);
}
