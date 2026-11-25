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

  it("fail-closed: без exp, без sub, с чужда роля или празен sub → отказ", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { verifyHandshake } = await import("./auth.js");
    const sign = (claims: object, opts: jwt.SignOptions = { expiresIn: 60 }) =>
      `aso_at=${jwt.sign(claims, process.env.JWT_SECRET!, opts)}`;
    expect(verifyHandshake(sign({ sub: "u1", role: "PLAYER", locale: "bg" }))?.exp).toBeGreaterThan(0);
    expect(verifyHandshake(sign({ sub: "u1", role: "PLAYER", locale: "bg" }, {}))).toBeNull(); // без exp
    expect(verifyHandshake(sign({ role: "PLAYER", locale: "bg" }))).toBeNull(); // без sub
    expect(verifyHandshake(sign({ sub: "", role: "PLAYER", locale: "bg" }))).toBeNull();
    expect(verifyHandshake(sign({ sub: "u1", role: "SUPERUSER", locale: "bg" }))).toBeNull();
    expect(verifyHandshake(sign({ sub: "u1", locale: "bg" }))).toBeNull(); // без роля
    expect(verifyHandshake(sign({ sub: 7, role: "PLAYER" }))).toBeNull();
  });

  it("scheduleExpiryDisconnect: в exp НЕ прекъсва активен играч — пуска reauth; прекъсва само при отнет достъп", async () => {
    const { vi } = await import("vitest");
    const { scheduleExpiryDisconnect } = await import("./auth.js");
    vi.useFakeTimers();
    try {
      const mk = () => {
        const handlers: Array<() => void> = [];
        return {
          disconnect: vi.fn(),
          emit: vi.fn(),
          once: (_ev: "disconnect", cb: () => void) => void handlers.push(cb),
          fire: () => handlers.forEach((h) => h()),
        };
      };
      const now = Date.now();

      // 1) достъпът още е валиден → без disconnect (иначе ботът замества активния играч), reauth към клиента
      const a = mk();
      const okCheck = vi.fn(async () => "ok" as const);
      scheduleExpiryDisconnect(a, now / 1000 + 10, okCheck, { now, recheckMs: 5_000 });
      await vi.advanceTimersByTimeAsync(9_900);
      expect(okCheck).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(okCheck).toHaveBeenCalledTimes(1);
      expect(a.disconnect).not.toHaveBeenCalled();
      expect(a.emit).toHaveBeenCalledWith("auth:reauth");
      // повторна проверка на всеки recheckMs, докато сокетът е жив
      await vi.advanceTimersByTimeAsync(5_000);
      expect(okCheck).toHaveBeenCalledTimes(2);
      expect(a.disconnect).not.toHaveBeenCalled();

      // 2) достъпът е отнет (бан/revoked/изтрит) → прекъсване
      const c = mk();
      scheduleExpiryDisconnect(c, now / 1000 + 10, async () => "denied", { now });
      await vi.advanceTimersByTimeAsync(10_100);
      expect(c.disconnect).toHaveBeenCalledWith(true);

      // 3) инфраструктурна грешка при проверката → не изгонвай играча
      const d = mk();
      scheduleExpiryDisconnect(
        d,
        now / 1000 + 10,
        async () => {
          throw new Error("redis down");
        },
        { now },
      );
      await vi.advanceTimersByTimeAsync(10_100);
      expect(d.disconnect).not.toHaveBeenCalled();

      // 4) затворен сокет → таймерът се отменя, проверка не се прави
      const e = mk();
      const neverCheck = vi.fn(async () => "ok" as const);
      scheduleExpiryDisconnect(e, now / 1000 + 10, neverCheck, { now });
      e.fire();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(neverCheck).not.toHaveBeenCalled();
      expect(e.emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
