// The check of a form POSTed to a route handler (src/lib/same-origin.ts): only the application's own pages, as Next.js
// checks its server actions — the Origin's host against X-Forwarded-Host or Host, Sec-Fetch-Site same-origin.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sameOriginPost } from '@/lib/same-origin';

const h = (o: Record<string, string>): Headers => new Headers(o);

describe('sameOriginPost', () => {
  it('passes a POST from a page of the application (Host, or the proxy\'s X-Forwarded-Host)', () => {
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'https://liftpilot.example', 'sec-fetch-site': 'same-origin' })), true);
    assert.equal(sameOriginPost(h({ host: '127.0.0.1:3000', 'x-forwarded-host': 'liftpilot.example', origin: 'https://liftpilot.example' })), true);
    assert.equal(sameOriginPost(h({ host: 'localhost:3252', origin: 'http://localhost:3252' })), true);
  });

  it('refuses another site, a sandboxed frame, a malformed Origin and a cross-site fetch', () => {
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'https://evil.example' })), false);
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'https://liftpilot.example.evil.example' })), false);
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'null' })), false);
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'not a url' })), false);
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', origin: 'https://liftpilot.example', 'sec-fetch-site': 'cross-site' })), false);
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example', 'sec-fetch-site': 'same-site' })), false);
    assert.equal(sameOriginPost(h({ origin: 'https://liftpilot.example' })), false, 'no host to compare with');
  });

  it('only the first X-Forwarded-Host counts', () => {
    assert.equal(sameOriginPost(h({ host: 'internal', 'x-forwarded-host': 'evil.example, liftpilot.example', origin: 'https://liftpilot.example' })), false);
    assert.equal(sameOriginPost(h({ host: 'internal', 'x-forwarded-host': 'liftpilot.example, other', origin: 'https://liftpilot.example' })), true);
  });

  it('passes a browser that sends neither header, as the server actions do', () => {
    assert.equal(sameOriginPost(h({ host: 'liftpilot.example' })), true);
  });
});
