import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireCapability, requireCsrf, requireLogin } from '../auth/guards.js';
import { createAnthropicClient, generateDrafts } from '../content/generate.js';
import { enqueuePublish, removeScheduledJob } from '../queue/publish-queue.js';
import {
  approvePost,
  createDraft,
  markScheduled,
  PostStateError,
  rejectPost,
  retryFailed,
  unschedule,
  updateDraft,
} from '../services/posts.js';
import {
  actorOf,
  optionalField,
  pageParam,
  parseHashtags,
  setFlash,
  stringField,
} from './helpers.js';

const STATUSES = [
  'DRAFT',
  'REJECTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
] as const;
const statusSchema = z.enum(STATUSES);
const kindSchema = z.enum(['IMAGE', 'REELS']);

export const postRouter: Router = Router();
postRouter.use('/admin/posts', requireLogin);

async function formContext() {
  const [brands, accounts] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    }),
    prisma.instagramAccount.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, brandId: true },
    }),
  ]);
  return { brands, accounts };
}

function draftBody(body: unknown) {
  return {
    accountId: optionalField(body, 'accountId'),
    kind: kindSchema.catch('IMAGE').parse(stringField(body, 'kind')),
    caption: stringField(body, 'caption'),
    hashtags: parseHashtags((body as Record<string, unknown>)?.hashtags),
    altText: stringField(body, 'altText'),
    mediaUrl: stringField(body, 'mediaUrl'),
    coverUrl: optionalField(body, 'coverUrl'),
    topic: optionalField(body, 'topic'),
  };
}

function handleStateError(
  res: Parameters<Router['post']>[1] extends infer _
    ? Parameters<Parameters<Router['post']>[1]>[1]
    : never,
  error: unknown,
  back: string,
): void {
  if (error instanceof PostStateError || error instanceof z.ZodError) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        : error.message;
    setFlash(res, 'error', message);
    res.redirect(back);
    return;
  }
  throw error;
}

postRouter.get('/admin/posts', requireCapability('posts:view'), async (req, res) => {
  const { page, take, skip } = pageParam(req);
  const status = statusSchema.safeParse(req.query.status);
  const brandSlug = typeof req.query.brand === 'string' ? req.query.brand : '';
  const where = {
    ...(status.success ? { status: status.data } : {}),
    ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
  };
  const [posts, total, brands] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        brand: { select: { name: true, slug: true } },
        account: { select: { username: true } },
      },
    }),
    prisma.post.count({ where }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true } }),
  ]);
  res.render('admin/posts', {
    title: 'Постове',
    posts,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    statuses: STATUSES,
    status: status.success ? status.data : '',
    brands,
    brandSlug,
  });
});

postRouter.get('/admin/posts/new', requireCapability('posts:create'), async (_req, res) => {
  res.render('admin/post-form', {
    title: 'Нова чернова',
    post: null,
    ...(await formContext()),
    errors: [],
    generation: config().ANTHROPIC_API_KEY ? true : false,
  });
});

postRouter.post(
  '/admin/posts',
  requireCapability('posts:create'),
  requireCsrf,
  async (req, res) => {
    const brandId = stringField(req.body, 'brandId');
    try {
      const { post, findings } = await createDraft(
        { ...draftBody(req.body), brandId },
        actorOf(req),
      );
      await audit(actorOf(req), {
        action: 'post.draft.create',
        targetType: 'Post',
        targetId: post.id,
        detail: { kind: post.kind },
      });
      setFlash(
        res,
        findings.length ? 'info' : 'ok',
        `Черновата е записана${findings.length ? ` с ${findings.length} находки от линта` : ''}.`,
      );
      res.redirect(`/admin/posts/${post.id}`);
    } catch (error) {
      handleStateError(res, error, '/admin/posts/new');
    }
  },
);

const generateSchema = z.object({
  brandId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  kind: kindSchema,
  topic: z.string().min(3).max(500),
  count: z.coerce.number().int().min(1).max(5).default(3),
  mediaUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  mediaDescription: z.string().max(1000).optional(),
});

/** Генерира ЧЕРНОВИ от модел — публикуване оттук няма. */
postRouter.post(
  '/admin/posts/generate',
  requireCapability('posts:generate'),
  requireCsrf,
  async (req, res) => {
    const cfg = config();
    if (!cfg.ANTHROPIC_API_KEY) {
      setFlash(res, 'error', 'Генерирането е изключено — липсва ANTHROPIC_API_KEY на сървъра.');
      res.redirect('/admin/posts/new');
      return;
    }
    const input = generateSchema.safeParse({
      brandId: stringField(req.body, 'brandId'),
      accountId: optionalField(req.body, 'accountId'),
      kind: stringField(req.body, 'kind') || 'IMAGE',
      topic: stringField(req.body, 'topic'),
      count: stringField(req.body, 'count') || '3',
      mediaUrl: stringField(req.body, 'mediaUrl'),
      coverUrl: optionalField(req.body, 'coverUrl'),
      mediaDescription: optionalField(req.body, 'mediaDescription'),
    });
    if (!input.success) {
      setFlash(
        res,
        'error',
        input.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
      res.redirect('/admin/posts/new');
      return;
    }
    const brand = await prisma.brand.findUnique({ where: { id: input.data.brandId } });
    if (!brand) {
      setFlash(res, 'error', 'Няма такъв бранд.');
      res.redirect('/admin/posts/new');
      return;
    }
    const actor = actorOf(req);
    try {
      const drafts = await generateDrafts(createAnthropicClient(cfg.ANTHROPIC_API_KEY), {
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
      for (const draft of drafts) {
        const { post } = await createDraft(
          {
            brandId: brand.id,
            ...(input.data.accountId ? { accountId: input.data.accountId } : {}),
            kind: input.data.kind,
            caption: draft.caption,
            hashtags: draft.hashtags,
            altText: draft.altText,
            mediaUrl: input.data.mediaUrl,
            ...(input.data.coverUrl ? { coverUrl: input.data.coverUrl } : {}),
            aiAssisted: true,
            topic: input.data.topic,
          },
          { type: 'SYSTEM', id: actor.id, label: `модел по заявка на ${actor.label}` },
        );
        await audit(actor, {
          action: 'post.draft.generate',
          targetType: 'Post',
          targetId: post.id,
          detail: { topic: input.data.topic },
        });
      }
      setFlash(res, 'ok', `${drafts.length} чернови са готови за преглед.`);
      res.redirect(`/admin/posts?status=DRAFT&brand=${encodeURIComponent(brand.slug)}`);
    } catch (error) {
      setFlash(
        res,
        'error',
        `Генерирането не мина: ${error instanceof Error ? error.message : 'неизвестна грешка'}`,
      );
      res.redirect('/admin/posts/new');
    }
  },
);

postRouter.get('/admin/posts/:id', requireCapability('posts:view'), async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: String(req.params.id) },
    include: {
      brand: true,
      account: { select: { id: true, username: true, status: true } },
      logs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!post) {
    res
      .status(404)
      .render('admin/error', { title: 'Няма такъв пост', message: 'Постът не е намерен.' });
    return;
  }
  res.render('admin/post-detail', {
    title: `Пост · ${post.brand.name}`,
    post,
    ...(await formContext()),
  });
});

postRouter.post(
  '/admin/posts/:id/edit',
  requireCapability('posts:edit'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const { findings } = await updateDraft(id, draftBody(req.body));
      await audit(actorOf(req), { action: 'post.draft.update', targetType: 'Post', targetId: id });
      setFlash(
        res,
        findings.length ? 'info' : 'ok',
        `Записано${findings.length ? ` — ${findings.length} находки от линта` : ''}.`,
      );
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);

postRouter.post(
  '/admin/posts/:id/approve',
  requireCapability('posts:approve'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      await approvePost(id, actorOf(req));
      await audit(actorOf(req), { action: 'post.approve', targetType: 'Post', targetId: id });
      setFlash(res, 'ok', 'Постът е одобрен. Насрочи го или го публикувай веднага.');
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);

postRouter.post(
  '/admin/posts/:id/reject',
  requireCapability('posts:approve'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      if (await isScheduledJob(id)) await removeScheduledJob(id);
      await rejectPost(id, actorOf(req), stringField(req.body, 'reason'));
      await audit(actorOf(req), {
        action: 'post.reject',
        targetType: 'Post',
        targetId: id,
        detail: { reason: stringField(req.body, 'reason') },
      });
      setFlash(
        res,
        'ok',
        'Постът е отказан — авторът може да го редактира и да го върне за преглед.',
      );
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);

async function isScheduledJob(postId: string): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { status: true } });
  return post?.status === 'SCHEDULED';
}

postRouter.post(
  '/admin/posts/:id/schedule',
  requireCapability('posts:schedule'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const when = new Date(stringField(req.body, 'scheduledAt'));
    try {
      if (Number.isNaN(when.getTime())) throw new PostStateError('Невалидна дата/час.');
      const post = await markScheduled(id, when);
      await enqueuePublish(post.id, when);
      await audit(actorOf(req), {
        action: 'post.schedule',
        targetType: 'Post',
        targetId: id,
        detail: { scheduledAt: when.toISOString() },
      });
      setFlash(res, 'ok', `Насрочен за ${when.toLocaleString('bg-BG')}.`);
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);

postRouter.post(
  '/admin/posts/:id/unschedule',
  requireCapability('posts:schedule'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      await removeScheduledJob(id);
      await unschedule(id);
      await audit(actorOf(req), { action: 'post.unschedule', targetType: 'Post', targetId: id });
      setFlash(res, 'ok', 'Насрочването е отменено; постът остава одобрен.');
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);

postRouter.post(
  '/admin/posts/:id/publish-now',
  requireCapability('posts:publish'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post || post.status !== 'APPROVED') {
      setFlash(
        res,
        'error',
        `Публикува се само одобрен пост (постът е ${post?.status ?? 'липсващ'}).`,
      );
      res.redirect(`/admin/posts/${id}`);
      return;
    }
    await enqueuePublish(post.id);
    await audit(actorOf(req), { action: 'post.publish.now', targetType: 'Post', targetId: id });
    setFlash(res, 'ok', 'Публикуването е пуснато към работника — опресни след няколко секунди.');
    res.redirect(`/admin/posts/${id}`);
  },
);

postRouter.post(
  '/admin/posts/:id/retry',
  requireCapability('posts:publish'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      await removeScheduledJob(id);
      await retryFailed(id);
      await audit(actorOf(req), { action: 'post.retry', targetType: 'Post', targetId: id });
      setFlash(res, 'ok', 'Постът е върнат в „одобрен“ — публикувай го отново, когато е готово.');
    } catch (error) {
      handleStateError(res, error, `/admin/posts/${id}`);
      return;
    }
    res.redirect(`/admin/posts/${id}`);
  },
);
