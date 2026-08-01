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
import { reportDecision, sendMail, submissionDecision } from '@/lib/email';
import {
  displayName,
  parseCfxJoinCode,
  parseServerAddress,
  formatServerAddress,
} from '@/lib/fivem';
import { MAX_FEATURED_DAYS } from '@/lib/rating';
import { isValidSlug, slugify } from '@/lib/slug';
import { channelKey, normalizeChannel, profileUrl, STREAM_PLATFORMS } from '@/lib/streamers';

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

  // Блокираният опит НЕ се записва. Записваше се, а това плъзгаше прозореца
  // напред при всеки следващ опит: нападател с шест заявки на минута държеше
  // собственика заключен вечно. Прозорецът трябва да може да се източи.
  if (await tooManyAttempts()) {
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
  // `Number.isFinite` пропускаше `1e15`: `new Date(Date.now() + 1e15 * DAY_MS)`
  // е `Invalid Date`, а `toISOString()` върху него хвърля `RangeError` — насред
  // мутация, зад която стоят пари. `max={365}` в полето е само клиентски и не
  // важи за директен POST.
  if (!id || !Number.isInteger(days) || days < 0 || days > MAX_FEATURED_DAYS) return;

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

/**
 * Отговор на СЪРВЪРА под ревюто. Условията го обещават от самото начало
 * („може да поиска преглед или да публикува отговор; отговорът се показва под
 * ревюто“), а път за създаване нямаше — обещание без изпълнител.
 *
 * Не е козметика: правото на отговор е противотежестта, която прави
 * непроверените отзиви защитими (чл. 6, ал. 1, б. „ж“ и чл. 7, ал. 6 от
 * Дир. 2005/29/ЕО). Минава през нас, а не директно от сървъра, защото нямаме
 * акаунти — собственикът пише, ние публикуваме.
 */
export async function replyToReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // Текстът е от собственика на сървъра, тоест недоверен: минава през
  // `displayName` (маха управляващи и двупосочни символи) и през таван.
  const raw = String(formData.get('reply') ?? '').trim();
  const reply = raw === '' ? null : displayName(raw.slice(0, 1000), '');

  await prisma.review.update({
    where: { id },
    data: { reply: reply || null, repliedAt: reply ? new Date() : null },
  });
  await audit('review-reply', id, reply ? 'публикуван отговор' : 'отговорът е свален');
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

  /**
   * Заявката се ЗАЕМА атомарно, преди да се създаде каквото и да е. Без това
   * действието не беше идемпотентно: back-бутон, двойно щракване или повторен
   * POST със същата сесия минаваха втори път, а уникалният ключ не помага —
   * `cfxJoinCode` е `String?` и Postgres третира всеки NULL като различен,
   * тоест заявка само с адрес се публикуваше ДВА пъти (втория с друг slug) и
   * подателят получаваше два имейла „публикуван“. Третото щракване гърмеше с
   * необработен `P2002` на slug-а.
   */
  const claimed = await prisma.submission.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED' },
  });
  if (claimed.count === 0) return;

  const joinCode = parseCfxJoinCode(submission.cfxJoinCode);
  const address = parseServerAddress(submission.address);

  const base = slugify(submission.serverName);
  const slug = isValidSlug(base) ? base : `server-${submission.id.slice(0, 8)}`;
  const taken = await prisma.server.findUnique({ where: { slug }, select: { id: true } });

  await prisma.server.create({
    data: {
      slug: taken ? `${slug}-${submission.id.slice(0, 6)}` : slug,
      // Името идва от АНОНИМЕН подател и досега влизаше дословно в публичния
      // списък, в JSON-LD и в темата на изходящия имейл. `jsonLdString` екранира
      // `<`, но не и двупосочните маркери (U+202E), с които името може да обърне
      // текста наоколо. Правилото на продукта е недоверен низ да минава през
      // `displayName` — тук не минаваше.
      name: displayName(submission.serverName, 'Сървър'),
      cfxJoinCode: joinCode,
      address: address ? formatServerAddress(address) : null,
      discordUrl: submission.discordUrl,
      description: submission.note,
      source: 'SUBMITTED',
      status: 'APPROVED',
    },
  });

  await sendMail({
    to: submission.contactEmail,
    ...submissionDecision(submission.serverName, true),
  });
  await audit('submission', submission.serverName, 'одобрена и публикувана');
  revalidatePath('/', 'layout');
}

export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  /**
   * Мотивът е ПОЛЕ, не подразбиране. Чл. 17(3) DSA иска решението да носи
   * фактите и обстоятелствата ПО СЛУЧАЯ и конкретното приложено правило —
   * общият списък „най-често заради…“ в шаблона не е мотив, а изброяване на
   * възможности. Дефектът беше структурен: формата на модератора нямаше къде
   * да се впише мотив, значи шаблонът нямаше как да го носи.
   */
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 1000);

  // Същото заемане като при одобрението: без него всяко повторно щракване
  // праща нов отказен имейл на подателя.
  const claimed = await prisma.submission.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED' },
  });
  if (claimed.count === 0) return;

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) return;
  // Мотивирано решение по чл. 17 DSA. Задължението отпада само когато
  // контактите на подателя НЕ са известни — тук имейлът е задължително поле.
  await sendMail({
    to: submission.contactEmail,
    ...submissionDecision(submission.serverName, false, reason),
  });
  await audit('submission', submission.serverName, `отказана: ${reason || '(без мотив)'}`);
  revalidatePath('/', 'layout');
}

// ── Стриймъри ───────────────────────────────────────────────────────────────

/**
 * Решението по канал. `REJECTED` НЕ е „скрит“ — това е записано възражение по
 * чл. 21 ОРЗД и `scripts/discover-streamers.ts` изрично отказва да го
 * презапише. Затова изтриването е отделно действие и не е препоръчителният път:
 * изтрит запис се появява пак при следващия пробег на cron-а.
 *
 * ПРИ ОТКАЗ ПРОФИЛЪТ СЕ ИЗЧИСТВА. Задържането на статус беше недостатъчно:
 * името, адресът, заглавието на предаването и броят зрители оставаха в базата,
 * докато политиката обещава „само платформата и името на канала“. Тоест
 * обработването НЕ беше прекратено (чл. 21, ал. 3), а текстът лъжеше. Остава
 * точно толкова, колкото прави свалянето трайно.
 */
export async function moderateStreamerAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || (decision !== 'APPROVED' && decision !== 'REJECTED' && decision !== 'PENDING')) return;

  const current = await prisma.streamer.findUnique({
    where: { id },
    select: { platform: true, channel: true, status: true },
  });
  if (!current) return;

  /**
   * Свалянето по чл. 21 НЕ се отменя с едно щракване. Панелът рисува бутон за
   * всяко състояние, различно от текущото, тоест „публичен“ стоеше до свален
   * запис — а той вече е с изчистени име и адрес. Едно погрешно щракване
   * публикуваше празна карта с `<a href="">` И сваляше блокадата в cron-а, тоест
   * до 10 минути данните на възразилия се връщаха. Връщането е решение, което
   * иска нов, изричен път, а не съседен бутон.
   */
  if (current.status === 'REJECTED' && decision !== 'REJECTED') {
    await audit(
      'streamer',
      `${current.platform}/${current.channel}`,
      `отказано връщане към ${decision} — записът е свален по възражение`,
    );
    return;
  }

  const silenced =
    decision === 'REJECTED'
      ? {
          // Каналът остава като заглушаващ запис; всичко останало си отива.
          displayName: '',
          profileUrl: '',
          streamTitle: null,
          language: null,
          viewers: 0,
          live: false,
          lastLiveAt: null,
          lastSeenAt: null,
        }
      : {};

  await prisma.streamer.update({
    where: { id },
    data: { status: decision, reviewedAt: new Date(), ...silenced },
  });
  // Целта в дневника е каналът, не името: следата трябва да докаже решението,
  // без да съживява данните, които току-що изтрихме.
  await audit('streamer', `${current.platform}/${current.channel}`, decision);
  revalidatePath('/', 'layout');
}

const streamerSchema = z.object({
  platform: z.enum(STREAM_PLATFORMS),
  channel: z.string().trim().min(1).max(64),
  displayName: z.string().trim().max(80).optional(),
});

/**
 * Ръчно добавяне. Единственият път за TikTok — там няма публично откриване на
 * живи излъчвания, което е ограничение на платформата, не наше решение.
 */
export async function addStreamerAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  const parsed = streamerSchema.safeParse({
    platform: text('platform') ?? 'TIKTOK',
    channel: text('channel') ?? '',
    displayName: text('displayName'),
  });
  if (!parsed.success) return;

  const channel = normalizeChannel(parsed.data.platform, parsed.data.channel);
  if (!channel) return;

  const name = displayName(parsed.data.displayName ?? channel, channel);
  const url = profileUrl(parsed.data.platform, channel);

  // Ръчното добавяне НЕ отменя възражение и не го „презарежда“ с данни:
  // upsert-ът щеше да върне името и адреса върху заглушен запис, тоест да
  // отмени точно това, което свалянето изтри. Търси се по `channelKey` — по
  // `channel` разликата в регистъра вкарваше нов ред и възражението отпадаше.
  const key = { platform: parsed.data.platform, channelKey: channelKey(channel) };
  const existing = await prisma.streamer.findUnique({
    where: { platform_channelKey: key },
    select: { id: true, status: true },
  });
  if (existing?.status === 'REJECTED') {
    await audit('streamer-add', `${parsed.data.platform}/${channel}`, 'отказано: свален по възражение');
    return;
  }

  await prisma.streamer.upsert({
    where: { platform_channelKey: key },
    update: { displayName: name, profileUrl: url, manual: true, reviewedAt: new Date() },
    create: {
      ...key,
      channel,
      displayName: name,
      profileUrl: url,
      manual: true,
      status: 'APPROVED',
      reviewedAt: new Date(),
    },
  });

  await audit('streamer-add', `${parsed.data.platform}/${channel}`, 'ръчно');
  revalidatePath('/', 'layout');
}

// ── Сигнали по DSA ──────────────────────────────────────────────────────────

export async function handleReportAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || (decision !== 'APPROVED' && decision !== 'REJECTED')) return;

  // `handledAt` не е козметика: от него тече уведомяването по чл. 16(5) DSA.
  const report = await prisma.report.update({
    where: { id },
    data: { status: decision, handledAt: new Date() },
  });
  // Чл. 16(5) дължи уведомяване „при предоставени данни за контакт“. Сигналът
  // по чл. 3–7 от Дир. 2011/93/ЕС може да е анонимен — тогава няма къде да се
  // пише и това не е пропуск, а изричното изключение.
  if (report.reporterEmail) {
    await sendMail({
      to: report.reporterEmail,
      ...reportDecision(report.targetUrl, decision === 'APPROVED'),
    });
  }
  await audit(
    'report',
    report.targetUrl,
    `${decision === 'APPROVED' ? 'основателен' : 'неоснователен'}` +
      `${report.reporterEmail ? '' : ' (анонимен — без уведомяване)'}`,
  );
  revalidatePath('/', 'layout');
}
