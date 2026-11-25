import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeNext } from '../src/routes/app-legal.js';

/**
 * Къде води „Приеми“ на актуалните условия (SPEC 92): само адрес в приложението, никога към друг сайт и
 * никога извън `/app` след нормализиране от браузъра (Качествения и Разбивача, 25.11.2026).
 */
test('адресите в приложението минават без промяна', () => {
  for (const ok of ['/app', '/app/', '/app/o/abc/nov', '/app/o/abc?q=1#x', '/app?x=1']) {
    assert.equal(safeNext(ok), ok, ok);
  }
});

test('всичко друго води към /app', () => {
  const bad: unknown[] = [
    undefined,
    null,
    42,
    ['/app/o/abc'],
    '',
    '/',
    '/admin',
    '/appx',
    '/app\\evil',
    '//evil.example/app',
    'https://evil.example/app',
    '/app//evil.example',
    '/app/../admin',
    '/app/%2e%2e/admin',
    '/app/%2E%2E',
    '/app/o\r\nSet-Cookie: x=1',
    '/app/o\u0000',
    '/app/o\tx',
    '/app/usloviya',
    '/app/usloviya?next=/app',
    `/app/${'a'.repeat(1001)}`,
  ];
  for (const value of bad) assert.equal(safeNext(value), '/app', JSON.stringify(value));
});
