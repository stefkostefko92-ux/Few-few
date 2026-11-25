// bot/src/__tests__/tenantScopeCalls.test.js
// Командите, които приемат СВОБОДНО въведен id (автодовършването е само
// подсказка — човек може да напише чужд id), винаги подават serverId на
// сървъра, от който идват. Backend-ът търси по (id, serverId) и без serverId
// връща 400 (виж backend/src/__tests__/botTenantScope.test.js).
// Червен екип, 10.10.2026: `/giveaway end|reroll` и `/panel spawn` подаваха
// само id → томбола/панел на ЧУЖД сървър.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
vi.mock("../utils/api.js", async (orig) => {
  const api = { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a), patch: (...a) => apiPatch(...a), delete: vi.fn() };
  return {
    default: api,
    getPanel: async (panelId, { withSiblings = false, serverId } = {}) => (await apiGet(`/bot/panel/${panelId}`, { params: { serverId, ...(withSiblings ? { siblings: "1" } : {}) } })).data,
    markPanelSpawned: async (panelId, channelId, messageId, serverId) => (await apiPatch(`/bot/panel/${panelId}/spawned`, { serverId, channelId, messageId })).data,
  };
});

const giveaway = (await import("../commands/giveaway.js")).default;
const panel = (await import("../commands/panel.js")).default;

const GID = "222222222222222222";
const ix = (sub, strings = {}) => ({
  guildId: GID, channelId: "500000000000000001", locale: "en",
  user: { id: "333333333333333333", username: "u" },
  member: { permissions: { has: () => true } },
  deferReply: vi.fn(), editReply: vi.fn(async () => ({ id: "600000000000000001" })), reply: vi.fn(),
  channel: { send: vi.fn(async () => ({ id: "600000000000000002" })) },
  options: { getSubcommand: () => sub, getString: (k) => strings[k] ?? null, getInteger: () => null },
});

beforeEach(() => { vi.clearAllMocks(); });

describe("свободно въведен id → винаги със serverId", () => {
  it("/giveaway end и reroll", async () => {
    for (const sub of ["end", "reroll"]) {
      apiPost.mockResolvedValueOnce({ data: { winners: [] } });
      await giveaway.execute(ix(sub, { giveaway_id: "gw_someone_elses" }));
      expect(apiPost).toHaveBeenLastCalledWith(`/bot/giveaway/gw_someone_elses/${sub}`, expect.objectContaining({ serverId: GID }));
    }
  });

  it("/panel spawn: и четенето, и записът на публикацията", async () => {
    apiGet.mockResolvedValueOnce({ data: { id: "pnl_x", name: "Support", title: "Support", description: "Open a ticket", buttonStyle: "BUTTON", buttons: [{ id: "b1", label: "Open", style: "PRIMARY" }] } });
    apiPatch.mockResolvedValueOnce({ data: { ok: true } });
    await panel.execute(ix("spawn", { name: "pnl_x" }));
    expect(apiGet).toHaveBeenCalledWith("/bot/panel/pnl_x", { params: expect.objectContaining({ serverId: GID }) });
    expect(apiPatch).toHaveBeenCalledWith("/bot/panel/pnl_x/spawned", expect.objectContaining({ serverId: GID }));
  });
});
