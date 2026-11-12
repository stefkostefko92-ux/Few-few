import { z } from 'zod';
import { GRAPH_HOST, instagramRequest } from './client.js';
import type { PublishDeps } from './publish.js';

const sentSchema = z.object({ recipient_id: z.string().optional(), message_id: z.string() });
const successSchema = z.object({ success: z.boolean() });
const captionSchema = z.object({ id: z.string(), caption: z.string().optional() });

/**
 * Живият надпис на медията (PR12a): обявата трябва още да е там в мига на изпращане —
 * надписът може да е сменен в Instagram, извън Piuma.
 */
export async function fetchMediaCaption(
  deps: PublishDeps,
  mediaId: string,
): Promise<string | null> {
  const media = await instagramRequest(
    `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${mediaId}`,
    captionSchema,
    { query: { fields: 'caption' }, bearer: deps.accessToken, fetchImpl: deps.fetchImpl },
  );
  return media.caption ?? null;
}

/**
 * Private Reply: ЕДНО лично съобщение до човека, коментирал под наша публикация.
 * `POST /<IG_ID>/messages` с `recipient.comment_id` (документацията на Meta, private-replies,
 * сверена 2026-11-06). Токенът е в `Authorization`, не в адреса.
 */
export async function sendPrivateReply(
  deps: PublishDeps,
  commentId: string,
  text: string,
): Promise<{ messageId: string }> {
  const result = await instagramRequest(
    `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${deps.igUserId}/messages`,
    sentSchema,
    {
      method: 'POST',
      json: { recipient: { comment_id: commentId }, message: { text } },
      bearer: deps.accessToken,
      fetchImpl: deps.fetchImpl,
    },
  );
  return { messageId: result.message_id };
}

/**
 * Включва известията за коментари за акаунта. Само полето `comments` — нищо, което
 * не ни трябва (най-малко привилегии; webhooks/setup, сверено 2026-11-06).
 */
export async function subscribeToComments(deps: PublishDeps): Promise<boolean> {
  const result = await instagramRequest(
    `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${deps.igUserId}/subscribed_apps`,
    successSchema,
    {
      method: 'POST',
      form: { subscribed_fields: 'comments', access_token: deps.accessToken },
      fetchImpl: deps.fetchImpl,
    },
  );
  return result.success;
}
