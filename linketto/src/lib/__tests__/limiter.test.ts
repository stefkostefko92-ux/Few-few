import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited, pickClientIp, rateLimit, rateLimitKeyCount, resetRateLimits } from '../limiter';

test('rateLimit: пуска до max в прозореца, после отказва', () => {
  resetRateLimits();
  assert.equal(rateLimit('a', 2, 1000, 0), true);
  assert.equal(rateLimit('a', 2, 1000, 1), true);
  assert.equal(rateLimit('a', 2, 1000, 2), false);
});

test('rateLimit: различните ключове не си пречат', () => {
  resetRateLimits();
  assert.equal(rateLimit('x', 1, 1000, 0), true);
  assert.equal(rateLimit('x', 1, 1000, 1), false);
  assert.equal(rateLimit('y', 1, 1000, 1), true);
});

test('rateLimit: след прозореца отново пуска (инжектирано време)', () => {
  resetRateLimits();
  assert.equal(rateLimit('w', 1, 30, 0), true);
  assert.equal(rateLimit('w', 1, 30, 10), false);
  assert.equal(rateLimit('w', 1, 30, 31), true);
});

test('чистенето не изтрива кофи с по-дълъг прозорец (смесени прозорци)', () => {
  resetRateLimits();
  const HOUR = 60 * 60_000;
  const TEN_MIN = 10 * 60_000;
  // Анкета: 1 глас в t=0 с 1-часов прозорец — на 30-ата минута още е в сила.
  assert.equal(rateLimit('poll:1', 1, HOUR, 0), true);
  // 9 999 входа в t=1 (с poll — точно на лимита от 10 000 кофи), с 10-минутен прозорец → на 30-ата минута са изтекли.
  for (let i = 0; i < 9_999; i++) rateLimit(`login:${i}`, 5, TEN_MIN, 1);
  // Една заявка на 30-ата минута задейства чистенето (кофите са над лимита).
  const now = 30 * 60_000;
  assert.equal(rateLimit('trigger', 1, TEN_MIN, now), true);
  assert.ok(rateLimitKeyCount() < 100, 'изтеклите 10-минутни кофи се чистят');
  // Анкетният глас от t=0 още се брои → втори глас се отказва.
  assert.equal(rateLimit('poll:1', 1, HOUR, now), false);
});

// Правен преглед 2026-11-14: политиката обещава „IP за лимита — до 1 час в
// паметта“ → изтеклите кофи се чистят периодично, не само при препълване.
test('rateLimit: изтеклите кофи се чистят периодично и при малко ключове', () => {
  resetRateLimits();
  const HOUR = 60 * 60_000;
  assert.equal(rateLimit('bio-tool:1.2.3.4', 5, HOUR, 0), true);
  assert.equal(rateLimitKeyCount(), 1);
  // друга заявка след изтичане на прозореца → старият IP изчезва
  assert.equal(rateLimit('handle:5.6.7.8', 40, 60_000, HOUR + 61_000), true);
  assert.equal(rateLimitKeyCount(), 1);
});

test('pickClientIp: Cloudflare първи, после X-Real-IP, после последния XFF', () => {
  const h = (map: Record<string, string>) => (name: string) => map[name] ?? null;
  assert.equal(pickClientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '173.245.48.1' })), '9.9.9.9');
  assert.equal(pickClientIp(h({ 'x-real-ip': ' 1.1.1.1 ' })), '1.1.1.1');
  assert.equal(pickClientIp(h({ 'x-forwarded-for': 'spoofed, 2.2.2.2' })), '2.2.2.2');
  assert.equal(pickClientIp(h({})), 'unknown');
});

test('isRateLimited: само поглежда, не брои', () => {
  resetRateLimits();
  assert.equal(isRateLimited('k', 2, 1000, 0), false);
  rateLimit('k', 2, 1000, 0);
  rateLimit('k', 2, 1000, 1);
  assert.equal(isRateLimited('k', 2, 1000, 2), true);
  assert.equal(isRateLimited('k', 2, 1000, 1001), false); // първият удар изтече
});

import { ipBucket, isCriticalKey } from '../limiter';

// Червен екип (блокер): наводняване с 10 001 ключа от публичен endpoint
// (анкета с произволен linkId) нулираше лимита на входа и общия AI таван.
test('наводняване с некритични ключове НЕ нулира критичните (вход, общ таван)', () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let i = 0; i < 10; i += 1) rateLimit('login-ip:1.2.3.4', 10, 10 * 60_000, now);
  assert.equal(rateLimit('login-ip:1.2.3.4', 10, 10 * 60_000, now), false);
  for (let i = 0; i < 500; i += 1) rateLimit('bio-tool:global', 500, 24 * 60 * 60_000, now);
  for (let i = 0; i < 10_001; i += 1) rateLimit(`poll:fake-${i}:9.9.9.9`, 3, 60 * 60_000, now);
  assert.equal(rateLimit('login-ip:1.2.3.4', 10, 10 * 60_000, now), false);
  assert.equal(rateLimit('bio-tool:global', 500, 24 * 60 * 60_000, now), false);
  assert.ok(rateLimitKeyCount() <= 10_000 + 2);
});

test('isCriticalKey: вход, регистрация, 2FA и общите тавани', () => {
  assert.equal(isCriticalKey('login-email:a@b.c'), true);
  assert.equal(isCriticalKey('register-ip:1.2.3.4'), true);
  assert.equal(isCriticalKey('mfa:user1'), true);
  assert.equal(isCriticalKey('ai:global'), true);
  assert.equal(isCriticalKey('poll:x:1.2.3.4'), false);
});

test('ipBucket: IPv4 цял, IPv6 по /64, IPv4-mapped → IPv4', () => {
  assert.equal(ipBucket('93.62.1.1'), '93.62.1.1');
  assert.equal(ipBucket('2a01:4f8:c0c:1234:aaaa:bbbb:cccc:dddd'), '2a01:4f8:c0c:1234::/64');
  assert.equal(ipBucket('2a01:4f8:c0c:1234::1'), '2a01:4f8:c0c:1234::/64');
  assert.equal(ipBucket('2a01:04f8::1'), '2a01:4f8:0:0::/64');
  assert.equal(ipBucket('::ffff:10.0.0.1'), '10.0.0.1');
  assert.equal(ipBucket('unknown'), 'unknown');
});
