/**
 * „Отговор по ключова дума“ по целия път срещу жива PostgreSQL и Redis
 * (docs/private-replies.md): подписан webhook → ред + задача → работник → едно съобщение;
 * четири очи в панела; таван; обявата на живо; CAS; одит без commentId; чистене.
 * Instagram НЕ се вика реално — заявките минават през подменен fetch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

const hasDatabase = Boolean(process.env.DATABASE_URL);

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_BASE_URL ??= 'https://piuma.example.com';
process.env.REDIS_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';
process.env.IG_APP_ID ??= '123456';
process.env.IG_APP_SECRET ??= 'app-secret';
process.env.IG_REDIRECT_URI ??= 'https://piuma.example.com/auth/instagram/callback';
process.env.TOKEN_ENC_KEY ??= 'a'.repeat(64);
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:5432/piuma_test';
process.env.LOG_LEVEL ??= 'silent';
process.env.IG_WEBHOOK_VERIFY_TOKEN = 'verify-token-for-tests-0123456789';
process.env.REPLY_PRIVACY_URL = 'https://carbonstealth.eu/privacy';

const { prisma } = await import('../../src/db.js');
const { encryptSecret } = await import('../../src/crypto.js');
const { InstagramApiError } = await import('../../src/instagram/client.js');
const { MemoryNonceStore } = await import('../../src/agent/nonce-store.js');
const { createServer } = await import('../../src/server.js');
const { verifyAuditChain } = await import('../../src/audit.js');
const { signWebhook } = await import('../../src/replies/signature.js');
const { publishQueue, replyJobId } = await import('../../src/queue/publish-queue.js');
const replies = await import('../../src/services/replies.js');

const STAMP = Date.now();
const IG = `1784${String(STAMP).slice(-11)}`;
const MEDIA = `1800${String(STAMP).slice(-11)}`;
let commentSeq = 0;
const nextComment = () => `1786${String(STAMP).slice(-9)}${String(++commentSeq).padStart(3, '0')}`;

interface Sent {
  url: string;
  method: string;
  body: string | null;
  auth: string | null;
}

/** Подменен Instagram: надписът на медията и /messages. */
function fakeInstagram(options: { caption?: string | null; send?: () => Response }) {
  const calls: Sent[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : null,
      auth: headers.get('authorization'),
    });
    if (url.includes('/messages')) {
      return (
        options.send?.() ??
        Response.json({ recipient_id: '526', message_id: `mid-${calls.length}` })
      );
    }
    return Response.json(
      options.caption === null
        ? { id: MEDIA }
        : { id: MEDIA, caption: options.caption ?? 'Напиши ЦЕНА' },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, sends: () => calls.filter((c) => c.url.includes('/messages')) };
}

test('отговор по ключова дума: пълен път', { skip: !hasDatabase }, async (t) => {
  const author = await prisma.user.create({
    data: {
      email: `editor-${STAMP}@example.com`,
      name: 'Редактор',
      passwordHash: 'x',
      role: 'EDITOR',
    },
  });
  const reviewer = await prisma.user.create({
    data: {
      email: `rev-${STAMP}@example.com`,
      name: 'Ревюър',
      passwordHash: 'x',
      role: 'REVIEWER',
    },
  });
  const brand = await prisma.brand.create({
    data: {
      slug: `replies-${STAMP}`,
      name: 'Мастилко',
      summary: 'Продукт за тест.',
      voice: 'Кратко.',
      language: 'bg',
    },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      brandId: brand.id,
      // Като в продукция: id от /me (app-scoped) ≠ IG_ID (`user_id`), а webhook-ът носи IG_ID.
      igUserId: `2600${String(STAMP).slice(-11)}`,
      igProfessionalId: IG,
      username: `piuma_${STAMP}`,
      accessTokenEnc: encryptSecret('IGQV-test-token', 'a'.repeat(64)),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      scopes: 'instagram_business_basic,instagram_business_manage_comments',
    },
  });
  await prisma.post.create({
    data: {
      brandId: brand.id,
      accountId: account.id,
      kind: 'IMAGE',
      caption: 'Напиши ЦЕНА в коментар и ще ти пратим цените.',
      hashtags: [],
      altText: 'тест',
      mediaUrl: 'https://example.com/a.jpg',
      status: 'PUBLISHED',
      igMediaId: MEDIA,
      publishedAt: new Date(),
    },
  });
  const editor = { type: 'HUMAN' as const, id: author.id, label: 'Редактор', ip: '127.0.0.1' };
  const boss = { type: 'HUMAN' as const, id: reviewer.id, label: 'Ревюър', ip: '127.0.0.1' };

  const app = createServer({ nonceStore: new MemoryNonceStore() });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  t.after(async () => {
    server.close();
    await prisma.brand.delete({ where: { id: brand.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [author.id, reviewer.id] } } });
    // Като в queue.test.ts: опашката не затваря подадената ѝ връзка — без quit() процесът виси.
    const queue = publishQueue();
    await queue.obliterate({ force: true }).catch(() => undefined);
    const connection = await queue.client;
    await queue.close();
    await connection.quit();
    await prisma.$disconnect();
  });

  // ── PR16/PR17/PR18: правилото — валидация, четири очи, обявата ──
  await assert.rejects(
    replies.createRule(editor, account.id, {
      keyword: 'цена',
      message: 'x',
      mediaId: '',
      announced: true,
    }),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errMedia',
    'правило без публикация няма (B1)',
  );
  await assert.rejects(
    replies.createRule(editor, account.id, {
      keyword: 'цена',
      message: 'x',
      mediaId: '19999999999999999',
      announced: true,
    }),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errMedia',
    'чужда/непубликувана медия',
  );
  await assert.rejects(
    replies.createRule(editor, account.id, {
      keyword: 'цена',
      message: 'ц'.repeat(450),
      mediaId: MEDIA,
      announced: true,
    }),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errTooLong',
    'текст + бележка над 1000 байта (PR16a)',
  );
  const rule = await replies.createRule(editor, account.id, {
    keyword: 'ЦЕНА',
    message: 'Цените са тук: https://example.com/ceni',
    mediaId: MEDIA,
    announced: true,
  });
  assert.equal(rule.status, 'DRAFT');
  assert.equal(rule.keyword, 'цена');

  await assert.rejects(
    replies.approveRule(editor, rule.id, true),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errFourEyes',
  );
  await assert.rejects(
    replies.approveRule(boss, rule.id, false),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errAnnounced',
    'без потвърждението на ревюъра (PR16b)',
  );
  // Ревюърът редактира → става автор → не може да одобри собствения си текст.
  await replies.updateRule(boss, rule.id, {
    keyword: 'цена',
    message: 'Цените: https://example.com/ceni',
    mediaId: MEDIA,
    announced: true,
  });
  await assert.rejects(
    replies.approveRule(boss, rule.id, true),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errFourEyes',
    'редакцията прави редактиращия автор (PR17)',
  );
  await replies.approveRule(editor, rule.id, true);
  assert.equal(
    (await prisma.replyRule.findUniqueOrThrow({ where: { id: rule.id } })).status,
    'ACTIVE',
  );

  // Правило за пост, чийто надпис НЕ обявява думата → не се одобрява.
  const other = await replies.createRule(editor, account.id, {
    keyword: 'learn',
    message: 'Гайдът: https://example.com/g',
    mediaId: MEDIA,
    announced: true,
  });
  await assert.rejects(
    replies.approveRule(boss, other.id, true),
    (e: unknown) => e instanceof replies.ReplyRuleError && e.key === 'replies.errNotAnnounced',
  );
  await replies.deleteRule(boss, other.id);

  // ── PR1–PR3, PR10: webhook през истинския сървър → ред + задача ──
  const comment = nextComment();
  const payload = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: IG,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              id: comment,
              from: { id: '6543210', username: 'some_user' },
              text: 'Може ли ЦЕНА?',
              media: { id: MEDIA, media_product_type: 'FEED' },
            },
          },
        ],
      },
    ],
  });
  const post = (body: string, signature: string) =>
    fetch(`${base}/webhooks/instagram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      body,
    });
  const verify = await fetch(
    `${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${process.env.IG_WEBHOOK_VERIFY_TOKEN}&hub.challenge=42`,
  );
  assert.equal(await verify.text(), '42');
  assert.equal((await post(payload, signWebhook('чужда', Buffer.from(payload)))).status, 401);
  assert.equal(await prisma.privateReply.count({ where: { commentId: comment } }), 0);

  assert.equal((await post(payload, signWebhook('app-secret', Buffer.from(payload)))).status, 200);
  assert.equal((await post(payload, signWebhook('app-secret', Buffer.from(payload)))).status, 200);
  const rows = await prisma.privateReply.findMany({ where: { commentId: comment } });
  assert.equal(rows.length, 1, 'повторната доставка не дава втори ред');
  const row = rows[0]!;
  assert.equal(row.status, 'QUEUED');
  const job = await publishQueue().getJob(replyJobId(row.id));
  assert.ok(job, 'задачата е в опашката');
  assert.deepEqual(job.data, { replyId: row.id }, 'задачата носи само id-то');

  // ── PR12a/PR14/PR16a: работникът — обявата на живо, едно съобщение с бележка ──
  const ig = fakeInstagram({});
  assert.equal(await replies.processPrivateReply(row.id, { fetchImpl: ig.fetchImpl }), 'sent');
  assert.equal(ig.sends().length, 1);
  const sentBody = JSON.parse(ig.sends()[0]!.body ?? '{}') as {
    recipient: { comment_id: string };
    message: { text: string };
  };
  assert.equal(sentBody.recipient.comment_id, comment);
  assert.match(sentBody.message.text, /^Цените: https:\/\/example\.com\/ceni\n\n— /);
  assert.match(sentBody.message.text, /Мастилко \(Carbon Stealth VCC\)/);
  assert.match(sentBody.message.text, /https:\/\/carbonstealth\.eu\/privacy/);
  assert.ok(Buffer.byteLength(sentBody.message.text) <= 1000);
  assert.equal(ig.sends()[0]!.auth, 'Bearer IGQV-test-token');
  assert.match(
    ig.sends()[0]!.url,
    new RegExp(`/${IG}/messages$`),
    '/messages с IG_ID, не app-scoped id',
  );
  assert.match(ig.calls[0]!.url, new RegExp(`/${MEDIA}\\?fields=caption$`));
  const sent = await prisma.privateReply.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(sent.status, 'SENT');
  assert.ok(sent.messageId && sent.sentAt);

  // Повторно пускане на същата задача → нищо (едно съобщение на коментар).
  assert.equal(await replies.processPrivateReply(row.id, { fetchImpl: ig.fetchImpl }), 'noop');
  assert.equal(ig.sends().length, 1);

  const ingestOne = async (overrides: { text?: string } = {}) => {
    const id = nextComment();
    await replies.ingestCommentEvents(
      [
        {
          accountIgId: IG,
          commentId: id,
          text: overrides.text ?? 'ЦЕНА',
          mediaId: MEDIA,
          eventAt: new Date(),
        },
      ],
      { enqueue: async () => {} },
    );
    return prisma.privateReply.findUniqueOrThrow({ where: { commentId: id } });
  };

  // ── PR12a: надписът е сменен в Instagram → пропуснато, нищо не е пратено ──
  const gone = await ingestOne();
  const noAnnounce = fakeInstagram({ caption: 'Нови снимки' });
  assert.equal(
    await replies.processPrivateReply(gone.id, { fetchImpl: noAnnounce.fetchImpl }),
    'skipped',
  );
  assert.equal(noAnnounce.sends().length, 0);
  assert.equal(
    (await prisma.privateReply.findUniqueOrThrow({ where: { id: gone.id } })).reason,
    'обявата липсва',
  );

  // ── PR15: повторима грешка → обратно в опашката и хвърля; неясна → FAILED без повтор ──
  const flaky = await ingestOne();
  const busy = fakeInstagram({
    send: () => Response.json({ error: { message: 'busy', code: 4 } }, { status: 400 }),
  });
  await assert.rejects(
    replies.processPrivateReply(flaky.id, { fetchImpl: busy.fetchImpl }),
    InstagramApiError,
  );
  assert.equal(
    (await prisma.privateReply.findUniqueOrThrow({ where: { id: flaky.id } })).status,
    'QUEUED',
  );
  assert.equal(
    await replies.processPrivateReply(flaky.id, { fetchImpl: busy.fetchImpl, lastAttempt: true }),
    'failed',
  );
  assert.match(
    (await prisma.privateReply.findUniqueOrThrow({ where: { id: flaky.id } })).reason ?? '',
    /^повторенията свършиха/,
  );

  const lost = await ingestOne();
  const network = fakeInstagram({
    send: () => {
      throw new TypeError('socket hang up');
    },
  });
  assert.equal(
    await replies.processPrivateReply(lost.id, { fetchImpl: network.fetchImpl }),
    'failed',
  );
  const lostRow = await prisma.privateReply.findUniqueOrThrow({ where: { id: lost.id } });
  assert.equal(lostRow.status, 'FAILED');
  assert.equal(lostRow.reason, 'неясен изход');

  // ── PR13: заварен SENDING (сринал се работник) → не праща втори път ──
  const stuck = await ingestOne();
  await prisma.privateReply.update({ where: { id: stuck.id }, data: { status: 'SENDING' } });
  const again = fakeInstagram({});
  assert.equal(
    await replies.processPrivateReply(stuck.id, { fetchImpl: again.fetchImpl }),
    'failed',
  );
  assert.equal(again.sends().length, 0);

  // ── PR13: два работника върху един ред едновременно → точно едно съобщение (CAS) ──
  const race = await ingestOne();
  const slow = fakeInstagram({});
  const slowFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    // Надписът се чете бавно: и двата работника минават решението, преди някой да заключи реда.
    if (!String(input).includes('/messages')) await new Promise((r) => setTimeout(r, 60));
    return slow.fetchImpl(input, init);
  }) as unknown as typeof fetch;
  const outcomes = await Promise.all([
    replies.processPrivateReply(race.id, { fetchImpl: slowFetch }),
    replies.processPrivateReply(race.id, { fetchImpl: slowFetch }),
  ]);
  assert.deepEqual([...outcomes].sort(), ['noop', 'sent']);
  assert.equal(slow.sends().length, 1, 'едно съобщение на коментар');

  // ── Пауза ДОКАТО работникът чете надписа → нищо не излиза (правилото е в CAS-а) ──
  const toctou = await ingestOne();
  const pausing = fakeInstagram({});
  const pauseFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (!String(input).includes('/messages')) await replies.setRulePaused(boss, rule.id, true);
    return pausing.fetchImpl(input, init);
  }) as unknown as typeof fetch;
  assert.equal(await replies.processPrivateReply(toctou.id, { fetchImpl: pauseFetch }), 'noop');
  assert.equal(pausing.sends().length, 0, 'паузата спира и съобщение в движение');
  assert.equal(
    (await prisma.privateReply.findUniqueOrThrow({ where: { id: toctou.id } })).reason,
    'правилото е променено',
  );
  await replies.setRulePaused(boss, rule.id, false);

  // ── PR12: правилото на пауза след приемането → пропуснато ──
  const paused = await ingestOne();
  await replies.setRulePaused(boss, rule.id, true);
  const quiet = fakeInstagram({});
  assert.equal(
    await replies.processPrivateReply(paused.id, { fetchImpl: quiet.fetchImpl }),
    'skipped',
  );
  assert.equal(quiet.calls.length, 0, 'дори надписът не се чете');
  await replies.setRulePaused(boss, rule.id, false);

  // ── PR12: 7 дни → изтекло ──
  const oldId = nextComment();
  await replies.ingestCommentEvents(
    [
      {
        accountIgId: IG,
        commentId: oldId,
        text: 'цена',
        mediaId: MEDIA,
        eventAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
      },
    ],
    { enqueue: async () => {} },
  );
  const old = await prisma.privateReply.findUniqueOrThrow({ where: { commentId: oldId } });
  assert.equal(
    await replies.processPrivateReply(old.id, { fetchImpl: quiet.fetchImpl }),
    'skipped',
  );

  // ── PR11: таван на час → SKIPPED „таван“, без задача ──
  const enqueued: string[] = [];
  const capId = nextComment();
  await replies.ingestCommentEvents(
    [{ accountIgId: IG, commentId: capId, text: 'цена', mediaId: MEDIA, eventAt: new Date() }],
    { enqueue: async (id) => void enqueued.push(id), perHour: 1 },
  );
  const capped = await prisma.privateReply.findUniqueOrThrow({ where: { commentId: capId } });
  assert.equal(capped.status, 'SKIPPED');
  assert.equal(capped.reason, 'таван');
  assert.equal(enqueued.length, 0);

  // Друга медия / без съвпадение → нищо не се записва.
  const ignored = await replies.ingestCommentEvents(
    [
      {
        accountIgId: IG,
        commentId: nextComment(),
        text: 'цена',
        mediaId: '19999999999999999',
        eventAt: new Date(),
      },
      {
        accountIgId: IG,
        commentId: nextComment(),
        text: 'цената?',
        mediaId: MEDIA,
        eventAt: new Date(),
      },
    ],
    { enqueue: async () => {} },
  );
  assert.equal(ignored.ignored, 2);
  // Събитие с app-scoped id (стария грешен ключ) не намира акаунт.
  const wrongKey = await replies.ingestCommentEvents(
    [
      {
        accountIgId: `2600${String(STAMP).slice(-11)}`,
        commentId: nextComment(),
        text: 'цена',
        mediaId: MEDIA,
        eventAt: new Date(),
      },
    ],
    { enqueue: async () => {} },
  );
  assert.equal(wrongKey.ignored, 1);

  // ── PR20: одитът е цял и не носи commentId ──
  const chain = await verifyAuditChain();
  assert.equal(chain.ok, true);
  const trail = await prisma.auditLog.findMany({
    where: { action: { startsWith: 'reply.' }, at: { gte: new Date(STAMP) } },
  });
  assert.ok(trail.some((a) => a.action === 'reply.sent'));
  assert.ok(trail.some((a) => a.action === 'reply.rule.approve'));
  const flat = JSON.stringify(trail);
  assert.equal(flat.includes(comment), false, 'commentId не влиза в одита');
  assert.equal(flat.includes('some_user'), false);

  // ── PR22: чистенето трие само старите редове ──
  await prisma.privateReply.update({
    where: { id: row.id },
    data: { createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
  });
  const purged = await replies.purgeOldReplies();
  assert.ok(purged >= 1);
  assert.equal(await prisma.privateReply.count({ where: { id: row.id } }), 0);
  assert.ok((await prisma.privateReply.count({ where: { accountId: account.id } })) > 0);
});

const { hashPassword } = await import('../../src/auth/password.js');

/** Минимален браузър: бисквитки + форми + CSRF (като в admin-agent-flow). */
class Browser {
  private cookies = new Map<string, string>();
  constructor(private readonly base: string) {}
  private header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  private absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const [name, value] = (pair ?? '').split('=');
      if (!name) continue;
      const expired = attrs.some(
        (a) => /max-age=0/i.test(a) || /expires=Thu, 01 Jan 1970/i.test(a),
      );
      if (expired || value === undefined || value === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
  }
  async get(path: string): Promise<Response> {
    const res = await fetch(this.base + path, {
      headers: { cookie: this.header() },
      redirect: 'manual',
    });
    this.absorb(res);
    return res;
  }
  async form(path: string, fields: Record<string, string>): Promise<Response> {
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { cookie: this.header(), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      redirect: 'manual',
    });
    this.absorb(res);
    return res;
  }
  async csrf(path: string): Promise<string> {
    const html = await (await this.get(path)).text();
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match, `няма CSRF токен в ${path}`);
    return match[1]!;
  }
}

test(
  'панелът: правило през формата, редакторът не одобрява, ревюърът — само с потвърждение',
  { skip: !hasDatabase },
  async (t) => {
    const stamp = Date.now();
    const password = 'PiumaDemo2026!';
    const editorUser = await prisma.user.create({
      data: {
        email: `ed2-${stamp}@example.com`,
        name: 'Редактор',
        passwordHash: await hashPassword(password),
        role: 'EDITOR',
      },
    });
    const reviewerUser = await prisma.user.create({
      data: {
        email: `rv2-${stamp}@example.com`,
        name: 'Ревюър',
        passwordHash: await hashPassword(password),
        role: 'REVIEWER',
      },
    });
    const brand = await prisma.brand.create({
      data: {
        slug: `replies-ui-${stamp}`,
        name: 'Мастилко',
        summary: 'Продукт.',
        voice: 'Кратко.',
        language: 'bg',
      },
    });
    const media = `1801${String(stamp).slice(-11)}`;
    const account = await prisma.instagramAccount.create({
      data: {
        brandId: brand.id,
        igUserId: `2601${String(stamp).slice(-11)}`,
        igProfessionalId: `1785${String(stamp).slice(-11)}`,
        username: `ui_${stamp}`,
        accessTokenEnc: encryptSecret('IGQV-test-token', 'a'.repeat(64)),
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        scopes: 'instagram_business_basic,instagram_business_manage_comments',
      },
    });
    await prisma.post.create({
      data: {
        brandId: brand.id,
        accountId: account.id,
        kind: 'IMAGE',
        caption: 'Коментирай ЦЕНА и ще ти пратим цените.',
        hashtags: [],
        altText: 'тест',
        mediaUrl: 'https://example.com/a.jpg',
        status: 'PUBLISHED',
        igMediaId: media,
        publishedAt: new Date(),
      },
    });

    const app = createServer({ nonceStore: new MemoryNonceStore() });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    t.after(async () => {
      server.close();
      await prisma.brand.delete({ where: { id: brand.id } }).catch(() => undefined);
      await prisma.session.deleteMany({
        where: { userId: { in: [editorUser.id, reviewerUser.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [editorUser.id, reviewerUser.id] } } });
      await prisma.$disconnect();
    });

    const page = `/admin/accounts/${account.id}/replies`;
    const editor = new Browser(base);
    assert.equal(
      (await editor.form('/admin/login', { email: editorUser.email, password })).status,
      302,
    );
    const html = await (await editor.get(page)).text();
    assert.match(html, /webhooks\/instagram/);
    assert.match(html, /Carbon Stealth VCC/, 'бележката се показва на редактора');

    const csrf = await editor.csrf(page);
    // Без CSRF → 403; с CSRF → чернова.
    assert.equal(
      (await editor.form(page, { keyword: 'цена', message: 'x', mediaId: media })).status,
      403,
    );
    const created = await editor.form(page, {
      _csrf: csrf,
      keyword: 'ЦЕНА',
      message: 'Цените са тук: https://example.com/ceni',
      mediaId: media,
      announced: 'on',
    });
    assert.equal(created.status, 302);
    const rule = await prisma.replyRule.findFirstOrThrow({ where: { accountId: account.id } });
    assert.equal(rule.status, 'DRAFT');
    assert.equal(rule.createdById, editorUser.id);

    // Редакторът няма правото да одобрява (REVIEWER+).
    const denied = await editor.form(`/admin/replies/${rule.id}/approve`, {
      _csrf: csrf,
      confirm: 'on',
    });
    assert.equal(denied.status, 403);
    assert.equal(
      (await prisma.replyRule.findUniqueOrThrow({ where: { id: rule.id } })).status,
      'DRAFT',
    );

    const reviewer = new Browser(base);
    assert.equal(
      (await reviewer.form('/admin/login', { email: reviewerUser.email, password })).status,
      302,
    );
    const rCsrf = await reviewer.csrf(page);
    // Без потвърждението на ревюъра (PR16b) → остава чернова.
    await reviewer.form(`/admin/replies/${rule.id}/approve`, { _csrf: rCsrf });
    assert.equal(
      (await prisma.replyRule.findUniqueOrThrow({ where: { id: rule.id } })).status,
      'DRAFT',
    );
    const ok = await reviewer.form(`/admin/replies/${rule.id}/approve`, {
      _csrf: rCsrf,
      confirm: 'on',
    });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), page);
    const active = await prisma.replyRule.findUniqueOrThrow({ where: { id: rule.id } });
    assert.equal(active.status, 'ACTIVE');
    assert.equal(active.approvedBy, reviewerUser.id);

    // Пауза от ревюъра; несъществуващо правило → обратно към акаунтите.
    await reviewer.form(`/admin/replies/${rule.id}/pause`, { _csrf: rCsrf });
    assert.equal(
      (await prisma.replyRule.findUniqueOrThrow({ where: { id: rule.id } })).status,
      'PAUSED',
    );
    const missing = await reviewer.form('/admin/replies/няма/approve', {
      _csrf: rCsrf,
      confirm: 'on',
    });
    assert.equal(missing.headers.get('location'), '/admin/accounts');
  },
);
