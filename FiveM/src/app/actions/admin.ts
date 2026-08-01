'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  audit,
  endSession,
  recordAttempt,
  requireAdmin,
  startSession,
  tooManyAttempts,
  verifyPassword,
} from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { parseCfxJoinCode, parseServerAddress, formatServerAddress } from '@/lib/fivem';
import { isValidSlug, slugify } from '@/lib/slug';

import { readLocale } from './locale';

/**
 * Всички админ мутации. `requireAdmin()` е ПЪРВИЯТ ред във всяка — Next
 * изпълнява server action-а преди да рендира страницата, значи проверка в
 * `page.tsx` или в middleware закъснява точно с една мутация.
 */

// ── Вход и изход ────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const password = String(formData.get('password') ?? '');

  if (await tooManyAttempts()) {
    await recordAttempt(false);
    redirect(`/${locale}/admin/login?error=rate`);
  }

  if (!verifyPassword(password)) {
    await recordAttempt(false);
    redirect(`/${locale}/admin/login?error=bad`);
  }

  await recordAttempt(true);
  // Нова сесия при всеки вход — старият токен не се наследява.
  await startSession();
  await audit('login', 'admin');
  redirect(`/${locale}/admin`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  await endSession();
  redirect(`/${locale}/admin/login`);
}

// ── Сървъри ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Ръчно спонсориране. Дните са число, не свободна дата — по-малко грешки. */
export async function setFeaturedAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const days = Number(formData.get('days') ?? 0);
  if (!id || !Number.isFinite(days)) return;

  const featuredUntil = days > 0 ? new Date(Date.now() + days * DAY_MS) : null;
  const server = await prisma.server.update({
    where: { id },
    data: { featuredUntil },
    select: { slug: true },
  });

  await audit(
    'featured',
    server.slug,
    featuredUntil ? `до ${featuredUntil.toISOString()} (${days} дни)` : 'спряно',
  );
  revalidatePath('/', 'layout');
}

const serverEditSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  discordUrl: z.string().trim().max(200).optional(),
  websiteUrl: z.string().trim().max(200).optional(),
  framework: z.enum(['ESX', 'QBCORE', 'QBOX', 'OX_CORE', 'STANDALONE', 'UNKNOWN']),
  whitelist: z.boolean(),
  /** Свободни етикети, разделени със запетая. Това е ЕДИНСТВЕНИЯТ им писач. */
  tags: z.array(z.string().trim().min(1).max(24)).max(12),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});

export async function editServerAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  const parsed = serverEditSchema.safeParse({
    tagline: text('tagline'),
    description: text('description'),
    discordUrl: text('discordUrl'),
    websiteUrl: text('websiteUrl'),
    framework: text('framework') ?? 'UNKNOWN',
    whitelist: formData.get('whitelist') === 'on',
    tags: (text('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12),
    status: text('status') ?? 'APPROVED',
  });
  if (!parsed.success) return;

  const server = await prisma.server.update({
    where: { id },
    data: {
      tagline: parsed.data.tagline ?? null,
      description: parsed.data.description ?? null,
      discordUrl: parsed.data.discordUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
      framework: parsed.data.framework,
      whitelist: parsed.data.whitelist,
      tags: parsed.data.tags,
      status: parsed.data.status,
    },
    select: { slug: true },
  });

  await audit('server-edit', server.slug, `етикети: ${parsed.data.tags.join(', ') || '—'}`);
  revalidatePath('/', 'layout');
}

// ── Ревюта ──────────────────────────────────────────────────────────────────

export async function moderateReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || (decision !== 'APPROVED' && decision !== 'REJECTED')) return;

  await prisma.review.update({ where: { id }, data: { status: decision } });
  await audit('review', id, decision);
  revalidatePath('/', 'layout');
}

// ── Заявки за листване ──────────────────────────────────────────────────────

/**
 * Одобряване на заявка = създаване на публичен сървър от нея. Дотук заявките
 * бяха черна дупка: само запис и изтриване по срок, нула четци.
 */
export async function approveSubmissionAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) return;

  const joinCode = parseCfxJoinCode(submission.cfxJoinCode);
  const address = parseServerAddress(submission.address);

  const base = slugify(submission.serverName);
  const slug = isValidSlug(base) ? base : `server-${submission.id.slice(0, 8)}`;
  const taken = await prisma.server.findUnique({ where: { slug }, select: { id: true } });

  await prisma.server.create({
    data: {
      slug: taken ? `${slug}-${submission.id.slice(0, 6)}` : slug,
      name: submission.serverName,
      cfxJoinCode: joinCode,
      address: address ? formatServerAddress(address) : null,
      discordUrl: submission.discordUrl,
      description: submission.note,
      source: 'SUBMITTED',
      status: 'APPROVED',
    },
  });

  await prisma.submission.update({ where: { id }, data: { status: 'APPROVED' } });
  await audit('submission', submission.serverName, 'одобрена и публикувана');
  revalidatePath('/', 'layout');
}

export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await prisma.submission.update({ where: { id }, data: { status: 'REJECTED' } });
  await audit('submission', id, 'отказана');
  revalidatePath('/', 'layout');
}

// ── Сигнали по DSA ──────────────────────────────────────────────────────────

export async function handleReportAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || (decision !== 'APPROVED' && decision !== 'REJECTED')) return;

  // `handledAt` не е козметика: от него тече уведомяването по чл. 16(5) DSA.
  await prisma.report.update({
    where: { id },
    data: { status: decision, handledAt: new Date() },
  });
  await audit('report', id, decision === 'APPROVED' ? 'основателен' : 'неоснователен');
  revalidatePath('/', 'layout');
}
