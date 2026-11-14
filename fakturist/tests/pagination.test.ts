import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';
import {
  afterDate,
  afterText,
  pageOf,
  pagerLinks,
  readCursor,
  writeCursor,
} from '../src/http/pagination.js';
import { centsDecimal, money } from '../src/http/view.js';
import { paymentBadge, readDocumentFilter } from '../src/documents/list.js';

const ID = 'clxyz0000000000000000001';

test('курсорът: двупосочен; всичко чуждо е първа страница', () => {
  const cursor = writeCursor('1731542400000', ID);
  assert.deepEqual(readCursor(cursor), { key: '1731542400000', id: ID });
  for (const bad of [
    undefined,
    '',
    'не-е-base64',
    Buffer.from('[1,2]').toString('base64url'),
    Buffer.from(JSON.stringify(['x', 'DROP TABLE'])).toString('base64url'),
    'a'.repeat(900),
    ['масив'],
  ]) {
    assert.equal(readCursor(bad), null, String(bad));
  }
});

test('afterDate/afterText: (поле < ключ) ИЛИ (поле = ключ И id < id) — и обратно при asc', () => {
  const at = new Date('2026-11-14T10:00:00.000Z');
  const where = afterDate('createdAt', { key: String(at.getTime()), id: ID }, 'desc');
  assert.deepEqual(where, {
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: ID } }],
  });
  assert.deepEqual(afterDate('createdAt', { key: 'не-е-число', id: ID }, 'desc'), {});
  assert.deepEqual(afterDate('createdAt', null, 'desc'), {});
  assert.deepEqual(afterText('name', { key: 'Б', id: ID }, 'asc'), {
    OR: [{ name: { gt: 'Б' } }, { name: 'Б', id: { gt: ID } }],
  });
});

test('pageOf: излишният ред значи „има още“, курсорът е последният показан', () => {
  const rows = [1, 2, 3].map((n) => ({ id: `${ID.slice(0, -1)}${n}`, at: new Date(n * 1000) }));
  const page = pageOf(rows, 2, (row) => row.at);
  assert.equal(page.items.length, 2);
  assert.deepEqual(readCursor(page.next), { key: '2000', id: rows[1]!.id });
  assert.equal(pageOf(rows, 3, (row) => row.at).next, null);
});

test('pagerLinks: пази филтрите и чуждия курсор, сменя само своя', () => {
  const cursor = writeCursor('1000', ID);
  const req = {
    query: { q: 'Роза', vid: '380', predi: cursor, chuzhd: 'x' },
  } as unknown as Request;
  const links = pagerLinks(req, '/app/o/x', 'predi', ['q', 'vid', 'predi'], 'NEXT');
  assert.equal(links.next, '/app/o/x?q=%D0%A0%D0%BE%D0%B7%D0%B0&vid=380&predi=NEXT');
  assert.equal(links.first, '/app/o/x?q=%D0%A0%D0%BE%D0%B7%D0%B0&vid=380');
  const fresh = pagerLinks({ query: {} } as unknown as Request, '/p', 'predi', [], null);
  assert.deepEqual(fresh, { next: null, first: null });
});

test('сумите за показ — точни, и над 2^53 центa', () => {
  assert.equal(centsDecimal(150n), '1.50');
  assert.equal(centsDecimal(-5n), '-0.05');
  assert.equal(centsDecimal(9_007_199_254_740_993n), '90071992547409.93');
  assert.equal(money(9_007_199_254_740_993n, 'EUR', 'en'), '€90,071,992,547,409.93');
  assert.match(money(1234567n, 'EUR', 'bg'), /^12\s345,67\s€$/);
});

test('филтрите на документите: само затворени списъци и истински дати', () => {
  const filter = readDocumentFilter({
    q: '  Роза  ',
    vid: '999',
    sastoyanie: 'CANCELLED',
    plashtane: 'prosrocheni',
    ot: '2026-02-30',
    do: '2026-11-14',
  });
  assert.deepEqual(filter, {
    q: 'Роза',
    type: '',
    status: 'CANCELLED',
    payment: 'prosrocheni',
    from: '',
    to: '2026-11-14',
  });
});

test('етикетът „Плащане“: просрочен по софийската дата; известие и анулиран — без етикет', () => {
  const base = {
    status: 'ISSUED',
    typeCode: '380',
    payableCents: 100n,
    paymentState: 'UNPAID',
    dueDate: new Date('2026-11-13T00:00:00Z'),
  };
  assert.equal(paymentBadge(base, '2026-11-14'), 'overdue');
  assert.equal(paymentBadge(base, '2026-11-13'), 'UNPAID');
  assert.equal(paymentBadge({ ...base, paymentState: 'PAID' }, '2026-11-14'), 'PAID');
  assert.equal(paymentBadge({ ...base, typeCode: '381' }, '2026-11-14'), null);
  assert.equal(paymentBadge({ ...base, status: 'CANCELLED' }, '2026-11-14'), null);
});
