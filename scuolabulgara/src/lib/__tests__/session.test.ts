import { describe, it, expect, beforeEach } from "vitest";
import { createSession, verifySession, SESSION_COOKIE } from "../session";

// Поведение на сесията от гледна точка на admin guard-а в proxy.ts:
// валиден токен -> сесия; липсващ/счупен/чужд-подписан токен -> null (редирект към login).
describe("session — издаване и проверка на admin JWT", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "a".repeat(32); // детерминистичен, достатъчно дълъг секрет за теста
  });

  it("валиден подписан токен се верифицира и носи email-а", async () => {
    const token = await createSession("admin@quibulgaria.it");
    const session = await verifySession(token);
    expect(session?.email).toBe("admin@quibulgaria.it");
  });

  it("verifySession(undefined) -> null (няма cookie)", async () => {
    expect(await verifySession(undefined)).toBeNull();
  });

  it("подправен/случаен низ -> null, не хвърля грешка", async () => {
    expect(await verifySession("not-a-jwt-at-all")).toBeNull();
  });

  it("токен подписан с ДРУГ секрет се отхвърля (сесиите не се ползват кръстосано)", async () => {
    const token = await createSession("admin@quibulgaria.it");
    process.env.AUTH_SECRET = "b".repeat(32); // смяна на секрета симулира чужд подпис
    expect(await verifySession(token)).toBeNull();
  });

  it("SESSION_COOKIE е стабилно име на cookie-то, което proxy.ts/auth.ts ползват", () => {
    expect(SESSION_COOKIE).toBe("qb_admin");
  });
});
