// The level of the log line of a request (the audit of 12 November 2026): a server error must be an error line —
// with everything on "info" nothing could tell a failing portal from a quiet one. A stopped request (rate limit,
// body too large) is a warning; everything else, refusals included, is ordinary.
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';
import { httpLogOptions } from '../src/logger.js';

const livello = (statusCode: number, err?: Error) =>
  httpLogOptions.customLogLevel({} as IncomingMessage, { statusCode } as ServerResponse, err);

describe('the log line of a request', () => {
  it('is an error for 5xx and for a thrown error, a warning when stopped, info otherwise', () => {
    for (const s of [500, 502, 503]) assert.equal(livello(s), 'error', String(s));
    assert.equal(livello(200, new Error('socket')), 'error');
    for (const s of [429, 413]) assert.equal(livello(s), 'warn', String(s));
    for (const s of [200, 303, 401, 403, 404, 409, 422])
      assert.equal(livello(s), 'info', String(s));
  });
});
