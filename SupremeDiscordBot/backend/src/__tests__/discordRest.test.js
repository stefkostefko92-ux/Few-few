// backend/src/__tests__/discordRest.test.js
// Регресии за спазването на rate limit-ите на Discord (07.08.2026).
// Находка на Дискорджията: суровите axios извиквания към discord.com/api бяха
// извън опашкаря на discord.js и НЯМАХА никаква обработка на 429 — нито четене
// на Retry-After, нито backoff. Системното пренебрегване на лимитите е
// нарушение на Developer Terms и блокер за верификация.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const axiosMock = vi.fn();
vi.mock("axios", () => ({ default: (...a) => axiosMock(...a) }));

const { discordRequest, fetchUserGuilds, __testing } = await import("../lib/discordRest.js");

function rateLimited({ retryAfter = 0.05, global = false } = {}) {
  const err = new Error("Request failed with status code 429");
  err.response = {
    status: 429,
    headers: { "retry-after": String(retryAfter), ...(global ? { "x-ratelimit-global": "true" } : {}) },
    data: { retry_after: retryAfter, global },
  };
  return err;
}

beforeEach(() => {
  axiosMock.mockReset();
  __testing.guildCache.clear();
});
afterEach(() => vi.useRealTimers());

describe("discordRequest — 429 и Retry-After", () => {
  it("повтаря след Retry-After и връща успеха", async () => {
    axiosMock
      .mockRejectedValueOnce(rateLimited({ retryAfter: 0.01 }))
      .mockResolvedValueOnce({ data: [{ id: "g1" }] });

    const res = await discordRequest({ method: "get", url: "https://discord.com/api/v10/x" });
    expect(res.data).toEqual([{ id: "g1" }]);
    expect(axiosMock).toHaveBeenCalledTimes(2);
  });

  it("ГЛОБАЛЕН лимит → спира веднага, не дълбае", async () => {
    axiosMock.mockRejectedValue(rateLimited({ retryAfter: 0.01, global: true }));
    await expect(discordRequest({ method: "get", url: "https://discord.com/api/v10/x" }))
      .rejects.toMatchObject({ response: { status: 429 } });
    expect(axiosMock).toHaveBeenCalledTimes(1);
  });

  it("изчакване над тавана → отказва вместо да виси", async () => {
    axiosMock.mockRejectedValue(rateLimited({ retryAfter: 60 })); // 60s ≫ 5s таван
    await expect(discordRequest({ method: "get", url: "https://discord.com/api/v10/x" }))
      .rejects.toMatchObject({ response: { status: 429 } });
    expect(axiosMock).toHaveBeenCalledTimes(1);
  });

  it("не повтаря при 401/403/404 — не са преходни", async () => {
    for (const status of [401, 403, 404]) {
      axiosMock.mockReset();
      const err = new Error("x");
      err.response = { status, headers: {} };
      axiosMock.mockRejectedValue(err);
      await expect(discordRequest({ method: "get", url: "u" })).rejects.toBeTruthy();
      expect(axiosMock).toHaveBeenCalledTimes(1);
    }
  });

  it("спира след тавана на опитите, не в безкраен цикъл", async () => {
    axiosMock.mockRejectedValue(rateLimited({ retryAfter: 0.001 }));
    await expect(discordRequest({ method: "get", url: "u" })).rejects.toBeTruthy();
    expect(axiosMock.mock.calls.length).toBeLessThanOrEqual(4); // 1 + MAX_RETRIES
  });
});

describe("fetchUserGuilds — кеш срещу биене на /users/@me/guilds", () => {
  it("втората заявка със същия токен НЕ пипа Discord", async () => {
    axiosMock.mockResolvedValue({ data: [{ id: "g1" }] });
    await fetchUserGuilds("tok-a");
    await fetchUserGuilds("tok-a");
    await fetchUserGuilds("tok-a");
    expect(axiosMock).toHaveBeenCalledTimes(1);
  });

  it("различен токен → отделен запис (нула изтичане между потребители)", async () => {
    axiosMock
      .mockResolvedValueOnce({ data: [{ id: "g1" }] })
      .mockResolvedValueOnce({ data: [{ id: "g2" }] });
    const a = await fetchUserGuilds("tok-a");
    const b = await fetchUserGuilds("tok-b");
    expect(a).toEqual([{ id: "g1" }]);
    expect(b).toEqual([{ id: "g2" }]);
    expect(axiosMock).toHaveBeenCalledTimes(2);
  });

  it("след изтичане на TTL дърпа наново", async () => {
    axiosMock.mockResolvedValue({ data: [{ id: "g1" }] });
    await fetchUserGuilds("tok-a");
    // Изкуствено състаряване — по-честно от манипулация на времето в целия модул.
    __testing.guildCache.get("tok-a").expiresAt = Date.now() - 1;
    await fetchUserGuilds("tok-a");
    expect(axiosMock).toHaveBeenCalledTimes(2);
  });
});
