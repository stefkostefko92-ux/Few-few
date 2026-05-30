import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://aso:aso@localhost:5437/aso?schema=public";
  process.env.REDIS_URL ??= "redis://localhost:6383";
  process.env.JWT_SECRET ??= "test-access-secret-that-is-long-enough-1234567890";
});

describe("realtime handshake auth", () => {
  it("accepts a valid access cookie and rejects bad/missing ones", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { verifyHandshake } = await import("./auth.js");

    const token = jwt.sign(
      { sub: "u1", role: "PLAYER", locale: "bg" },
      process.env.JWT_SECRET!,
      { expiresIn: 60 },
    );

    const ok = verifyHandshake(`aso_at=${token}; other=1`);
    expect(ok?.sub).toBe("u1");

    expect(verifyHandshake(undefined)).toBeNull();
    expect(verifyHandshake("aso_at=garbage")).toBeNull();
    expect(verifyHandshake("nocookie=1")).toBeNull();
  });
});
