import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hasKey, translator } from '../src/i18n.js';
import { HELP_FAQ_COUNT, HELP_SECTIONS } from '../src/help/sections.js';
import { helpFaq, helpFor, publicHelp, type HelpOrg } from '../src/help/content.js';
import { manualPdf } from '../src/help/manual-pdf.js';
import { structuredData } from '../src/seo/structured-data.js';
import type { FeatureCode } from '../src/features.js';

/** SPEC 89–91: помощта — един източник за публичната страница, „Помощ“ и PDF наръчника. */
const FREE = new Set<FeatureCode>([
  'invoices',
  'credit-debit-notes',
  'two-factor',
  'inbox',
  'proforma',
]);
const FIRM = new Set<FeatureCode>([...FREE, 'recurring', 'accountant-workspace', 'mandates']);
const org = (kind: HelpOrg['kind'], role: HelpOrg['role'], features = FREE): HelpOrg => ({
  kind,
  role,
  features,
});
const ids = (entries: Array<{ id: string }>) => entries.map((e) => e.id);

test('всеки раздел има заглавие, увод и поне 3 стъпки на двата езика; 8 въпроса', () => {
  for (const locale of ['bg', 'en'] as const) {
    for (const section of HELP_SECTIONS) {
      const key = `help.sections.${section.id}`;
      assert.ok(
        hasKey(locale, `${key}.title`) && hasKey(locale, `${key}.intro`),
        `${locale}/${section.id}`,
      );
      assert.ok(hasKey(locale, `${key}.steps.3`), `${locale}/${section.id}: поне 3 стъпки`);
    }
    assert.equal(helpFaq(locale).length, HELP_FAQ_COUNT);
    assert.equal(publicHelp(locale).length, HELP_SECTIONS.length);
  }
});

test('без „одобрен от НАП“/„сертифициран“; Peppol и НАП — само „предстои“', () => {
  const all = (locale: 'bg' | 'en') =>
    JSON.stringify([publicHelp(locale), helpFaq(locale)]).toLowerCase();
  assert.doesNotMatch(all('bg'), /одобрен|сертифициран/);
  assert.doesNotMatch(all('en'), /approved by|certified/);
  const upcoming = translator('bg')('help.sections.upcoming.intro');
  assert.match(upcoming, /предстои|предстоят/i);
});

test('„Помощ“ по организацията: собственик на фирма, издаващ, кантора, мастър', () => {
  const owner = helpFor('bg', { orgs: [org('COMPANY', 'OWNER')], master: false });
  assert.ok(ids(owner).includes('ownership') && ids(owner).includes('plan'));
  assert.ok(ids(owner).includes('mandates'));
  assert.ok(!ids(owner).includes('firm-clients'), 'фирма не вижда раздела на кантората');
  assert.equal(owner.find((e) => e.id === 'recurring')?.notInPlan, true, 'безплатният план');
  assert.equal(owner.find((e) => e.id === 'issue')?.notInPlan, false);

  const viewer = helpFor('bg', { orgs: [org('COMPANY', 'VIEWER')], master: false });
  assert.ok(!ids(viewer).includes('issue') && !ids(viewer).includes('ownership'));
  assert.ok(ids(viewer).includes('start') && ids(viewer).includes('security'));

  const firmAdmin = helpFor('bg', { orgs: [org('ACCOUNTING_FIRM', 'ADMIN', FIRM)], master: false });
  assert.ok(ids(firmAdmin).includes('firm-clients'));
  assert.ok(!ids(firmAdmin).includes('mandates') && !ids(firmAdmin).includes('ownership'));

  assert.equal(helpFor('en', { orgs: [], master: true }).length, HELP_SECTIONS.length);
});

test('PDF наръчникът: корицата с човека, ролята и разделите; кирилица', async () => {
  const sections = helpFor('bg', { orgs: [org('COMPANY', 'OWNER')], master: false });
  const pdf = await manualPdf(
    'bg',
    {
      name: 'Иван Петров',
      orgs: [{ legalName: 'Пекарна Зора ЕООД', kind: 'COMPANY', role: 'Собственик' }],
    },
    sections,
    { fontRoot: '/usr/share/fonts/truetype', now: new Date('2026-11-16T10:00:00Z') },
  );
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const dir = mkdtempSync(join(tmpdir(), 'narachnik-'));
  writeFileSync(join(dir, 'm.pdf'), pdf);
  const text = execFileSync('pdftotext', ['-layout', join(dir, 'm.pdf'), '-'], {
    encoding: 'utf8',
  });
  for (const needle of [
    'Иван Петров',
    'Пекарна Зора ЕООД',
    'Собственик',
    '16.11.2026',
    sections[0]!.title,
  ]) {
    assert.ok(text.includes(needle), needle);
  }
  assert.ok(text.includes(translator('bg')('help.sections.ownership.title')));
});

test('JSON-LD на „Как работи“: HowTo за всеки раздел и FAQPage', () => {
  const data = structuredData({
    base: 'https://fakturist.carbonstealth.eu',
    locale: 'bg',
    t: translator('bg'),
    page: 'help',
    plans: [],
  });
  const graph = data['@graph'] as Array<{ '@type': string }>;
  assert.equal(graph.filter((n) => n['@type'] === 'HowTo').length, HELP_SECTIONS.length);
  assert.equal(graph.filter((n) => n['@type'] === 'FAQPage').length, 1);
});
