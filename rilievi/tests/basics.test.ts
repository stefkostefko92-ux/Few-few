import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { stripSecrets } from '../src/logger.js';
import { viewHelpers } from '../src/http/view.js';
import { businessDay, dateFromDay, dayFromDate } from '../src/time.js';
import { safeNext } from '../src/auth/guards.js';

const base = {
  PUBLIC_BASE_URL: 'https://rilievi.carbonstealth.eu/',
  DATABASE_URL: 'postgresql://x:y@db:5432/rilievi',
  JWT_SECRET: 'a'.repeat(64),
};

describe('config', () => {
  it('starts with the minimum and trims the trailing slash of the public address', () => {
    const cfg = loadConfig(base);
    assert.equal(cfg.PUBLIC_BASE_URL, 'https://rilievi.carbonstealth.eu');
    assert.equal(cfg.PORT, 4330);
    assert.equal(cfg.SMTP_HOST, undefined);
    assert.equal(cfg.SMTP_PORT, 2525);
  });

  it('refuses to start with a weak or missing JWT secret', () => {
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'secret' }), /JWT_SECRET/);
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: undefined }), /JWT_SECRET/);
  });

  it('treats an empty SMTP host from compose as "no mail"', () => {
    assert.equal(loadConfig({ ...base, SMTP_HOST: '' }).SMTP_HOST, undefined);
    // An empty address from docker-compose (`${CONTACT_EMAIL:-}`) means the default, a bad one fails.
    assert.equal(loadConfig({ ...base, CONTACT_EMAIL: '' }).CONTACT_EMAIL, 'info@carbonstealth.eu');
    assert.throws(() => loadConfig({ ...base, PRIVACY_EMAIL: 'nope' }), /PRIVACY_EMAIL/);
  });
});

describe('logging', () => {
  it('never writes invite or reset tokens, nor query strings', () => {
    assert.equal(stripSecrets('/invito/abcDEF123_-xyz'), '/invito/[скрито]');
    assert.equal(stripSecrets('/reimposta/abc?x=1'), '/reimposta/[скрито]');
    assert.equal(stripSecrets('/schede?q=via+roma'), '/schede');
  });
});

describe('dates and numbers', () => {
  it('keeps @db.Date values on their day', () => {
    const day = dateFromDay('2026-10-12');
    assert.equal(dayFromDate(day), '2026-10-12');
    assert.equal(viewHelpers('it').day(day), '12/10/2026');
  });

  it('gives today in Rome, not in UTC', () => {
    // 23:30 UTC on 11 October is already 12 October in Rome (UTC+2 in summer time).
    assert.equal(businessDay(new Date('2026-10-11T23:30:00Z')), '2026-10-12');
  });

  it('formats decimals with the Italian comma, and form values without grouping', () => {
    assert.equal(viewHelpers('it').num(10.5), '10,5');
    assert.equal(viewHelpers('it').inputNum({ toString: () => '1250.50' }), '1250,5');
  });
});

describe('redirect after sign-in', () => {
  it('only goes to our own paths', () => {
    assert.equal(safeNext('/schede/abc'), '/schede/abc');
    assert.equal(safeNext('//evil.example'), '/schede');
    assert.equal(safeNext('/\\evil.example'), '/schede');
    assert.equal(safeNext('https://evil.example'), '/schede');
    assert.equal(safeNext(undefined), '/schede');
  });
});
