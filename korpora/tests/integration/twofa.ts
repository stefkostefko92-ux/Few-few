import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import { Browser, CUSTOMER_PASSWORD } from './harness.js';
import { sessionCsrf } from './people.js';

/**
 * Turns two-factor protection on through the real forms (the start asks for the current password);
 * returns the secret, the recovery codes and the exact code the setup was confirmed with.
 */
export async function enable2fa(
  b: Browser,
  password = CUSTOMER_PASSWORD,
): Promise<{ secret: string; codes: string[]; enrolCode: string }> {
  const csrf = await sessionCsrf(b, '/account/security');
  const page = await b.post('/account/security/2fa/start', { _csrf: csrf, password });
  assert.equal(
    page.status,
    200,
    'the setup is shown in the answer, never stored in a page you can reload',
  );
  const secret =
    /<p class="secret">([A-Z2-7 ]+)<\/p>/.exec(page.body)?.[1]?.replace(/\s+/g, '') ?? '';
  assert.ok(secret.length >= 32, 'secret shown once for manual entry');
  const enrolCode = totpCode(secret, Math.floor(Date.now() / 1000));
  const confirm = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(page.body),
    code: enrolCode,
  });
  assert.equal(confirm.status, 200);
  const codes = [...confirm.body.matchAll(/<li>([A-Za-z0-9-]{8,})<\/li>/g)].map((m) => m[1] ?? '');
  return { secret, codes, enrolCode };
}
