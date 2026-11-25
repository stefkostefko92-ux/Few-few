import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@aso/shared";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { __resetUserRefreshForTests, refreshUser } from "./userRefresh";

const user = (chips: string): PublicUser => ({
  id: "u1", email: "a@b.bg", emailVerified: true, displayName: "Иван", role: "PLAYER",
  locale: "bg", chips, gems: 0, xp: 0, level: 1, vipTier: "NONE",
});

beforeEach(() => {
  __resetUserRefreshForTests();
  useAuthStore.getState().setUser(user("100"));
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().setUser(null);
});

describe("опресняване на профила (хедър след мач / фокус)", () => {
  it("обновява чиповете от /auth/me", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ user: user("250") } as Awaited<ReturnType<typeof api.me>>);
    await refreshUser(true);
    expect(useAuthStore.getState().user?.chips).toBe("250");
  });

  it("фокусът е ограничен; краят на мач (force) минава винаги", async () => {
    const me = vi.spyOn(api, "me").mockResolvedValue({ user: user("300") } as Awaited<ReturnType<typeof api.me>>);
    await refreshUser();
    await refreshUser();
    expect(me).toHaveBeenCalledTimes(1);
    await refreshUser(true);
    expect(me).toHaveBeenCalledTimes(2);
  });

  it("без вписан потребител не прави заявка", async () => {
    useAuthStore.getState().setUser(null);
    const me = vi.spyOn(api, "me");
    await refreshUser(true);
    expect(me).not.toHaveBeenCalled();
  });
});
