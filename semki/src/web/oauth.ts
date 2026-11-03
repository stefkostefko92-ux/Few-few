// Discord OAuth2 (authorization code, обхват само `identify`): кой е потребителят. Членството и ролите
// се проверяват отделно през бота — токенът на потребителя не се пази никъде.
import { z } from 'zod';

const DISCORD_API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 10_000;

const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string() });
const userSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  // Хешът влиза в URL — нещо различно от истински хеш просто не се показва.
  avatar: z
    .string()
    .regex(/^(a_)?[0-9a-f]{32}$/)
    .nullable()
    .optional()
    .catch(null),
});

export interface DiscordIdentity {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface OAuthClient {
  authorizeUrl(state: string): string;
  identify(code: string): Promise<DiscordIdentity>;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createDiscordOAuth(cfg: OAuthConfig): OAuthClient {
  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
        prompt: 'none',
      });
      return `https://discord.com/oauth2/authorize?${params.toString()}`;
    },
    async identify(code) {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!tokenRes.ok) throw new Error(`Discord OAuth token: HTTP ${tokenRes.status}`);
      const token = tokenSchema.parse(await tokenRes.json());

      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!userRes.ok) throw new Error(`Discord users/@me: HTTP ${userRes.status}`);
      const user = userSchema.parse(await userRes.json());
      return {
        id: user.id,
        name: (user.global_name ?? user.username).slice(0, 100),
        avatarUrl: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
          : null,
      };
    },
  };
}
