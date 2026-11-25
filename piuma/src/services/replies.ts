import { Prisma, type PrivateReplyStatus } from '@prisma/client';
import { audit, type AuditActor } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { InstagramApiError } from '../instagram/client.js';
import { fetchMediaCaption, sendPrivateReply, subscribeToComments } from '../instagram/messages.js';
import { enqueueReply } from '../queue/publish-queue.js';
import {
  classifySendError,
  decideSend,
  hasCommentsScope,
  validateRuleInput,
  type RuleInput,
} from '../replies/decide.js';
import { announces, composeMessage, replyFooter } from '../replies/compose.js';
import type { CommentEvent } from '../replies/events.js';
import { matchRule } from '../replies/match.js';
import { accountToken } from './accounts.js';

/**
 * „Отговор по ключова дума“ — инвариантите живеят тук (docs/private-replies.md):
 * едно съобщение на коментар (уникален commentId + CAS), правилото тръгва само след друг
 * човек, нищо от профила на коментиращия не се пази, а commentId живее 30 дни.
 */
const SYSTEM: AuditActor = { type: 'SYSTEM', id: null, label: 'лични съобщения' };
const HOUR_MS = 3600 * 1000;
/** Докато политиката не е зададена, дължината на бележката се мери с адрес от 60 знака. */
const PRIVACY_PLACEHOLDER = `https://${'x'.repeat(52)}`;

/** Бележката под съобщението (PR16a) — на езика на бранда, с адресите от конфигурацията. */
export function footerFor(brand: { name: string; language: string }, keyword: string): string {
  const cfg = config();
  return replyFooter(brand.language, {
    brand: brand.name,
    keyword,
    privacyUrl: cfg.REPLY_PRIVACY_URL ?? PRIVACY_PLACEHOLDER,
    contact: cfg.REPLY_CONTACT_EMAIL,
  });
}

/** Грешка към човека в панела — `key` е ключ от речника. */
export class ReplyRuleError extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = 'ReplyRuleError';
  }
}

export interface IngestDeps {
  enqueue?: (replyId: string) => Promise<void>;
  now?: () => Date;
  perHour?: number;
}

export interface IngestSummary {
  queued: number;
  skipped: number;
  duplicate: number;
  ignored: number;
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * PR9–PR11: съвпадение → ред `QUEUED` (или `SKIPPED` над тавана) → задача. Без мрежа към
 * Meta. Хвърля при провал на базата/опашката — маршрутът отговаря 500 и Meta повтаря.
 */
export async function ingestCommentEvents(
  events: CommentEvent[],
  deps: IngestDeps = {},
): Promise<IngestSummary> {
  const enqueue = deps.enqueue ?? enqueueReply;
  const now = deps.now?.() ?? new Date();
  const cap = deps.perHour ?? config().PRIVATE_REPLIES_PER_HOUR;
  const summary: IngestSummary = { queued: 0, skipped: 0, duplicate: 0, ignored: 0 };

  // Партидата е до 1000 известия: акаунтът и правилата се четат веднъж на акаунт, не на събитие.
  type Context = { accountId: string; rules: RuleRow[] } | null;
  type RuleRow = { id: string; keyword: string; mediaId: string; createdAt: Date };
  const contexts = new Map<string, Context>();
  const contextOf = async (igId: string): Promise<Context> => {
    if (contexts.has(igId)) return contexts.get(igId)!;
    // `entry.id` е IG_ID (`user_id`), не app-scoped `igUserId` (get-started, 2026-11-06).
    const account = await prisma.instagramAccount.findUnique({
      where: { igProfessionalId: igId },
      select: { id: true, status: true },
    });
    const context =
      account && account.status === 'ACTIVE'
        ? {
            accountId: account.id,
            rules: await prisma.replyRule.findMany({
              where: { accountId: account.id, status: 'ACTIVE' },
              select: { id: true, keyword: true, mediaId: true, createdAt: true },
            }),
          }
        : null;
    contexts.set(igId, context);
    return context;
  };

  for (const event of events) {
    const context = await contextOf(event.accountIgId);
    const rule = context ? matchRule(context.rules, event) : null;
    if (!context || !rule) {
      summary.ignored += 1;
      continue;
    }

    let row: { id: string; status: PrivateReplyStatus };
    try {
      // Таванът и записът са едно цяло: ключалка на акаунта, иначе паралелни партиди го прескачат.
      row = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.accountId}))`;
        const recent = await tx.privateReply.count({
          where: {
            accountId: context.accountId,
            createdAt: { gte: new Date(now.getTime() - HOUR_MS) },
            status: { in: ['QUEUED', 'SENDING', 'SENT'] },
          },
        });
        const overCap = recent >= cap;
        return tx.privateReply.create({
          data: {
            commentId: event.commentId,
            accountId: context.accountId,
            ruleId: rule.id,
            mediaId: event.mediaId,
            eventAt: event.eventAt,
            status: overCap ? 'SKIPPED' : 'QUEUED',
            reason: overCap ? 'таван' : null,
          },
          select: { id: true, status: true },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Повторна доставка. Ако първият път опашката е паднала след записа, редът стои QUEUED
      // без задача — слагаме я пак; id-то ѝ е по реда, тоест BullMQ не я дублира.
      summary.duplicate += 1;
      const existing = await prisma.privateReply.findUnique({
        where: { commentId: event.commentId },
        select: { id: true, status: true },
      });
      if (existing?.status === 'QUEUED') await enqueue(existing.id);
      continue;
    }

    if (row.status === 'SKIPPED') {
      summary.skipped += 1;
      await audit(SYSTEM, {
        action: 'reply.skipped',
        targetType: 'ReplyRule',
        targetId: rule.id,
        detail: { replyId: row.id, reason: 'таван' },
      });
      continue;
    }
    await enqueue(row.id);
    summary.queued += 1;
  }

  if (summary.queued || summary.skipped) logger.info(summary, 'приети коментари с ключова дума');
  return summary;
}

async function settle(
  replyId: string,
  ruleId: string | null,
  from: PrivateReplyStatus[],
  status: 'FAILED' | 'SKIPPED',
  reason: string,
): Promise<void> {
  const changed = await prisma.privateReply.updateMany({
    where: { id: replyId, status: { in: from } },
    data: { status, reason },
  });
  if (!changed.count) return;
  await audit(SYSTEM, {
    action: status === 'FAILED' ? 'reply.failed' : 'reply.skipped',
    targetType: 'ReplyRule',
    targetId: ruleId ?? undefined,
    detail: { replyId, reason },
  });
}

export interface ProcessOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Последният опит на BullMQ — повторима грешка вече не връща реда в опашката. */
  lastAttempt?: boolean;
}

export type ProcessOutcome = 'sent' | 'skipped' | 'failed' | 'noop' | 'missing';

/**
 * Работникът: решение (PR12/PR13) → CAS `QUEUED → SENDING` → една заявка (PR14) → изход (PR15).
 * Повторима грешка от Meta хвърля, за да повтори BullMQ; всичко неясно спира.
 */
export async function processPrivateReply(
  replyId: string,
  options: ProcessOptions = {},
): Promise<ProcessOutcome> {
  const now = options.now?.() ?? new Date();
  const row = await prisma.privateReply.findUnique({
    where: { id: replyId },
    include: { rule: true, account: { include: { brand: true } } },
  });
  if (!row) return 'missing';

  const decision = decideSend({
    status: row.status,
    ruleStatus: row.rule?.status ?? null,
    accountStatus: row.account.status,
    accountScopes: row.account.scopes,
    hasProfessionalId: Boolean(row.account.igProfessionalId),
    privacyConfigured: Boolean(config().REPLY_PRIVACY_URL),
    eventAt: row.eventAt,
    now,
  });
  if (decision.action === 'noop') return 'noop';
  if (decision.action === 'fail') {
    await settle(row.id, row.ruleId, ['SENDING'], 'FAILED', decision.reason);
    return 'failed';
  }
  if (decision.action === 'skip') {
    await settle(row.id, row.ruleId, ['QUEUED'], 'SKIPPED', decision.reason);
    return 'skipped';
  }

  // Всичко до CAS-а е „не е пратено“: токен, обявата на живо, текстът с бележката.
  const rule = row.rule!;
  const accessToken = accountToken(row.account);
  // `/messages` и надписът се адресират с IG_ID — същото id, което дойде в webhook-а.
  const deps = {
    cfg: config(),
    igUserId: row.account.igProfessionalId!,
    accessToken,
    fetchImpl: options.fetchImpl,
  };
  let caption: string | null;
  try {
    caption = await fetchMediaCaption(deps, rule.mediaId);
  } catch (error) {
    if (classifySendError(error) === 'retry' && !options.lastAttempt) throw error;
    await settle(row.id, row.ruleId, ['QUEUED'], 'SKIPPED', 'обявата не е проверена');
    return 'skipped';
  }
  if (!announces(caption, rule.keyword)) {
    await settle(row.id, row.ruleId, ['QUEUED'], 'SKIPPED', 'обявата липсва');
    return 'skipped';
  }
  const composed = composeMessage(rule.message, footerFor(row.account.brand, rule.keyword));
  if (!composed.ok) {
    await settle(row.id, row.ruleId, ['QUEUED'], 'SKIPPED', 'текстът е над 1000 байта');
    return 'skipped';
  }

  // CAS: редът е още QUEUED И правилото е същото активно правило, което прочетохме — пауза,
  // изтриване или редакция докато четем надписа спира изпращането (не праща стар текст).
  const claimed = await prisma.privateReply.updateMany({
    where: {
      id: row.id,
      status: 'QUEUED',
      rule: { is: { id: rule.id, status: 'ACTIVE', updatedAt: rule.updatedAt } },
    },
    data: { status: 'SENDING' },
  });
  if (!claimed.count) {
    await settle(row.id, row.ruleId, ['QUEUED'], 'SKIPPED', 'правилото е променено');
    return 'noop';
  }

  let messageId: string;
  try {
    ({ messageId } = await sendPrivateReply(deps, row.commentId, composed.text));
  } catch (error) {
    const kind = classifySendError(error);
    const code =
      error instanceof InstagramApiError ? String(error.code ?? error.httpStatus) : 'без код';
    if (kind === 'retry' && !options.lastAttempt) {
      await prisma.privateReply.updateMany({
        where: { id: row.id, status: 'SENDING' },
        data: { status: 'QUEUED', reason: `повтор след ${code}` },
      });
      throw error;
    }
    const reason =
      kind === 'ambiguous'
        ? 'неясен изход'
        : kind === 'retry'
          ? `повторенията свършиха (${code})`
          : `Meta отказа (${code})`;
    await settle(row.id, row.ruleId, ['SENDING'], 'FAILED', reason);
    logger.warn({ replyId: row.id, reason }, 'личното съобщение не е изпратено');
    return 'failed';
  }

  // Изпратено е. Провал на записа оттук нататък НЕ е „неясен изход“ — хвърля, редът остава
  // SENDING и следващият опит го записва като неясен, без второ съобщение.
  await prisma.privateReply.update({
    where: { id: row.id },
    data: { status: 'SENT', sentAt: new Date(), messageId, reason: null },
  });
  await audit(SYSTEM, {
    action: 'reply.sent',
    targetType: 'ReplyRule',
    targetId: row.ruleId ?? undefined,
    detail: { replyId: row.id },
  });
  return 'sent';
}

/** PR22: редовете с commentId живеят `PRIVATE_REPLIES_RETENTION_DAYS` дни (9–30). */
export async function purgeOldReplies(now: Date = new Date()): Promise<number> {
  const days = config().PRIVATE_REPLIES_RETENTION_DAYS;
  const cutoff = new Date(now.getTime() - days * 24 * HOUR_MS);
  const result = await prisma.privateReply.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}

// ───────────────────────── правилата (панелът) ─────────────────────────

export interface RuleForm extends RuleInput {
  announced: boolean;
}

type HumanActor = AuditActor & { id: string };

/** Медията е наша публикувана медия от същия акаунт — не свободен текст. Връща надписа. */
async function ownPost(accountId: string, mediaId: string) {
  const post = await prisma.post.findFirst({
    where: { accountId, igMediaId: mediaId, status: 'PUBLISHED' },
    select: { caption: true, hashtags: true },
  });
  if (!post) throw new ReplyRuleError('replies.errMedia');
  return post;
}

function validated(form: RuleForm) {
  const result = validateRuleInput(form);
  if (!result.ok) throw new ReplyRuleError(result.error);
  return result;
}

/** Текстът с бележката трябва да се побере в 1000 байта още при записа (PR16a). */
function assertFits(brand: { name: string; language: string }, keyword: string, message: string) {
  if (!composeMessage(message, footerFor(brand, keyword)).ok) {
    throw new ReplyRuleError('replies.errTooLong');
  }
}

export async function createRule(actor: HumanActor, accountId: string, form: RuleForm) {
  const input = validated(form);
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    include: { brand: true },
  });
  if (!account) throw new ReplyRuleError('flash.noAccount');
  await ownPost(account.id, input.mediaId);
  assertFits(account.brand, input.keyword, input.message);
  const rule = await prisma.replyRule.create({
    data: {
      accountId: account.id,
      keyword: input.keyword,
      mediaId: input.mediaId,
      message: input.message,
      announced: form.announced,
      createdById: actor.id,
    },
  });
  await audit(actor, {
    action: 'reply.rule.create',
    targetType: 'ReplyRule',
    targetId: rule.id,
    detail: { accountId: account.id, keyword: rule.keyword, mediaId: rule.mediaId },
  });
  return rule;
}

/**
 * PR17: редакцията връща правилото в чернова. Авторът на НОВИЯ текст става `createdById` —
 * иначе който редактира чужда чернова, би одобрил собствения си текст.
 */
export async function updateRule(actor: HumanActor, ruleId: string, form: RuleForm) {
  const input = validated(form);
  const rule = await prisma.replyRule.findUnique({
    where: { id: ruleId },
    include: { account: { include: { brand: true } } },
  });
  if (!rule) throw new ReplyRuleError('replies.errMissing');
  await ownPost(rule.accountId, input.mediaId);
  assertFits(rule.account.brand, input.keyword, input.message);
  const updated = await prisma.replyRule.update({
    where: { id: rule.id },
    data: {
      keyword: input.keyword,
      mediaId: input.mediaId,
      message: input.message,
      announced: form.announced,
      status: 'DRAFT',
      createdById: actor.id,
      approvedBy: null,
      approvedAt: null,
    },
  });
  await audit(actor, {
    action: 'reply.rule.update',
    targetType: 'ReplyRule',
    targetId: rule.id,
    detail: { keyword: updated.keyword, mediaId: updated.mediaId, wasStatus: rule.status },
  });
  return updated;
}

/**
 * PR18/PR19: друг човек; обявено от автора и потвърдено от ревюъра (PR16b); публикацията
 * в Piuma носи думата в надписа; политиката е зададена; акаунт с правото за коментари.
 */
export async function approveRule(actor: HumanActor, ruleId: string, confirmed: boolean) {
  const rule = await prisma.replyRule.findUnique({
    where: { id: ruleId },
    include: { account: { include: { brand: true } } },
  });
  if (!rule) throw new ReplyRuleError('replies.errMissing');
  if (rule.status !== 'DRAFT') throw new ReplyRuleError('replies.errState');
  if (rule.createdById === actor.id) throw new ReplyRuleError('replies.errFourEyes');
  if (!rule.announced || !confirmed) throw new ReplyRuleError('replies.errAnnounced');
  if (!config().REPLY_PRIVACY_URL) throw new ReplyRuleError('replies.errLegal');
  if (rule.account.status !== 'ACTIVE' || !hasCommentsScope(rule.account.scopes)) {
    throw new ReplyRuleError('replies.errScope');
  }
  if (!rule.account.igProfessionalId) throw new ReplyRuleError('replies.errReconnect');
  const post = await ownPost(rule.accountId, rule.mediaId);
  if (!announces([post.caption, ...post.hashtags].join(' '), rule.keyword)) {
    throw new ReplyRuleError('replies.errNotAnnounced');
  }
  assertFits(rule.account.brand, rule.keyword, rule.message);
  // Условно: редакция между отварянето и одобрението връща правилото в чернова с нов автор.
  const changed = await prisma.replyRule.updateMany({
    where: { id: rule.id, status: 'DRAFT', updatedAt: rule.updatedAt },
    data: { status: 'ACTIVE', approvedBy: actor.id, approvedAt: new Date() },
  });
  if (!changed.count) throw new ReplyRuleError('replies.errState');
  await audit(actor, {
    action: 'reply.rule.approve',
    targetType: 'ReplyRule',
    targetId: rule.id,
    detail: { confirmed: true },
  });
}

export async function setRulePaused(actor: HumanActor, ruleId: string, paused: boolean) {
  const rule = await prisma.replyRule.findUnique({
    where: { id: ruleId },
    include: { account: true },
  });
  if (!rule) throw new ReplyRuleError('replies.errMissing');
  if (!paused && (rule.account.status !== 'ACTIVE' || !hasCommentsScope(rule.account.scopes))) {
    throw new ReplyRuleError('replies.errScope');
  }
  if (!paused && !rule.account.igProfessionalId) throw new ReplyRuleError('replies.errReconnect');
  const changed = await prisma.replyRule.updateMany({
    where: { id: rule.id, status: paused ? 'ACTIVE' : 'PAUSED' },
    data: { status: paused ? 'PAUSED' : 'ACTIVE' },
  });
  if (!changed.count) throw new ReplyRuleError('replies.errState');
  await audit(actor, {
    action: paused ? 'reply.rule.pause' : 'reply.rule.resume',
    targetType: 'ReplyRule',
    targetId: rule.id,
  });
}

export async function deleteRule(actor: HumanActor, ruleId: string): Promise<string> {
  const rule = await prisma.replyRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new ReplyRuleError('replies.errMissing');
  await prisma.replyRule.delete({ where: { id: rule.id } });
  await audit(actor, {
    action: 'reply.rule.delete',
    targetType: 'ReplyRule',
    targetId: rule.id,
    detail: { keyword: rule.keyword, wasStatus: rule.status },
  });
  return rule.accountId;
}

/** Включва известията за коментари на акаунта в Meta (`subscribed_apps`, само `comments`). */
export async function subscribeAccount(
  actor: HumanActor,
  accountId: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new ReplyRuleError('flash.noAccount');
  if (account.status !== 'ACTIVE' || !hasCommentsScope(account.scopes)) {
    throw new ReplyRuleError('replies.errScope');
  }
  if (!account.igProfessionalId) throw new ReplyRuleError('replies.errReconnect');
  const ok = await subscribeToComments({
    cfg: config(),
    igUserId: account.igProfessionalId,
    accessToken: accountToken(account),
    fetchImpl,
  });
  await audit(actor, {
    action: 'account.comments.subscribe',
    targetType: 'InstagramAccount',
    targetId: account.id,
    detail: { ok },
  });
  if (!ok) throw new ReplyRuleError('replies.errSubscribe');
}

/** Броят по състояние за срока на съхранение — повече история няма. */
export async function replyStats(accountId: string): Promise<Record<string, number>> {
  const since = new Date(Date.now() - config().PRIVATE_REPLIES_RETENTION_DAYS * 24 * HOUR_MS);
  const rows = await prisma.privateReply.groupBy({
    by: ['status'],
    where: { accountId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}
