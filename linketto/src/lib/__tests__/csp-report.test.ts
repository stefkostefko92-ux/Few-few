import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSP_REPORT_MAX_BYTES,
  CSP_REPORT_MAX_ITEMS,
  cleanBlocked,
  cleanDirective,
  cleanPage,
  createLogBudget,
  parseCspReports,
} from '../csp-report';

// Докладите на CSP стигат до дневника на app — нищо лично не бива да мине (lib/csp-report.ts).

test('страницата става шаблон: без slug, домейн, код и параметри', () => {
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/u/maria-ivanova?hl=it'), '/u/*');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/d/example.com'), '/d/*');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/s/AbC123'), '/s/*');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/bg/reset?token=secret'), '/bg/reset');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/bg/dashboard/analytics'), '/bg/dashboard');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/it'), '/it');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/'), '/');
  // Краткият домейн: /<slug> → не се пише.
  assert.equal(cleanPage('https://lnkt.to/maria'), '/*');
  assert.equal(cleanPage('https://piuma.carbonstealth.eu/bg/Ivan%20Petrov'), '/bg/*');
  assert.equal(cleanPage('не е адрес'), '/*');
  assert.equal(cleanPage(42), '/*');
});

test('блокираното: само произход или ключова дума', () => {
  assert.equal(cleanBlocked('https://evil.example/steal?c=session'), 'https://evil.example');
  assert.equal(cleanBlocked('inline'), 'inline');
  assert.equal(cleanBlocked('eval'), 'eval');
  assert.equal(cleanBlocked('data:image/png;base64,AAAA'), 'data');
  assert.equal(cleanBlocked('chrome-extension://abcdef/script.js'), 'chrome-extension://abcdef');
  assert.equal(cleanBlocked(''), 'none');
  assert.equal(cleanBlocked('нещо\nдруго'), 'other');
});

test('директивата: само букви и тирета', () => {
  assert.equal(cleanDirective('script-src-elem'), 'script-src-elem');
  assert.equal(cleanDirective("img-src 'self'"), 'img-src');
  assert.equal(cleanDirective('x"; rm -rf /'), 'other');
  assert.equal(cleanDirective(undefined), 'other');
});

test('report-uri формат', () => {
  const body = JSON.stringify({
    'csp-report': {
      'document-uri': 'https://piuma.carbonstealth.eu/u/maria?ref=abc',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://cdn.evil.example/x.js',
      'original-policy': "default-src 'self'",
    },
  });
  assert.deepEqual(parseCspReports(body), [
    { directive: 'script-src-elem', blocked: 'https://cdn.evil.example', page: '/u/*', disposition: 'report' },
  ]);
});

test('Reporting API формат (масив) с таван на броя', () => {
  const one = {
    type: 'csp-violation',
    url: 'https://piuma.carbonstealth.eu/bg/login',
    user_agent: 'Mozilla/5.0 личен',
    body: {
      documentURL: 'https://piuma.carbonstealth.eu/bg/login',
      effectiveDirective: 'img-src',
      blockedURL: 'http://tracker.example/p.gif',
      disposition: 'report',
    },
  };
  const many = Array.from({ length: CSP_REPORT_MAX_ITEMS + 5 }, () => one);
  const out = parseCspReports(JSON.stringify([...many, { type: 'deprecation', body: {} }]));
  assert.equal(out.length, CSP_REPORT_MAX_ITEMS);
  assert.deepEqual(out[0], { directive: 'img-src', blocked: 'http://tracker.example', page: '/bg/login', disposition: 'report' });
  // user agent и пълният адрес не стигат до записа.
  assert.ok(!JSON.stringify(out).includes('Mozilla'));
});

test('боклук и прекалено голямо тяло → нищо', () => {
  assert.deepEqual(parseCspReports(''), []);
  assert.deepEqual(parseCspReports('{не е json'), []);
  assert.deepEqual(parseCspReports('{"other":1}'), []);
  assert.deepEqual(parseCspReports('x'.repeat(CSP_REPORT_MAX_BYTES + 1)), []);
});

test('бюджетът за дневника се подновява с прозореца', () => {
  const allow = createLogBudget(2, 1000);
  assert.equal(allow(0), true);
  assert.equal(allow(10), true);
  assert.equal(allow(20), false);
  assert.equal(allow(1000), true);
});
