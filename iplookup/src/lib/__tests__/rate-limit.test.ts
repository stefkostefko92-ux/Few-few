import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "../rate-limit";

test("пропуска до лимита и спира след него", () => {
  const limiter = new RateLimiter(3, 60_000);
  const now = 1_000_000;
  assert.equal(limiter.check("a", now).allowed, true);
  assert.equal(limiter.check("a", now).allowed, true);
  const third = limiter.check("a", now);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  assert.equal(limiter.check("a", now).allowed, false);
});

test("ключовете са независими", () => {
  const limiter = new RateLimiter(1, 60_000);
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("b", 0).allowed, true, "чужд ключ не се влияе");
  assert.equal(limiter.check("a", 0).allowed, false);
});

test("прозорецът се плъзга — старите заявки излизат", () => {
  const limiter = new RateLimiter(2, 60_000);
  limiter.check("a", 0);
  limiter.check("a", 30_000);
  assert.equal(limiter.check("a", 40_000).allowed, false);
  // Първата излиза от прозореца точно след 60 s.
  assert.equal(limiter.check("a", 60_001).allowed, true);
});

test("retryAfter сочи кога излиза НАЙ-СТАРАТА заявка", () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.check("a", 0);
  const denied = limiter.check("a", 10_000);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 50);
});

test("retryAfter никога не е нула при отказ", () => {
  const limiter = new RateLimiter(1, 1000);
  limiter.check("a", 0);
  const denied = limiter.check("a", 999);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1, "иначе клиентът би опитал веднага в цикъл");
});

test("reset изчиства броенето", () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.check("a", 0);
  limiter.reset();
  assert.equal(limiter.check("a", 0).allowed, true);
});
