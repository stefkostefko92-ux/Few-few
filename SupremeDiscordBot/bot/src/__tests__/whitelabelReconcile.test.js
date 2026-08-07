// bot/src/__tests__/whitelabelReconcile.test.js
// Реконсилиацията на бранд ботовете — сърцето на поправката за „махане от seat“.
//
// Дупката, за която пита собственикът: сървър, свален от agency seat (или отменен/
// refund/дунинг), пазеше customBotToken → бранд ботът продължаваше да работи до
// рестарт, обслужвайки сървър, който вече не плаща. `/bot/servers/with-custom-tokens`
// е единственият източник на истина за „кой има право СЕГА“; reconcile привежда
// работещото множество към него.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокваме HTTP слоя към backend-а — той връща имащите право сървъри.
const apiGet = vi.fn();
vi.mock("../utils/api.js", () => ({ default: { get: (...a) => apiGet(...a) } }));

const { reconcileCustomClients, customClients } = await import("../services/clientManager.js");

function fakeClient() {
  return { isReady: () => true, destroy: vi.fn(async () => {}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  customClients.clear();
});

describe("reconcileCustomClients", () => {
  it("сваля работещ клиент, който вече НЯМА право (свален от seat)", async () => {
    apiGet.mockResolvedValue({ data: [{ id: "keep" }] }); // само „keep“ има право
    const keep = fakeClient();
    const drop = fakeClient();
    customClients.set("keep", keep);
    customClients.set("drop", drop); // вече не е в списъка → трябва да слезе

    const res = await reconcileCustomClients({});

    expect(res.shutDown).toBe(1);
    expect(drop.destroy).toHaveBeenCalled();
    expect(customClients.has("drop")).toBe(false);
    // Имащият право не се пипа.
    expect(keep.destroy).not.toHaveBeenCalled();
    expect(customClients.has("keep")).toBe(true);
  });

  it("НЕ вдига вече работещ имащ право (нула излишни boot-ове)", async () => {
    apiGet.mockResolvedValue({ data: [{ id: "keep" }] });
    customClients.set("keep", fakeClient());

    const res = await reconcileCustomClients({});

    expect(res.booted).toBe(0);
    expect(res.shutDown).toBe(0);
  });

  it("FAIL-CLOSED: при недостъпен backend НЕ сваля живи клиенти", async () => {
    // Мрежов трепет не бива да събори всички бранд ботове — по-добре надживял
    // клиент, отколкото сляпо „нула права“.
    apiGet.mockRejectedValue(new Error("ECONNREFUSED"));
    const live = fakeClient();
    customClients.set("live", live);

    const res = await reconcileCustomClients({});

    expect(res.skipped).toBe(true);
    expect(live.destroy).not.toHaveBeenCalled();
    expect(customClients.has("live")).toBe(true);
  });

  it("празен списък сваля ВСИЧКИ (агенцията е приключила изцяло)", async () => {
    apiGet.mockResolvedValue({ data: [] });
    const a = fakeClient();
    const b = fakeClient();
    customClients.set("a", a);
    customClients.set("b", b);

    const res = await reconcileCustomClients({});

    expect(res.shutDown).toBe(2);
    expect(customClients.size).toBe(0);
  });
});
