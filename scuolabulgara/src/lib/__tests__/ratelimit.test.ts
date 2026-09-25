import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimit, clientIp } from "../ratelimit";

// Поведение, не имплементация: колко минават, кога блокира, кога забравя.
describe("ratelimit — прозорец и отзоваване", () => {
  afterEach(() => vi.useRealTimers());

  it("пуска до лимита и блокира на него", () => {
    const l = createRateLimit({ windowMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i++) {
      expect(l.isLimited("1.2.3.4")).toBe(false);
      l.record("1.2.3.4");
    }
    expect(l.isLimited("1.2.3.4")).toBe(true);
  });

  it("брои всеки ключ поотделно", () => {
    const l = createRateLimit({ windowMs: 60_000, max: 1 });
    l.record("1.1.1.1");
    expect(l.isLimited("1.1.1.1")).toBe(true);
    expect(l.isLimited("2.2.2.2")).toBe(false);
  });

  it("reset изчиства ключа (успешен вход)", () => {
    const l = createRateLimit({ windowMs: 60_000, max: 1 });
    l.record("1.1.1.1");
    expect(l.isLimited("1.1.1.1")).toBe(true);
    l.reset("1.1.1.1");
    expect(l.isLimited("1.1.1.1")).toBe(false);
  });

  it("забравя след изтичане на прозореца", () => {
    vi.useFakeTimers();
    const l = createRateLimit({ windowMs: 10_000, max: 1 });
    l.record("1.1.1.1");
    expect(l.isLimited("1.1.1.1")).toBe(true);
    vi.advanceTimersByTime(10_001);
    expect(l.isLimited("1.1.1.1")).toBe(false);
  });
});

describe("clientIp — не се доверява на подменим хедър", () => {
  const req = (h: Record<string, string>) =>
    ({ headers: new Headers(h) }) as unknown as Parameters<typeof clientIp>[0];

  it("предпочита X-Real-IP (nginx го задава от $remote_addr)", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 8.8.8.8" }))).toBe("9.9.9.9");
  });

  it("без X-Real-IP взима ПОСЛЕДНИЯ hop, не подменимия пръв елемент", () => {
    expect(clientIp(req({ "x-forwarded-for": "evil-spoofed, 8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("без никакви хедъри връща 'unknown', не хвърля", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
