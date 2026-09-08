import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { createDraft, draftInputSchema } from '../services/posts.js';
import { agentAuth, requireScope } from './auth.js';
import type { NonceStore } from './nonce-store.js';
import type { AgentPrincipal } from '../types.js';

/**
 * Машинният вход на агента. Съзнателно ТЯСЕН: чете брандове/акаунти/чернови и СЪЗДАВА чернови.
 * Одобрение, насрочване и публикуване тук не съществуват като маршрути — не могат да се „отключат".
 */
export function agentRouter(nonceStore: NonceStore): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use('/agent/v1', limiter, agentAuth(nonceStore));

  const principalOf = (req: Parameters<Parameters<Router['get']>[1]>[0]): AgentPrincipal =>
    req.principal as AgentPrincipal;

  const brandFilter = (principal: AgentPrincipal) =>
    principal.key.brandIds.length > 0 ? { id: { in: principal.key.brandIds } } : {};

  router.get('/agent/v1/brands', requireScope('brands:read'), async (req, res) => {
    const principal = principalOf(req);
    const brands = await prisma.brand.findMany({
      where: brandFilter(principal),
      select: {
        id: true,
        slug: true,
        name: true,
        summary: true,
        voice: true,
        language: true,
        websiteUrl: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ brands });
  });

  /** Само публични полета — токенът никога не излиза оттук. */
  router.get('/agent/v1/accounts', requireScope('accounts:read'), async (req, res) => {
    const principal = principalOf(req);
    const accounts = await prisma.instagramAccount.findMany({
      where: { brand: brandFilter(principal) },
      select: { id: true, brandId: true, username: true, status: true, tokenExpiresAt: true },
      orderBy: { username: 'asc' },
    });
    res.json({ accounts });
  });

  const listSchema = z.object({
    brand: z.string().min(1).optional(),
    status: z
      .enum(['DRAFT', 'REJECTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'])
      .optional(),
    take: z.coerce.number().int().min(1).max(100).default(50),
  });

  router.get('/agent/v1/drafts', requireScope('drafts:read'), async (req, res) => {
    const principal = principalOf(req);
    const query = listSchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Невалидни параметри.' });
      return;
    }
    const posts = await prisma.post.findMany({
      where: {
        brand: {
          ...brandFilter(principal),
          ...(query.data.brand ? { slug: query.data.brand } : {}),
        },
        ...(query.data.status ? { status: query.data.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.data.take,
      select: {
        id: true,
        brandId: true,
        kind: true,
        status: true,
        caption: true,
        hashtags: true,
        altText: true,
        mediaUrl: true,
        topic: true,
        lintFindings: true,
        rejectionReason: true,
        permalink: true,
        createdAt: true,
      },
    });
    res.json({ posts });
  });

  const agentDraftSchema = draftInputSchema
    .omit({ brandId: true, aiAssisted: true })
    .extend({ brandSlug: z.string().min(1), topic: z.string().max(500).optional() });

  router.post('/agent/v1/drafts', requireScope('drafts:write'), async (req, res) => {
    const principal = principalOf(req);
    const input = agentDraftSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Невалидна чернова.', issues: input.error.issues });
      return;
    }
    const brand = await prisma.brand.findFirst({
      where: { slug: input.data.brandSlug, ...brandFilter(principal) },
    });
    if (!brand) {
      res.status(404).json({ error: 'Няма такъв бранд или ключът няма достъп до него.' });
      return;
    }
    if (input.data.accountId) {
      const account = await prisma.instagramAccount.findFirst({
        where: { id: input.data.accountId, brandId: brand.id },
      });
      if (!account) {
        res.status(400).json({ error: 'Акаунтът не принадлежи на този бранд.' });
        return;
      }
    }

    const { brandSlug: _slug, topic, ...rest } = input.data;
    const { post, findings } = await createDraft(
      { ...rest, brandId: brand.id, aiAssisted: true, ...(topic ? { topic } : {}) },
      { type: 'AGENT', id: principal.key.id, label: `agent:${principal.key.name}` },
    );
    await audit(
      { type: 'AGENT', id: principal.key.id, label: `agent:${principal.key.name}`, ip: req.ip },
      {
        action: 'post.draft.create',
        targetType: 'Post',
        targetId: post.id,
        detail: { brand: brand.slug, kind: post.kind },
      },
    );
    res.status(201).json({ post, findings });
  });

  return router;
}
