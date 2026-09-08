/**
 * Интеграционен тест по целия път: чернова → одобрение → публикуване.
 * Иска жива PostgreSQL през `DATABASE_URL`; без нея се пропуска.
 * Instagram НЕ се вика реално — `globalThis.fetch` е подменен.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const hasDatabase = Boolean(process.env.DATABASE_URL);

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_BASE_URL ??= 'https://publikator.example.com';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.IG_APP_ID ??= '123456';
process.env.IG_APP_SECRET ??= 'app-secret';
process.env.IG_REDIRECT_URI ??= 'https://publikator.example.com/auth/instagram/callback';
process.env.TOKEN_ENC_KEY ??= 'a'.repeat(64);
process.env.ADMIN_API_TOKEN ??= 'x'.repeat(40);
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:5432/publikator_test';

const { config } = await import('../../src/config.js');
const { encryptSecret } = await import('../../src/crypto.js');
const { prisma } = await import('../../src/db.js');
const { approvePost, createDraft, PostStateError } = await import('../../src/services/posts.js');
const { publishPost } = await import('../../src/services/publish.js');

interface StubRoute {
  match: RegExp;
  json: unknown;
}

function stubInstagram(routes: StubRoute[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const route = routes.find((entry) => entry.match.test(url));
    if (!route) throw new Error(`неочакван URL в теста: ${url}`);
    return new Response(JSON.stringify(route.json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('пътят чернова → одобрение → публикуване', { skip: !hasDatabase }, async (t) => {
  const cfg = config();
  const brand = await prisma.brand.create({
    data: {
      slug: `test-${Date.now()}`,
      name: 'Тестов бранд',
      summary: 'Продукт за тест.',
      voice: 'Ясно и кратко.',
      language: 'bg',
    },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      brandId: brand.id,
      igUserId: `1784140${Date.now()}`,
      username: 'test_brand',
      accessTokenEnc: encryptSecret('IGQV-fake-token', cfg.TOKEN_ENC_KEY),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      scopes: cfg.IG_SCOPES,
    },
  });

  t.after(async () => {
    await prisma.brand.delete({ where: { id: brand.id } });
    await prisma.$disconnect();
  });

  const { post, findings } = await createDraft({
    brandId: brand.id,
    accountId: account.id,
    kind: 'IMAGE',
    caption: 'Кукичка на първи ред.\n\nОбяснението следва.',
    hashtags: ['#дупница'],
    altText: 'Описание на снимката.',
    mediaUrl: 'https://cdn.example.com/a.jpg',
    aiAssisted: true,
  });
  assert.equal(post.status, 'DRAFT');
  assert.deepEqual(findings, []);

  await assert.rejects(() => publishPost(post.id), PostStateError);

  const approved = await approvePost(post.id, 'stefan');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedBy, 'stefan');

  const restore = stubInstagram([
    {
      match: /content_publishing_limit/,
      json: { data: [{ quota_usage: 1, config: { quota_total: 100 } }] },
    },
    { match: /\/media_publish/, json: { id: 'media-42' } },
    { match: /\/media(\?|$)/, json: { id: 'container-42' } },
    {
      match: /permalink|fields=id%2Cpermalink/,
      json: { id: 'media-42', permalink: 'https://instagram.com/p/x' },
    },
  ]);
  try {
    const result = await publishPost(post.id);
    assert.equal(result.igMediaId, 'media-42');
  } finally {
    restore();
  }

  const published = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.igMediaId, 'media-42');
  assert.equal(published.permalink, 'https://instagram.com/p/x');

  const steps = await prisma.publishLog.findMany({ where: { postId: post.id } });
  assert.deepEqual(steps.map((step) => step.step).sort(), ['container', 'publish', 'quota']);
});

test('блокиращ линт спира одобрението', { skip: !hasDatabase }, async (t) => {
  const brand = await prisma.brand.create({
    data: {
      slug: `test-lint-${Date.now()}`,
      name: 'Тестов бранд 2',
      summary: 'Продукт за тест.',
      voice: 'Ясно и кратко.',
    },
  });
  t.after(async () => {
    await prisma.brand.delete({ where: { id: brand.id } });
    await prisma.$disconnect();
  });

  const { post } = await createDraft({
    brandId: brand.id,
    kind: 'IMAGE',
    caption: 'Текст с ключ sk-ant-api03-XXXXXXXXXXXX',
    hashtags: [],
    altText: 'Описание.',
    mediaUrl: 'https://cdn.example.com/a.jpg',
  });
  await assert.rejects(() => approvePost(post.id, 'stefan'), PostStateError);
  const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(stored.status, 'DRAFT');
});
