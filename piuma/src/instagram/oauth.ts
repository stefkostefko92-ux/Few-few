import type { AppConfig } from '../config.js';
import { GRAPH_HOST, OAUTH_HOST, instagramRequest } from './client.js';
import {
  longLivedTokenSchema,
  profileSchema,
  shortLivedTokenSchema,
  type InstagramProfile,
  type LongLivedToken,
  type ShortLivedToken,
} from './types.js';

/**
 * Instagram API с Instagram Login (Direct Login) — професионален акаунт
 * (Business/Creator) без задължителна свързана Facebook страница.
 */
export function buildAuthorizeUrl(cfg: AppConfig, state: string): string {
  const url = new URL('/oauth/authorize', OAUTH_HOST);
  url.searchParams.set('client_id', cfg.IG_APP_ID);
  url.searchParams.set('redirect_uri', cfg.IG_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.IG_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForToken(
  cfg: AppConfig,
  code: string,
  fetchImpl?: typeof fetch,
): Promise<ShortLivedToken> {
  return instagramRequest(`${OAUTH_HOST}/oauth/access_token`, shortLivedTokenSchema, {
    method: 'POST',
    form: {
      client_id: cfg.IG_APP_ID,
      client_secret: cfg.IG_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: cfg.IG_REDIRECT_URI,
      code,
    },
    fetchImpl,
  });
}

/** Кратък (1 час) → дълготраен (60 дни) токен. */
export async function exchangeForLongLivedToken(
  cfg: AppConfig,
  shortLivedToken: string,
  fetchImpl?: typeof fetch,
): Promise<LongLivedToken> {
  return instagramRequest(`${GRAPH_HOST}/access_token`, longLivedTokenSchema, {
    query: {
      grant_type: 'ig_exchange_token',
      client_secret: cfg.IG_APP_SECRET,
      access_token: shortLivedToken,
    },
    fetchImpl,
  });
}

/** Подновяване. Токенът трябва да е поне на 24 часа и да не е изтекъл. */
export async function refreshLongLivedToken(
  accessToken: string,
  fetchImpl?: typeof fetch,
): Promise<LongLivedToken> {
  return instagramRequest(`${GRAPH_HOST}/refresh_access_token`, longLivedTokenSchema, {
    query: { grant_type: 'ig_refresh_token', access_token: accessToken },
    fetchImpl,
  });
}

export async function fetchProfile(
  cfg: AppConfig,
  accessToken: string,
  fetchImpl?: typeof fetch,
): Promise<InstagramProfile> {
  return instagramRequest(`${GRAPH_HOST}/${cfg.IG_GRAPH_VERSION}/me`, profileSchema, {
    query: { fields: 'id,username,account_type', access_token: accessToken },
    fetchImpl,
  });
}
