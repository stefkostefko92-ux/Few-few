'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { parseCfxJoinCode, parseServerAddress, formatServerAddress } from '@/lib/fivem';

/**
 * Заявка за листване. Влиза в модераторска опашка — нищо не става публично
 * автоматично.
 *
 * Анти-спам БЕЗ проследяване (продуктово обещание: не пазим IP):
 *  - honeypot поле, което истински човек не вижда;
 *  - таван на заявките за целия процес в минута.
 * Съзнателен компромис: тавана може да удари и честен подател при внезапна
 * вълна — цената е „опитай пак след минута“, не досие с IP адреси.
 */
const MAX_SUBMISSIONS_PER_MINUTE = 20;
let windowStart = 0;
let windowCount = 0;

function withinRateLimit(now = Date.now()): boolean {
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= MAX_SUBMISSIONS_PER_MINUTE;
}

const httpsUrl = z
  .string()
  .trim()
  .max(200)
  .url('Линкът трябва да е пълен адрес (https://…)')
  .refine((value) => value.startsWith('https://'), 'Линкът трябва да е https://');

const submissionSchema = z
  .object({
    serverName: z.string().trim().min(2, 'Името е задължително').max(80),
    cfxJoinCode: z.string().trim().max(120).optional(),
    address: z.string().trim().max(120).optional(),
    discordUrl: httpsUrl.optional(),
    contactEmail: z.string().trim().max(120).email('Невалиден имейл'),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Boolean(data.cfxJoinCode || data.address), {
    message: 'Нужен е cfx.re код или адрес host:port',
    path: ['cfxJoinCode'],
  });

function fail(message: string): never {
  redirect(`/submit?error=${encodeURIComponent(message)}`);
}

export async function submitServerAction(formData: FormData): Promise<void> {
  // Honeypot: попълнено поле = бот.
  if (String(formData.get('website') ?? '').length > 0) redirect('/submit?ok=1');
  if (!withinRateLimit()) fail('Твърде много заявки в момента. Опитай пак след минута.');

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
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Проверѝ попълненото.');

  const data = parsed.data;

  const joinCode = data.cfxJoinCode ? parseCfxJoinCode(data.cfxJoinCode) : null;
  if (data.cfxJoinCode && !joinCode) fail('Невалиден cfx.re код.');

  const address = data.address ? parseServerAddress(data.address) : null;
  if (data.address && !address) fail('Невалиден адрес. Формат: host:port (например 1.2.3.4:30120).');

  try {
    await prisma.submission.create({
      data: {
        serverName: data.serverName,
        cfxJoinCode: joinCode,
        address: address ? formatServerAddress(address) : null,
        discordUrl: data.discordUrl || null,
        contactEmail: data.contactEmail,
        note: data.note || null,
      },
    });
  } catch {
    fail('Не успяхме да запишем заявката. Опитай пак по-късно.');
  }

  redirect('/submit?ok=1');
}
