import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryFromRequest, normalizeCountry } from '../geo-country';

// Спецификация: docs/geo-autotranslate-spec.md (А). Държавата идва от
// заглавката на прокси отпред (Cloudflare/Vercel), иначе от локалната база
// по X-Real-IP. IP се ползва само за справката — тук няма запис.

const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null;
const lookupTable: Record<string, string> = { '93.62.1.1': 'IT', '212.39.89.1': 'BG', '2a01:4f8::1': 'DE' };
const lookup = (ip: string) => lookupTable[ip] ?? null;

test('normalizeCountry: само истински ISO-2 код, без псевдо кодове', () => {
  assert.equal(normalizeCountry('it'), 'IT');
  assert.equal(normalizeCountry(' BG '), 'BG');
  assert.equal(normalizeCountry('XX'), null); // Cloudflare: неизвестна
  assert.equal(normalizeCountry('T1'), null); // Cloudflare: Tor
  assert.equal(normalizeCountry('EU'), null);
  assert.equal(normalizeCountry('ITA'), null);
  assert.equal(normalizeCountry(null), null);
});

test('countryFromRequest: заглавката на проксито печели пред базата', () => {
  assert.equal(countryFromRequest(headers({ 'cf-ipcountry': 'FR', 'x-real-ip': '93.62.1.1' }), lookup), 'FR');
  assert.equal(countryFromRequest(headers({ 'x-vercel-ip-country': 'ES' }), lookup), 'ES');
});

test('countryFromRequest: без прокси — справка по X-Real-IP (IPv4 и IPv6)', () => {
  assert.equal(countryFromRequest(headers({ 'x-real-ip': '93.62.1.1' }), lookup), 'IT');
  assert.equal(countryFromRequest(headers({ 'x-real-ip': '2a01:4f8::1' }), lookup), 'DE');
  // Псевдо кодът от проксито не спира справката.
  assert.equal(countryFromRequest(headers({ 'cf-ipcountry': 'XX', 'x-real-ip': '212.39.89.1' }), lookup), 'BG');
});

test('countryFromRequest: невалиден/липсващ IP, грешка в базата → null (fail-safe)', () => {
  assert.equal(countryFromRequest(headers({}), lookup), null);
  assert.equal(countryFromRequest(headers({ 'x-real-ip': 'не е ip' }), lookup), null);
  assert.equal(countryFromRequest(headers({ 'x-real-ip': '8.8.8.8' }), lookup), null);
  assert.equal(
    countryFromRequest(headers({ 'x-real-ip': '93.62.1.1' }), () => {
      throw new Error('повредена база');
    }),
    null,
  );
});
