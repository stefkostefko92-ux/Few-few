import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@aso/shared";

vi.mock("./api", () => ({
  api: { equippedCosmetics: vi.fn(async () => ({ equipped: ["felt_gold"] })) },
}));
vi.mock("./socket", () => ({ disconnectSocket: vi.fn() }));

const { afterLogin, afterLogout } = await import("./session");
const { disconnectSocket } = await import("./socket");
const { useAuthStore, useCosmeticsStore, useLobbyStore, useMatchStore } = await import("./store");

const user = { id: "u1", displayName: "Тестер" } as PublicUser;

afterEach(() => vi.clearAllMocks());

describe("session — общ път след вход / след изход", () => {
  it("afterLogin записва потребителя и зарежда облеклите облици (и след вход с парола)", async () => {
    await afterLogin(user);
    expect(useAuthStore.getState().user?.id).toBe("u1");
    expect(useCosmeticsStore.getState().equipped).toEqual(["felt_gold"]);
  });

  it("afterLogout нулира облици, стая, мач, сокет и потребител", () => {
    useAuthStore.getState().setUser(user);
    useCosmeticsStore.getState().setEquipped(["felt_gold"]);
    useLobbyStore.getState().setLobby({ id: "lobby1" } as never);
    useMatchStore.getState().setMatch({ matchId: "m1", seat: 1, players: [], game: "CHESS" });

    afterLogout();

    expect(disconnectSocket).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useCosmeticsStore.getState().equipped).toEqual([]);
    expect(useLobbyStore.getState().lobby).toBeNull();
    expect(useMatchStore.getState().matchId).toBeNull();
  });
});
