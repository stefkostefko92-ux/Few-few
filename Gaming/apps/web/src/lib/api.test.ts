import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

type Call = { url: string; method: string };

/** Minimal fetch double: answers by URL from a scripted queue per path. */
function stubFetch(script: Record<string, number[]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const status = script[url]?.shift() ?? 500;
      return new Response(status === 204 ? null : JSON.stringify(status === 200 ? { user: { id: "u1" } } : { error: { code: "unauthorized" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("api — access-cookie refresh (session must survive the 15-min access TTL)", () => {
  it("/auth/me on 401 rotates the cookie and replays once", async () => {
    const calls = stubFetch({ "/api/auth/me": [401, 200], "/api/auth/refresh": [200] });
    await expect(api.me()).resolves.toEqual({ user: { id: "u1" } });
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
  });

  it("does not refresh on a failed login (credentials flow is exempt)", async () => {
    const calls = stubFetch({ "/api/auth/login": [401] });
    await expect(api.login({ email: "a@b.bg", password: "x" } as never)).rejects.toMatchObject({ status: 401 });
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/login"]);
  });

  it("gives up after one replay when the refresh cookie is dead too", async () => {
    const calls = stubFetch({ "/api/auth/me": [401], "/api/auth/refresh": [401] });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/me", "/api/auth/refresh"]);
  });
});
