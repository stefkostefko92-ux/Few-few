import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { createAnthropicClient, generateDrafts } from '../content/generate.js';
import { enqueuePublish } from '../queue/publish-queue.js';
import {
  approvePost,
  createDraft,
  draftInputSchema,
  markScheduled,
  PostStateError,
} from '../services/posts.js';
import { actorFrom, requireAdmin } from './admin-auth.js';

export const postsRouter: Router = Router();
postsRouter.use('/api', requireAdmin);

const listQuerySchema = z.object({
  brand: z.string().min(1).optional(),
  status: z
    .enum(['DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'])
    .optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

postsRouter.get('/api/posts', async (req, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'Невалидни параметри.' });
    return;
  }
  const brand = query.data.brand
    ? await prisma.brand.findUnique({ where: { slug: query.data.brand } })
    : null;
  if (query.data.brand && !brand) {
    res.status(404).json({ error: 'Няма такъв бранд.' });
    return;
  }

  const posts = await prisma.post.findMany({
    where: {
      ...(brand ? { brandId: brand.id } : {}),
      ...(query.data.status ? { status: query.data.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: query.data.take,
  });
  res.json({ posts });
});

postsRouter.post('/api/posts', async (req, res) => {
  const input = draftInputSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Невалидна чернова.', issues: input.error.issues });
    return;
  }
  const { post, findings } = await createDraft(input.data);
  res.status(201).json({ post, findings });
});

const generateSchema = z.object({
  brandSlug: z.string().min(1),
  accountId: z.string().min(1).optional(),
  kind: z.enum(['IMAGE', 'REELS']).default('IMAGE'),
  topic: z.string().min(3),
  count: z.number().int().min(1).max(5).default(3),
  mediaUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  mediaDescription: z.string().optional(),
});

/** Генерира ЧЕРНОВИ. Публикуване оттук няма — одобрението е отделна стъпка. */
postsRouter.post('/api/posts/generate', async (req, res) => {
  const cfg = config();
  if (!cfg.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'Генерирането е изключено — липсва ANTHROPIC_API_KEY.' });
    return;
  }
  const input = generateSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Невалидна заявка.', issues: input.error.issues });
    return;
  }

  const brand = await prisma.brand.findUnique({ where: { slug: input.data.brandSlug } });
  if (!brand) {
    res.status(404).json({ error: 'Няма такъв бранд.' });
    return;
  }

  const client = createAnthropicClient(cfg.ANTHROPIC_API_KEY);
  const drafts = await generateDrafts(client, {
    brand: {
      name: brand.name,
      summary: brand.summary,
      voice: brand.voice,
      language: brand.language,
      websiteUrl: brand.websiteUrl,
    },
    kind: input.data.kind,
    topic: input.data.topic,
    count: input.data.count,
    ...(input.data.mediaDescription ? { mediaDescription: input.data.mediaDescription } : {}),
  });

  const created = [];
  for (const draft of drafts) {
    created.push(
      await createDraft({
        brandId: brand.id,
        ...(input.data.accountId ? { accountId: input.data.accountId } : {}),
        kind: input.data.kind,
        caption: draft.caption,
        hashtags: draft.hashtags,
        altText: draft.altText,
        mediaUrl: input.data.mediaUrl,
        ...(input.data.coverUrl ? { coverUrl: input.data.coverUrl } : {}),
        aiAssisted: true,
      }),
    );
  }

  res.status(201).json({
    drafts: created.map((entry, index) => ({
      post: entry.post,
      findings: entry.findings,
      rationale: drafts[index]?.rationale ?? null,
    })),
  });
});

postsRouter.post('/api/posts/:id/approve', async (req, res) => {
  try {
    const post = await approvePost(String(req.params.id), actorFrom(req));
    res.json({ post });
  } catch (error) {
    if (error instanceof PostStateError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

const scheduleSchema = z.object({ scheduledAt: z.coerce.date() });

postsRouter.post('/api/posts/:id/schedule', async (req, res) => {
  const input = scheduleSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Нужен е валиден scheduledAt.' });
    return;
  }
  try {
    const post = await markScheduled(String(req.params.id), input.data.scheduledAt);
    await enqueuePublish(post.id, input.data.scheduledAt);
    res.json({ post });
  } catch (error) {
    if (error instanceof PostStateError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

postsRouter.post('/api/posts/:id/publish-now', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: String(req.params.id) } });
  if (!post) {
    res.status(404).json({ error: 'Няма такъв пост.' });
    return;
  }
  if (post.status !== 'APPROVED') {
    res.status(409).json({ error: `Постът е ${post.status} — публикува се само одобрен пост.` });
    return;
  }
  await enqueuePublish(post.id);
  res.status(202).json({ queued: true, postId: post.id });
});
