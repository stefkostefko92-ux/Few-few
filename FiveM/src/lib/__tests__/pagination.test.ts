import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAGE_SIZE, pageHref, pageWindow, paginate, parsePage } from '../pagination';

test('?page= приема само цяло положително число', () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage('3'), 3);
  for (const bad of ['0', '-1', '1.5', 'abc', '99999', '__proto__', '']) assert.equal(parsePage(bad), 1, bad);
  assert.equal(parsePage(['2', '5']), 2);
});

test('страниците покриват ВСИЧКИ елементи, всеки точно веднъж', () => {
  const all = Array.from({ length: 130 }, (_, i) => i);
  const seen: number[] = [];
  const { pages } = paginate(all, 1);
  assert.equal(pages, Math.ceil(130 / PAGE_SIZE));
  for (let p = 1; p <= pages; p += 1) seen.push(...paginate(all, p).items);
  assert.deepEqual(seen, all);
  assert.equal(paginate(all, 2).offset, PAGE_SIZE);
});

test('страница след последната е извън обхвата (404), празен списък е една страница', () => {
  assert.equal(paginate([1, 2, 3], 2).outOfRange, true);
  assert.equal(paginate([], 1).outOfRange, false);
  assert.equal(paginate([], 1).pages, 1);
});

test('прозорецът от номера: първа, последна, съседите и „…“', () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(6, 16), [1, null, 5, 6, 7, null, 16]);
  assert.deepEqual(pageWindow(16, 16), [1, null, 15, 16]);
});

test('първата страница е без ?page=1 — един адрес за едно съдържание', () => {
  assert.equal(pageHref('/bg/servers', 1), '/bg/servers');
  assert.equal(pageHref('/bg/servers', 2), '/bg/servers?page=2');
  assert.equal(pageHref('/bg/servers', 3, { q: 'nova rp', sort: undefined }), '/bg/servers?q=nova+rp&page=3');
});
