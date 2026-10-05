import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { isUniqueViolation } from '../src/services/admin-common.js';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

test('a unique-key race (P2002) is told apart from every other database error', () => {
  assert.equal(isUniqueViolation(known('P2002')), true);
  assert.equal(isUniqueViolation(known('P2025')), false);
  assert.equal(isUniqueViolation(new Error('P2002')), false);
  assert.equal(isUniqueViolation({ code: 'P2002' }), false);
  assert.equal(isUniqueViolation(null), false);
});
