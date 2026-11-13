// bot/src/__tests__/launchPhase2Giveaway.test.js
// Поток Т, фаза 2: Р1 / А4 — раздаване с изисквани роли (бутонът праща memberRoleIds ПРЕДИ записа)
// и проверката на членството за тегленето (/internal/giveaway-members-check).
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret";
const get = vi.fn(), post = vi.fn(), patch = vi.fn();
vi.mock("axios", () => ({
  default: { create: () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }) },
}));

const { handleGiveawayEnter } = await import("../events/interactionCreate.js");
const { t } = await import("../i18n/index.js");

const GUILD = "111111111111111111";
function inter(roleIds = []) {
  const i = {
    user: { id: "222222222222222222" }, guildId: GUILD, locale: "bg",
    member: { roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) } },
    message: { edit: vi.fn(async () => {}) },
    deferReply: vi.fn(async () => {}), editReply: vi.fn(async () => {}),
  };
  return i;
}

beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ data: { entryCount: 1, prize: "x", requiredRoleIds: [] } }); });

describe("Р1 / А4 — бутон за участие", () => {
  it("праща memberRoleIds в ПЪРВАТА заявка и не прави второ „връщане“", async () => {
    post.mockResolvedValue({ data: { entered: true, entryCount: 1, requiredRoleIds: ["r1"] } });
    const i = inter(["r1", "r9"]);
    await handleGiveawayEnter(i, "g1");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ serverId: GUILD, userId: "222222222222222222" });
    expect(post.mock.calls[0][1].memberRoleIds.sort()).toEqual(["r1", "r9"]);
  });

  it("403 ROLE_REQUIRED → преведен отказ с липсващите роли, суровото съобщение не стига до човека", async () => {
    post.mockRejectedValue(Object.assign(new Error("Request failed with status code 403"), {
      response: { status: 403, data: { error: "ROLE_REQUIRED", missingRoleIds: ["333333333333333333", "444444444444444444"] } },
    }));
    const i = inter([]);
    await handleGiveawayEnter(i, "g1");
    const text = String(i.editReply.mock.calls.at(-1)[0]);
    expect(text).toBe(t("giveaway.rolesRequired", "bg", { roles: "<@&333333333333333333>, <@&444444444444444444>" }));
    expect(text).not.toContain("Request failed");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("друга грешка → преведено общо съобщение, не err.message", async () => {
    post.mockRejectedValue(new Error("socket hang up"));
    const i = inter([]);
    await handleGiveawayEnter(i, "g1");
    const text = String(i.editReply.mock.calls.at(-1)[0]);
    expect(text).not.toContain("socket hang up");
    expect(text).toBe(t("giveaway.error", "bg"));
  });
});

describe("А4 — проверка на членство за тегленето", () => {
  it("presentMembers пита Discord само за подадените id-та и връща присъстващите", async () => {
    const { presentMembers } = await import("../utils/giveawayMembers.js");
    const [a, b, c] = ["111111111111111111", "222222222222222222", "333333333333333333"];
    const fetch = vi.fn(async () => new Map([[a, {}], [c, {}]]));
    const r = await presentMembers({ members: { fetch } }, [a, b, c]);
    expect(fetch).toHaveBeenCalledWith({ user: [a, b, c] });
    expect(r).toEqual([a, c]);
  });
  it("над 100 id-та се реже; невалидни се изхвърлят", async () => {
    const { presentMembers } = await import("../utils/giveawayMembers.js");
    const ids = Array.from({ length: 150 }, (_, i) => String(100000000000000000n + BigInt(i)));
    const fetch = vi.fn(async () => new Map());
    await presentMembers({ members: { fetch } }, [...ids, "not-an-id", { x: 1 }]);
    expect(fetch.mock.calls[0][0].user).toHaveLength(100);
  });
  it("срив на Discord → null (викащият е fail-open, както botMembership)", async () => {
    const { presentMembers } = await import("../utils/giveawayMembers.js");
    expect(await presentMembers({ members: { fetch: vi.fn(async () => { throw new Error("x"); }) } }, ["111111111111111111"])).toBeNull();
  });
});
