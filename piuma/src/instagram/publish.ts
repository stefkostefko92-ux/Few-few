import type { AppConfig } from '../config.js';
import { GRAPH_HOST, InstagramApiError, instagramRequest } from './client.js';
import {
  containerSchema,
  containerStatusSchema,
  mediaDetailsSchema,
  publishedMediaSchema,
  publishingLimitSchema,
  type ContainerStatus,
} from './types.js';

export interface ContainerInput {
  kind: 'IMAGE' | 'REELS';
  mediaUrl: string;
  caption: string;
  coverUrl?: string | null;
  altText?: string | null;
}

export interface PublishDeps {
  cfg: AppConfig;
  igUserId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

function base(cfg: AppConfig, igUserId: string): string {
  return `${GRAPH_HOST}/${cfg.IG_GRAPH_VERSION}/${igUserId}`;
}

/** Стъпка 1: контейнер (още НЕ е публикация). */
export async function createContainer(
  deps: PublishDeps,
  input: ContainerInput,
): Promise<{ id: string }> {
  const form: Record<string, string | undefined> = {
    caption: input.caption,
    access_token: deps.accessToken,
  };
  if (input.kind === 'REELS') {
    form.media_type = 'REELS';
    form.video_url = input.mediaUrl;
    if (input.coverUrl) form.cover_url = input.coverUrl;
  } else {
    form.image_url = input.mediaUrl;
    if (input.altText) form.alt_text = input.altText;
  }

  return instagramRequest(`${base(deps.cfg, deps.igUserId)}/media`, containerSchema, {
    method: 'POST',
    form,
    fetchImpl: deps.fetchImpl,
  });
}

export async function getContainerStatus(
  deps: PublishDeps,
  containerId: string,
): Promise<ContainerStatus> {
  return instagramRequest(
    `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${containerId}`,
    containerStatusSchema,
    {
      query: { fields: 'id,status_code,status', access_token: deps.accessToken },
      fetchImpl: deps.fetchImpl,
    },
  );
}

export interface WaitOptions {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Видеото се транскодира асинхронно — публикуваме едва на FINISHED. */
export async function waitForContainer(
  deps: PublishDeps,
  containerId: string,
  options: WaitOptions = {},
): Promise<ContainerStatus> {
  const { attempts = 20, delayMs = 5_000, sleep = defaultSleep } = options;
  let last: ContainerStatus | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await getContainerStatus(deps, containerId);
    if (last.status_code === 'FINISHED' || last.status_code === 'PUBLISHED') return last;
    if (last.status_code === 'ERROR' || last.status_code === 'EXPIRED') {
      throw new InstagramApiError(
        `Контейнерът ${containerId} завърши със статус ${last.status_code}: ${last.status ?? 'без детайл'}`,
        { httpStatus: 400 },
      );
    }
    await sleep(delayMs);
  }

  throw new InstagramApiError(
    `Контейнерът ${containerId} не стана готов навреме (последен статус ${last?.status_code ?? 'неизвестен'})`,
    { httpStatus: 504 },
  );
}

/** Стъпка 2: публикуване. */
export async function publishContainer(
  deps: PublishDeps,
  containerId: string,
): Promise<{ id: string }> {
  return instagramRequest(`${base(deps.cfg, deps.igUserId)}/media_publish`, publishedMediaSchema, {
    method: 'POST',
    form: { creation_id: containerId, access_token: deps.accessToken },
    fetchImpl: deps.fetchImpl,
  });
}

export async function fetchPermalink(deps: PublishDeps, mediaId: string): Promise<string | null> {
  const media = await instagramRequest(
    `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${mediaId}`,
    mediaDetailsSchema,
    {
      query: { fields: 'id,permalink', access_token: deps.accessToken },
      fetchImpl: deps.fetchImpl,
    },
  );
  return media.permalink ?? null;
}

export interface PublishingQuota {
  used: number;
  total: number;
  remaining: number;
}

/** Лимитът е плаващ прозорец от 24 часа на акаунт. Питаме преди да качваме. */
export async function getPublishingQuota(deps: PublishDeps): Promise<PublishingQuota> {
  const result = await instagramRequest(
    `${base(deps.cfg, deps.igUserId)}/content_publishing_limit`,
    publishingLimitSchema,
    {
      query: { fields: 'config,quota_usage', access_token: deps.accessToken },
      fetchImpl: deps.fetchImpl,
    },
  );
  const row = result.data.at(0);
  const used = row?.quota_usage ?? 0;
  const total = row?.config?.quota_total ?? 0;
  return { used, total, remaining: Math.max(total - used, 0) };
}
