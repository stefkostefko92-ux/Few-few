// bot/src/__tests__/sessionStore.test.js
// Tests the sessionStore in-memory fallback (no Redis required)
import { describe, it, expect, beforeEach } from "vitest";

// Force no Redis for tests
process.env.REDIS_URL = "";

const { sessionStore } = await import("../utils/sessionStore.js");

const KEY = "test:session:1";

describe("sessionStore (in-memory fallback)", () => {
  beforeEach(async () => {
    await sessionStore.delete(KEY);
  });

  it("returns null for missing key", async () => {
    const result = await sessionStore.get(KEY);
    expect(result).toBeNull();
  });

  it("stores and retrieves a session", async () => {
    const session = { userId: "123", currentIndex: 0, answers: {} };
    await sessionStore.set(KEY, session);
    const retrieved = await sessionStore.get(KEY);
    expect(retrieved).toEqual(session);
  });

  it("has() returns false before set", async () => {
    expect(await sessionStore.has(KEY)).toBe(false);
  });

  it("has() returns true after set", async () => {
    await sessionStore.set(KEY, { test: true });
    expect(await sessionStore.has(KEY)).toBe(true);
  });

  it("delete() removes the session", async () => {
    await sessionStore.set(KEY, { test: true });
    await sessionStore.delete(KEY);
    expect(await sessionStore.has(KEY)).toBe(false);
  });

  it("stores complex session objects correctly", async () => {
    const complex = {
      form: { id: "form1", name: "Staff Application", questions: [] },
      panel: { id: "panel1", supportRoleIds: ["role1"] },
      currentIndex: 2,
      answers: { q1: "John", q2: "18", q3: "Yes" },
      userId: "user123",
      guildId: "guild456",
    };
    await sessionStore.set(KEY, complex);
    const result = await sessionStore.get(KEY);
    expect(result.answers.q1).toBe("John");
    expect(result.currentIndex).toBe(2);
    expect(result.form.name).toBe("Staff Application");
  });
});
