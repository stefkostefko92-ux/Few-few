/**
 * Default-secure NODE_ENV normalisation.
 *
 * Imported right after dotenv/config, before any route/middleware module
 * body, so that EVERY `process.env.NODE_ENV === 'production'` guard is
 * active unless NODE_ENV is EXPLICITLY development/test:
 *   - middleware/auth.ts  — refuse to boot with a placeholder JWT secret
 *   - routes/payments.ts  — block dev-mode (free-gem) checkout/verify
 *   - server.ts           — refuse wildcard CORS, redact raw errors
 *   - routes/auth.ts      — hide the /forgot password-reset token
 *
 * Previously all of these keyed off `=== 'production'`, so a forgotten or
 * misspelled NODE_ENV on a real deploy silently opened every one of them at
 * once. Now anything that isn't clearly dev/test is treated as production;
 * only an explicit `NODE_ENV=development` (see the server dev script) or
 * `test` unlocks the developer conveniences.
 */
const env = process.env.NODE_ENV;
if (env !== 'development' && env !== 'test') {
  if (env && env !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[boot] NODE_ENV="${env}" is not recognised — treating as production (default-secure).`);
  }
  process.env.NODE_ENV = 'production';
}

export {};
