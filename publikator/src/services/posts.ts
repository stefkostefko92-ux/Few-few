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
});

export type DraftInput = z.infer<typeof draftInputSchema>;
/** Входът преди валидация — стойностите по подразбиране се попълват в `createDraft`. */
export type DraftInputRaw = z.input<typeof draftInputSchema>;

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
      lintFindings: asJson(findings),
      status: 'DRAFT',
    },
  });
  return { post, findings };
}

/**
 * Одобрението е ЧОВЕШКО и е единственият вход към публикуване.
 * Находка HIGH блокира — линтът не се заобикаля от маршрута.
 */
export async function approvePost(postId: string, approvedBy: string): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'DRAFT') {
    throw new PostStateError(`Одобряват се само чернови (постът е ${post.status}).`);
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
      approvedBy,
      approvedAt: new Date(),
      lintFindings: asJson(findings),
    },
  });
}

export async function markScheduled(postId: string, scheduledAt: Date): Promise<Post> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'APPROVED') {
    throw new PostStateError(`Насрочват се само одобрени постове (постът е ${post.status}).`);
  }
  return prisma.post.update({
    where: { id: postId },
    data: { status: 'SCHEDULED', scheduledAt },
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
