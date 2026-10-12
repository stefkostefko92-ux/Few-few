import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.PUBLIC_BASE_URL ??= 'https://rilievi.example.test';
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
process.env.JWT_SECRET ??= 'a'.repeat(64);

const { parseAccessRequest, HONEYPOT } = await import('../src/requests/form.js');
const { llmsTxt, robotsTxt, sitemapXml } = await import('../src/seo/files.js');
const { alternatesOf, publicPageOf, publicPath, sentPath } = await import('../src/seo/paths.js');
const { landingStructuredData, privacyStructuredData } =
  await import('../src/seo/structured-data.js');
const { FAQ_IDS, roleMatrix, sheetCounts, sheetLegend, STEPS } =
  await import('../src/site/landing.js');
const { LOCALES, translatorFor } = await import('../src/i18n.js');
const { accessRequestMail } = await import('../src/mail/templates.js');

const BASE = 'https://rilievi.example.test';
const valid = {
  name: '  Giulia   Verdi ',
  company: 'Ascensori Verdi Srl',
  email: ' Giulia@Example.IT ',
  phone: '+39 02 1234-5678',
  city: 'Milano',
  teamSize: 'S6_20',
  message: 'Riga uno\r\nRiga due',
  privacy: 'si',
};

describe('the access request form', () => {
  it('cleans the text, lowercases the email and keeps the optional fields', () => {
    const parsed = parseAccessRequest(valid);
    assert.equal(parsed.kind, 'ok');
    assert.deepEqual(parsed.kind === 'ok' && parsed.data, {
      name: 'Giulia Verdi',
      company: 'Ascensori Verdi Srl',
      email: 'giulia@example.it',
      phone: '+39 02 1234-5678',
      city: 'Milano',
      teamSize: 'S6_20',
      message: 'Riga uno\nRiga due',
    });
  });

  it('needs name, company, a valid email and the privacy tick; the rest is optional', () => {
    const parsed = parseAccessRequest({ email: 'not-an-email' });
    assert.equal(parsed.kind, 'invalid');
    assert.deepEqual(parsed.kind === 'invalid' && parsed.errors, {
      name: 'required',
      company: 'required',
      email: 'email',
      privacy: 'required',
    });
    const minimal = parseAccessRequest({
      name: 'Al',
      company: 'Az',
      email: 'a@b.it',
      privacy: 'si',
    });
    assert.equal(minimal.kind, 'ok');
    assert.deepEqual(minimal.kind === 'ok' && [minimal.data.phone, minimal.data.teamSize], [
      null,
      null,
    ]);
  });

  it('rejects a phone with letters, an unknown team size and an over-long message', () => {
    const parsed = parseAccessRequest({
      ...valid,
      phone: '02 CALL ME',
      teamSize: 'S1000',
      message: 'x'.repeat(2001),
    });
    assert.equal(parsed.kind, 'invalid');
    const errors = parsed.kind === 'invalid' ? parsed.errors : {};
    assert.equal(errors.phone, 'phone');
    assert.equal(errors.teamSize, 'invalid');
    assert.equal(errors.message, 'tooLong');
  });

  it('treats a filled bot trap as spam, whatever else was sent', () => {
    assert.equal(parseAccessRequest({ ...valid, [HONEYPOT]: 'https://spam.example' }).kind, 'spam');
  });

  it('turns control characters into spaces and keeps typed values for the redisplay', () => {
    const parsed = parseAccessRequest({ ...valid, name: 'Giulia\u0000\u0007 Verdi', privacy: '' });
    assert.equal(parsed.kind, 'invalid');
    assert.equal(parsed.kind === 'invalid' && parsed.values.name, 'Giulia Verdi');
  });
});

describe('the public addresses', () => {
  it('put Italian at the root and the other languages under their prefix', () => {
    assert.equal(publicPath('it', 'home'), '/');
    assert.equal(publicPath('bg', 'home'), '/bg/');
    assert.equal(publicPath('en', 'privacy'), '/en/privacy');
    assert.equal(sentPath('bg'), '/bg/richiesta-inviata');
    assert.deepEqual(publicPageOf('/en/'), { locale: 'en', page: 'home' });
    assert.equal(publicPageOf('/schede'), null);
    assert.deepEqual(
      alternatesOf(BASE, 'privacy').map((alt) => alt.href),
      [`${BASE}/privacy`, `${BASE}/bg/privacy`, `${BASE}/en/privacy`],
    );
  });

  it('let robots crawl only the public pages, the sign-in page and the static files', () => {
    const robots = robotsTxt(BASE, 'abc123');
    for (const path of ['/', '/bg/', '/en/', '/privacy', '/bg/privacy', '/en/privacy']) {
      assert.ok(robots.includes(`Allow: ${path}$\n`), path);
    }
    assert.match(robots, /Allow: \/accesso\$\n/);
    assert.match(robots, /Allow: \/abc123\.txt\n/);
    assert.match(robots, /\nDisallow: \/\n/);
    assert.match(robots, new RegExp(`Sitemap: ${BASE}/sitemap.xml`));
    assert.doesNotMatch(robots, /schede|utenti|richieste/);
  });

  it('list every public page in the sitemap with all its languages and an x-default', () => {
    const xml = sitemapXml(BASE);
    assert.equal(xml.match(/<url>/g)?.length, 6);
    assert.equal(
      xml.match(/hreflang="x-default" href="https:\/\/rilievi\.example\.test\/"/g)?.length,
      3,
    );
    assert.match(xml, /<loc>https:\/\/rilievi\.example\.test\/bg\/privacy<\/loc>/);
    assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('describe the product in llms.txt with facts from the code, without placeholders', () => {
    const text = llmsTxt(BASE, 'info@example.test');
    const { fields, sections } = sheetCounts();
    assert.match(text, new RegExp(`${fields} fields in ${sections} sections`));
    assert.match(text, /EIK\) 208725180/);
    assert.match(text, /valid for 7 days/);
    assert.doesNotMatch(text, /\{\w+\}/);
  });
});

describe('the landing page content', () => {
  it('lists the 11 sections of the sheet with real field labels, numbered like the drawing', () => {
    const legend = sheetLegend(translatorFor('it'));
    assert.equal(legend.length, 11);
    assert.deepEqual(
      legend.map((section) => section.n),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
    for (const section of legend) {
      assert.ok(!section.title.startsWith('scheda.'), section.key);
      for (const label of section.fields) assert.ok(!label.startsWith('scheda.'), label);
    }
    assert.equal(
      sheetCounts().fields,
      legend.reduce((n, s) => n + s.fields.length, 0),
    );
  });

  it('shows the six company roles with the rights they really have', () => {
    const rows = roleMatrix();
    assert.deepEqual(
      rows.map((row) => row.role),
      ['ADMIN', 'DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE'],
    );
    assert.deepEqual(rows[0]?.caps, [true, true, true, true, true, true]);
    assert.deepEqual(rows[3]?.caps, [true, true, false, false, false, false]);
    assert.deepEqual(rows[5]?.caps, [true, false, false, false, false, false]);
  });

  it('keeps titles under 60 and descriptions under 160 characters, with ≥5 keywords and the brand', () => {
    for (const locale of LOCALES) {
      const t = translatorFor(locale);
      assert.ok(t('site.meta.title').length < 60, `${locale} title`);
      assert.ok(t('site.meta.description').length < 160, `${locale} description`);
      assert.ok(t('privacy.metaDescription').length < 160, `${locale} privacy description`);
      const keywords = t('site.meta.keywords')
        .split(',')
        .map((k) => k.trim());
      assert.ok(keywords.length >= 5, `${locale} keywords`);
      assert.ok(keywords.includes('Carbon Stealth'), `${locale} brand keyword`);
    }
  });
});

describe('the structured data', () => {
  it('repeats the questions and the steps of the page word for word', () => {
    const t = translatorFor('en');
    const graph = (
      JSON.parse(landingStructuredData('en', t, `${BASE}/en/`)) as {
        '@graph': Array<Record<string, unknown>>;
      }
    )['@graph'];
    const byType = (type: string) => graph.find((node) => node['@type'] === type);
    const faq = byType('FAQPage') as { mainEntity: Array<{ name: string }> };
    assert.deepEqual(
      faq.mainEntity.map((q) => q.name),
      FAQ_IDS.map((id) => t(`site.faq.${id}.q`)),
    );
    const howTo = byType('HowTo') as { step: Array<{ name: string; url: string }> };
    assert.equal(howTo.step.length, STEPS.length);
    assert.equal(howTo.step[0]?.url, `${BASE}/en/#passo-1`);
    const org = graph.find((node) => Array.isArray(node['@type'])) as {
      address: { postalCode: string };
      vatID: string;
    };
    assert.equal(org.address.postalCode, '2670');
    assert.equal(org.vatID, 'BG208725180');
  });

  it('cannot be broken out of its script tag by a translation', () => {
    const t = (key: string) => (key === 'privacy.title' ? '</script><b>x</b>' : key);
    const json = privacyStructuredData('it', t, `${BASE}/privacy`, '2026-10-12');
    assert.doesNotMatch(json, /<\/script>/);
    assert.match(json, /\\u003c\/script>/);
  });
});

describe('the notice of a new request', () => {
  it('carries only the company name and the link, never the contact details', () => {
    const mail = accessRequestMail('bg', {
      to: 'master@example.test',
      company: 'Ascensori Verdi Srl',
      link: `${BASE}/richieste/abc`,
    });
    assert.match(mail.subject, /Нова заявка за достъп/);
    assert.match(mail.text, /Ascensori Verdi Srl/);
    assert.match(mail.text, /\/richieste\/abc/);
  });
});
