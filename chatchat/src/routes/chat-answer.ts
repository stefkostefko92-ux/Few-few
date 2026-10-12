import type { CaseMessage, Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { WiredDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import { apiError } from '../auth/guards.js';
import { coversAudiences } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import type { MessageAttachment } from '../services/attachments.js';
import { saveAiAnswer } from '../services/ai-answer.js';
import { contextOf, type findCaseFor } from '../services/cases.js';
import { caseAudience, notify } from '../services/collab/notify.js';
import { caseBoardId } from '../services/devices.js';
import { loadModelAttachments } from '../services/model-inputs.js';
import { proposeConflicts } from '../services/proposals/conflicts.js';
import type { Audience } from '../retrieval/types.js';

/**
 * AI стъпката на `POST /chat/messages` за вече записано човешко съобщение (ново или повтор след
 * провал). Случаят е вече заключен с `claimAi`; при провал се връща предишният статус.
 */

const HISTORY_MESSAGES = 12;
const LOCALES = new Set(['it', 'en']);

export type ChatCase = NonNullable<Awaited<ReturnType<typeof findCaseFor>>>;

export function messageView(
  m: { id: string; kind: string; body: string; payload: Prisma.JsonValue; createdAt: Date },
  attachments: MessageAttachment[] = [],
) {
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    payload: m.payload,
    createdAt: m.createdAt,
    attachments,
  };
}

export interface AnswerArgs {
  res: Response;
  c: ChatCase;
  p: Principal;
  audiences: readonly Audience[];
  message: CaseMessage;
  question: string;
  files: MessageAttachment[];
  created: 200 | 201;
}

export async function answerMessage(deps: WiredDeps, a: AnswerArgs) {
  const { res, c, p, audiences, message } = a;
  // Заключване, останало от сринал се процес, не е статус за връщане.
  const restoreStatus = () => (c.status === 'AI_IN_PROGRESS' ? 'OPEN' : c.status);
  const diagnose = deps.diagnose;
  if (!diagnose) {
    await deps.db.case.update({ where: { id: c.id }, data: { status: restoreStatus() } });
    return apiError(res, 503, 'ai_unavailable');
  }
  // Историята към модела — без AI отговори, търсени с аудитории, които питащият няма.
  const history = (
    await deps.db.caseMessage.findMany({
      where: { caseId: c.id, kind: { in: ['HUMAN', 'AI'] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGES,
      select: { id: true, kind: true, body: true, audiences: true },
    })
  ).filter(
    (h) => h.id !== message.id && (h.kind !== 'AI' || coversAudiences(audiences, h.audiences)),
  );
  // Само файловете на ТОВА съобщение (вече CLEAN и в същия случай — bindToMessage).
  const modelFiles =
    a.files.length > 0
      ? await loadModelAttachments(
          deps.db,
          deps.attachments?.store ?? null,
          p.user.tenantId,
          message.id,
        )
      : undefined;
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  // Уникалните схеми на таблото — само за провереното табло на случая (сървърът решава).
  const deviceId = await caseBoardId(deps.db, c);
  let result;
  try {
    result = await diagnose(
      {
        scope: { tenantId: p.user.tenantId, audiences, deviceId },
        context: contextOf(c),
        question: a.question,
        history: history.reverse().map((h) => ({
          role: h.kind === 'AI' ? ('assistant' as const) : ('user' as const),
          content: h.body,
        })),
        locale: (LOCALES.has(p.user.locale) ? p.user.locale : 'it') as 'it' | 'en',
        ...(modelFiles ? { attachments: modelFiles } : {}),
      },
      controller.signal,
    );
  } catch (err) {
    await deps.db.case.update({ where: { id: c.id }, data: { status: restoreStatus() } });
    await appendAudit(deps.db, {
      tenantId: p.user.tenantId,
      actorId: p.user.id,
      action: 'ai.error',
      objectType: 'case',
      objectId: c.id,
      detail: { name: err instanceof Error ? err.name : 'unknown' },
    });
    // Само вид и код — тялото на грешката от доставчика може да носи части от заявката.
    deps.logger.warn(
      {
        caseId: c.id,
        errName: err instanceof Error ? err.name : 'unknown',
        status: typeof err === 'object' && err !== null && 'status' in err ? err.status : null,
      },
      'AI извикването се провали',
    );
    return apiError(res, 503, 'ai_unavailable');
  }

  const aiMessage = await saveAiAnswer(deps.db, {
    c,
    tenantId: p.user.tenantId,
    actorId: p.user.id,
    audiences,
    result,
  });
  // §11.3: конфликт между източници, отчетен от системата → предложение към отговорника
  // за знанието (дедупликирано; вторично — не проваля отговора).
  await proposeConflicts(deps, {
    tenantId: p.user.tenantId,
    caseId: c.id,
    messageId: aiMessage.id,
    conflicts: result.conflicts,
    evidence: result.evidence,
  });
  // FR-18: нов AI отговор в собствен случай — за създателя/поелия, ако не е питал сам.
  await notify(
    deps,
    caseAudience(c, p.user.id).map((userId) => ({
      tenantId: c.tenantId,
      userId,
      eventType: 'case.ai_answer' as const,
      objectType: 'case' as const,
      objectId: c.id,
      payload: { caseId: c.id, number: c.number, messageId: aiMessage.id },
    })),
    null,
  );
  return res
    .status(a.created)
    .json({ message: messageView(message, a.files), answer: messageView(aiMessage) });
}
