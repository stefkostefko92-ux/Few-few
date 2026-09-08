import { Prisma, type Post, type PostKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hasBlockingFindings, lintPost, type LintFinding } from '../content/lint.js';

export const draftInputSchema = z.object({
  brandId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  kind: z.enum(['IMAGE', 'REELS']),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).max(30).default([]),
  altText: z.string().default(''),
  mediaUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  aiAssisted: z.boolean().default(false),
  topic: z.string().max(500).optional(),
});

export type DraftInput = z.infer<typeof draftInputSchema>;
/** Входът преди валидация — стойностите по подразбиране се попълват в `createDraft`. */
export type DraftInputRaw = z.input<typeof draftInputSchema>;

/** Кой действа: човек (потребител), агент (API ключ) или системата. */
export interface Actor {
  type: 'HUMAN' | 'AGENT' | 'SYSTEM';
  id: string | null;
  label: string;
}

export class PostStateError extends Error {}

/** Prisma иска `InputJsonValue` — сериализираме честно, вместо да лъжем типа с cast. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function lintFor(post: {
  kind: PostKind;
  caption: string;
  hashtags: string[];
  altText: string;
  mediaUrl: string;
  coverUrl?: string | null;
}): LintFinding[] {
  return lintPost({
    kind: post.kind,
    caption: post.caption,
    hashtags: post.hashtags,
    altText: post.altText,
    mediaUrl: post.mediaUrl,
    coverUrl: post.coverUrl ?? null,
  });
}

export async function createDraft(
  raw: DraftInputRaw,
  actor: Actor = { type: 'SYSTEM', id: null, label: 'system' },
): Promise<{ post: Post; findings: LintFinding[] }> {
  const input: DraftInput = draftInputSchema.parse(raw);
  const findings = lintFor(input);
  const post = await prisma.post.create({
    data: {
      brandId: input.brandId,
      accountId: input.accountId ?? null,
      kind: input.kind,
      caption: input.caption,
      hashtags: input.hashtags,
      altText: input.altText,
      mediaUrl: input.mediaUrl,
      coverUrl: input.coverUrl ?? null,
      aiAssisted: input.aiAssisted,
      topic: input.topic ?? null,
      createdByType: actor.type,
      createdById: actor.id,
      createdByLabel: actor.label,
      lintFindings: asJson(findings),
      status: 'DRAFT',
    },
  });
  return { post, findings };
}

export const draftEditSchema = draftInputSchema.pick({
  accountId: true,
  kind: true,
  caption: true,
  hashtags: true,
  altText: true,
  mediaUrl: true,
  coverUrl: true,
  topic: true,
});

/** Редакция — само на чернова или отказан пост; връща го в DRAFT и пре-линтва. */
export async function updateDraft(
  postId: string,
  raw: z.input<typeof draftEditSchema>,
): Promise<{ post: Post; findings: LintFinding[] }> {
  const existing = await prisma.post.findUnique({ where: { id: postId } });
  if (!existing) throw new PostStateError('Няма такъв пост.');
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new PostStateError(`Редактират се само чернови (постът е ${existing.status}).`);
  }
  const input = draftEditSchema.parse(raw);
  const findings = lintFor(input);
  const post = await prisma.post.update({
    where: { id: postId },
    data: {
      accountId: input.accountId ?? null,
      kind: input.kind,
      caption: input.caption,
      hashtags: input.hashtags,
      altText: input.altText,
      mediaUrl: input.mediaUrl,
      coverUrl: input.coverUrl ?? null,
      topic: input.topic ?? null,
      lintFindings: asJson(findings),
      status: 'DRAFT',
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
    },
  });
  return { post, findings };
}

/**
 * Одобрението е ЧОВЕШКО и е единственият вход към публикуване.
 * Находка HIGH блокира — линтът не се заобикаля от маршрута.
 * „Четири очи": човек не одобрява собствената си чернова.
 */
export async function approvePost(postId: string, approver: Actor): Promise<Post> {
  if (approver.type !== 'HUMAN') throw new PostStateError('Одобрява само човек.');
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'DRAFT') {
    throw new PostStateError(`Одобряват се само чернови (постът е ${post.status}).`);
  }
  if (post.createdByType === 'HUMAN' && post.createdById && post.createdById === approver.id) {
    throw new PostStateError('Собствена чернова не се одобрява — нужен е втори човек.');
  }

  const findings = lintFor(post);
  if (hasBlockingFindings(findings)) {
    await prisma.post.update({ where: { id: postId }, data: { lintFindings: asJson(findings) } });
    throw new PostStateError(
      'Линтът намери блокиращи (HIGH) проблеми — поправи ги преди одобрение.',
    );
  }
  if (!post.accountId) {
    throw new PostStateError('Постът няма свързан Instagram акаунт.');
  }

  return prisma.post.update({
    where: { id: postId },
    data: {
      status: 'APPROVED',
      approvedBy: approver.label,
      approvedAt: new Date(),
      lintFindings: asJson(findings),
    },
  });
}

export async function rejectPost(postId: string, reviewer: Actor, reason: string): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'DRAFT' && post.status !== 'APPROVED') {
    throw new PostStateError(`Отказват се чернови или одобрени постове (постът е ${post.status}).`);
  }
  return prisma.post.update({
    where: { id: postId },
    data: {
      status: 'REJECTED',
      rejectedBy: reviewer.label,
      rejectedAt: new Date(),
      rejectionReason: reason.trim() || null,
      approvedBy: null,
      approvedAt: null,
    },
  });
}

export async function markScheduled(postId: string, scheduledAt: Date): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'APPROVED') {
    throw new PostStateError(`Насрочват се само одобрени постове (постът е ${post.status}).`);
  }
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    throw new PostStateError('Часът за публикуване е в миналото.');
  }
  return prisma.post.update({ where: { id: postId }, data: { status: 'SCHEDULED', scheduledAt } });
}

/** Връща насрочен пост в APPORVED — опашката се чисти от извикващия. */
export async function unschedule(postId: string): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'SCHEDULED') {
    throw new PostStateError(`Отменя се само насрочен пост (постът е ${post.status}).`);
  }
  return prisma.post.update({
    where: { id: postId },
    data: { status: 'APPROVED', scheduledAt: null },
  });
}

/** Провален пост се връща за нов опит — остава одобрен, човек решава кога. */
export async function retryFailed(postId: string): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'FAILED') {
    throw new PostStateError(`Повтаря се само провален пост (постът е ${post.status}).`);
  }
  return prisma.post.update({
    where: { id: postId },
    data: { status: 'APPROVED', lastError: null, containerId: null, scheduledAt: null },
  });
}

export async function logStep(
  postId: string,
  step: string,
  ok: boolean,
  detail?: Record<string, unknown>,
): Promise<void> {
  await prisma.publishLog.create({
    data: { postId, step, ok, detail: detail ? asJson(detail) : undefined },
  });
}
