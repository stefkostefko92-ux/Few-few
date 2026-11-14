// bot/src/__tests__/giveawayServerScope.test.js
// /giveaway end|reroll трябва да праща serverId (interaction.guildId) към
// backend-а, който скоупва по него (cross-tenant IDOR). Поведенчески тест.
import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { post: (...a) => post(...a), get: vi.fn(), patch: vi.fn() } }));

const { default: giveaway } = await import("../commands/giveaway.js");

function fakeInteraction(sub) {
  return {
    guildId: "guild-A",
    user: { id: "actor-1" },
    member: { permissions: { has: () => true } },
    options: {
      getSubcommand: () => sub,
      getString: (n) => (n === "giveaway_id" ? "gid-1" : null),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: { winners: ["u1"] } }); });

for (const sub of ["end", "reroll"]) {
  describe(`/giveaway ${sub}`, () => {
    it("праща serverId = interaction.guildId към правилния endpoint", async () => {
      await giveaway.execute(fakeInteraction(sub));
      expect(post).toHaveBeenCalledWith(
        `/bot/giveaway/gid-1/${sub}`,
        expect.objectContaining({ serverId: "guild-A", actorId: "actor-1" }),
      );
    });
  });
}
