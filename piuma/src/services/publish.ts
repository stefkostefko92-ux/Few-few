import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { InstagramApiError } from '../instagram/client.js';
import {
  createContainer,
  fetchPermalink,
  getPublishingQuota,
  publishContainer,
  waitForContainer,
  type PublishDeps,
} from '../instagram/publish.js';
import { accountToken } from './accounts.js';
import { logStep, PostStateError } from './posts.js';

export interface PublishResult {
  postId: string;
  igMediaId: string;
  permalink: string | null;
}

/**
 * Единственият път до реална публикация. Инварианти:
 * 1) публикува се само пост в APPROVED или SCHEDULED — чернова никога;
 * 2) квотата на акаунта се проверява ПРЕДИ качване;
 * 3) всяка стъпка оставя следа в PublishLog.
 */
export async function publishPost(postId: string): Promise<PublishResult> {
  const cfg = config();
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { account: true } });
  if (!post) throw new PostStateError('Няма такъв пост.');
  if (post.status !== 'APPROVED' && post.status !== 'SCHEDULED') {
    throw new PostStateError(`Постът е ${post.status} — публикува се само одобрен пост.`);
  }
  if (!post.account) throw new PostStateError('Постът няма свързан Instagram акаунт.');
  if (post.account.status !== 'ACTIVE') {
    throw new PostStateError(`Акаунтът е ${post.account.status} — нужен е нов OAuth.`);
  }

  const deps: PublishDeps = {
    cfg,
    igUserId: post.account.igUserId,
    accessToken: accountToken(post.account),
  };

  await prisma.post.update({
    where: { id: post.id },
    data: { status: 'PUBLISHING', attempts: { increment: 1 }, lastError: null },
  });

  try {
    const quota = await getPublishingQuota(deps);
    await logStep(post.id, 'quota', true, { ...quota });
    if (quota.total > 0 && quota.remaining <= 0) {
      throw new InstagramApiError(
        `Изчерпана квота за публикуване (${quota.used}/${quota.total} за 24 часа).`,
        { httpStatus: 429, code: 4 },
      );
    }

    const caption = [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n');
    const container = await createContainer(deps, {
      kind: post.kind,
      mediaUrl: post.mediaUrl,
      caption,
      coverUrl: post.coverUrl,
      altText: post.altText,
    });
    await prisma.post.update({ where: { id: post.id }, data: { containerId: container.id } });
    await logStep(post.id, 'container', true, { containerId: container.id });

    if (post.kind === 'REELS') {
      const status = await waitForContainer(deps, container.id);
      await logStep(post.id, 'container-ready', true, { statusCode: status.status_code });
    }

    const media = await publishContainer(deps, container.id);
    const permalink = await fetchPermalink(deps, media.id).catch(() => null);

    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        igMediaId: media.id,
        permalink,
        publishedAt: new Date(),
      },
    });
    await logStep(post.id, 'publish', true, { igMediaId: media.id });

    return { postId: post.id, igMediaId: media.id, permalink };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестна грешка';
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'FAILED', lastError: message },
    });
    await logStep(post.id, 'publish', false, { message });
    logger.error({ postId: post.id, err: message }, 'публикуването се провали');
    throw error;
  }
}
