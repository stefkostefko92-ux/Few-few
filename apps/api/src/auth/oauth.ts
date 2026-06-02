import { OAuthProvider } from "@aso/db";
import { env } from "../env.js";
import { badRequest } from "../http.js";

/**
 * Hand-rolled OAuth 2.0 authorization-code flow for Google and Facebook.
 *
 * Env-gated: a provider is only "enabled" when both its client id and secret
 * are present (see env.oauth). Credentials never leave the server — the browser
 * only ever sees the provider's own authorize URL and our callback. CSRF is
 * covered by a random `state` echoed through a short-lived cookie (set in the
 * route), and we request the minimum scopes needed to create an account.
 */

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  displayName: string;
  emailVerified: boolean;
}

interface ProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

const lower = (p: OAuthProvider) => p.toLowerCase();

export function redirectUri(provider: OAuthProvider): string {
  return `${env.PUBLIC_API_URL}/api/auth/oauth/${lower(provider)}/callback`;
}

function configFor(provider: OAuthProvider): ProviderConfig {
  switch (provider) {
    case OAuthProvider.GOOGLE:
      return {
        enabled: env.oauth.google,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
        fetchProfile: async (accessToken) => {
          const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw badRequest("oauth_profile", "Неуспешно извличане на профил от Google");
          const p = (await res.json()) as {
            sub: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
          };
          return {
            providerAccountId: p.sub,
            email: p.email ?? null,
            displayName: p.name ?? p.email?.split("@")[0] ?? "Играч",
            emailVerified: p.email_verified === true,
          };
        },
      };
    case OAuthProvider.FACEBOOK:
      return {
        enabled: env.oauth.facebook,
        clientId: env.FACEBOOK_APP_ID,
        clientSecret: env.FACEBOOK_APP_SECRET,
        authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scope: "email public_profile",
        fetchProfile: async (accessToken) => {
          const url = new URL("https://graph.facebook.com/me");
          url.searchParams.set("fields", "id,name,email");
          url.searchParams.set("access_token", accessToken);
          const res = await fetch(url);
          if (!res.ok) throw badRequest("oauth_profile", "Неуспешно извличане на профил от Facebook");
          const p = (await res.json()) as { id: string; name?: string; email?: string };
          return {
            providerAccountId: p.id,
            email: p.email ?? null,
            // Facebook only returns verified emails on the Graph API.
            emailVerified: Boolean(p.email),
            displayName: p.name ?? p.email?.split("@")[0] ?? "Играч",
          };
        },
      };
  }
}

/** Whether a provider can be used right now (credentials present). */
export function providerEnabled(provider: OAuthProvider): boolean {
  return configFor(provider).enabled;
}

/** Build the provider's authorize URL to redirect the browser to. */
export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const cfg = configFor(provider);
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchange an authorization code for the provider's normalized profile. */
export async function exchangeCodeForProfile(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile> {
  const cfg = configFor(provider);
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(provider),
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!tokenRes.ok) throw badRequest("oauth_token", "Неуспешна размяна на код за токен");

  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw badRequest("oauth_token", "Липсва access token от доставчика");

  return cfg.fetchProfile(token.access_token);
}
