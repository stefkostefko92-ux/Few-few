import { afterEach, describe, expect, it, vi } from "vitest";
import { registerE2EHook, type E2EBoardHook } from "./e2eHook";

const hook: E2EBoardHook = { screenPoint: () => ({ x: 1, y: 2 }), view: () => ({ ok: true }) };
type Host = { __asoE2E?: Record<string, E2EBoardHook> };

afterEach(() => vi.unstubAllGlobals());

describe("registerE2EHook (тестова кука само под автоматизация)", () => {
  it("за обикновен играч (navigator.webdriver ≠ true) не оставя нищо в window", () => {
    const win: Host = {};
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { webdriver: false });
    const off = registerE2EHook("draughts", hook);
    expect(win.__asoE2E).toBeUndefined();
    off();
  });

  it("под WebDriver регистрира куката и я маха при демонтиране", () => {
    const win: Host = {};
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { webdriver: true });
    const off = registerE2EHook("draughts", hook);
    expect(win.__asoE2E?.draughts).toBe(hook);
    off();
    expect(win.__asoE2E?.draughts).toBeUndefined();
  });

  it("махането на стара кука не трие новата (бърз повторен монтаж)", () => {
    const win: Host = {};
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { webdriver: true });
    const offOld = registerE2EHook("ludo", hook);
    const fresh: E2EBoardHook = { screenPoint: () => null, view: () => null };
    const offNew = registerE2EHook("ludo", fresh);
    offOld();
    expect(win.__asoE2E?.ludo).toBe(fresh);
    offNew();
  });
});
