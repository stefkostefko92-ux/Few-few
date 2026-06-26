import { describe, expect, it } from "vitest";
import { OAuthProvider } from "@aso/db";
import { buildAuthorizeUrl, providerEnabled, redirectUri } from "./oauth.js";

describe("oauth", () => {
  it("is disabled until credentials are present (env-gated)", () => {
    // The test env sets no client ids/secrets, so neither provider is usable.
    expect(providerEnabled(OAuthProvider.GOOGLE)).toBe(false);
    expect(providerEnabled(OAuthProvider.FACEBOOK)).toBe(false);
  });

  it("derives a stable callback URL per provider", () => {
    expect(redirectUri(OAuthProvider.GOOGLE)).toBe(
      "http://localhost:4500/api/auth/oauth/google/callback",
    );
    expect(redirectUri(OAuthProvider.FACEBOOK)).toBe(
      "http://localhost:4500/api/auth/oauth/facebook/callback",
    );
  });

  it("builds a Google authorize URL with the required params", () => {
    const url = new URL(buildAuthorizeUrl(OAuthProvider.GOOGLE, "state-xyz"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri(OAuthProvider.GOOGLE));
  });

  it("builds a Facebook authorize URL pointing at the dialog endpoint", () => {
    const url = new URL(buildAuthorizeUrl(OAuthProvider.FACEBOOK, "s"));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri(OAuthProvider.FACEBOOK));
  });
});
