// The public price page (the owner, 12 November 2026: "Направи публична страница"; point 3 of the audit). It says
// what the portal really sells: the active plans from the console, without VAT, the free month, no automatic
// renewal. Acceptance criteria:
//  - public and indexable with the full SEO set: title under 60 and description under 160 characters, at least
//    five keywords with "Carbon Stealth", canonical, breadcrumbs, JSON-LD with the questions and — only when there
//    are plans on sale — one Offer per plan with its price;
//  - no price is invented: with the payments off (or without plans) the page says how to ask, and has no Offer;
//  - a plan switched off in the console is not shown;
//  - the page is in the sitemap, in robots.txt and in llms.txt, and the footer leads to it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, startApp, stopApp } from './harness.js';

const { cifraRevolut } = await import('../../src/auth/chiavi.js');

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('the public price page', () => {
  it('invents no price while the payments are off', async () => {
    await prisma.pianoAbbonamento.create({ data: { livello: 1, mesi: 12, prezzoCent: 29000 } });
    const p = await new Browser().get('/prezzi', HTML);
    assert.equal(p.status, 200);
    assert.match(p.body, /<meta name="robots" content="index, follow">/);
    assert.match(p.body, /I prezzi dei piani non sono ancora pubblicati/);
    assert.ok(!p.body.includes('290,00'));
    assert.ok(!p.body.includes('"@type":"Offer"'));
    // What does not depend on the price is said anyway.
    assert.match(p.body, /primo mese è gratuito/);
    assert.match(p.body, /non si rinnova da solo/);
  });

  it('shows the active plans without VAT, with the full SEO set', async () => {
    await prisma.configPagamenti.create({
      data: {
        id: 'revolut',
        attivo: true,
        ambiente: 'SANDBOX',
        chiaveEnc: cifraRevolut('sk_test_x'),
      },
    });
    await prisma.pianoAbbonamento.createMany({
      data: [
        { livello: 1, mesi: 1, prezzoCent: 2900 },
        { livello: 2, mesi: 12, prezzoCent: 99000 },
        { livello: 3, mesi: 12, prezzoCent: 199000, attivo: false },
      ],
    });
    const p = await new Browser().get('/prezzi', HTML);
    assert.equal(p.status, 200);
    assert.match(p.body, /<h1>Prezzi di Rilievi Impianti<\/h1>/);
    for (const prezzo of ['290,00', '29,00', '990,00']) assert.ok(p.body.includes(prezzo), prezzo);
    assert.ok(!p.body.includes('1.990,00'), 'a plan switched off is not on sale');
    assert.match(p.body, /IVA esclusa/);
    assert.match(p.body, /fino a 10 persone/);
    assert.match(p.body, /fino a 25 persone/);
    // 990 € for 12 months: the page does the division, to the cent.
    assert.match(p.body, /82,50[  ]€ al mese/);
    const titolo = /<title>([^<]+)<\/title>/.exec(p.body)![1]!;
    const descrizione = /<meta name="description" content="([^"]+)">/.exec(p.body)![1]!;
    const chiavi = /<meta name="keywords" content="([^"]+)">/.exec(p.body)![1]!;
    assert.ok(titolo.length < 60, titolo);
    assert.ok(descrizione.length < 160, descrizione);
    assert.ok(chiavi.split(',').length >= 5 && /Carbon Stealth/.test(chiavi));
    assert.match(p.body, /<link rel="canonical" href="[^"]+\/prezzi">/);
    assert.equal((p.body.match(/<h1/g) ?? []).length, 1);
    const ld = JSON.parse(
      /<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/.exec(p.body)![1]!,
    ) as {
      '@graph': Array<Record<string, unknown>>;
    };
    const tipi = ld['@graph'].map((n) => n['@type']);
    for (const t of ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'FAQPage'])
      assert.ok(tipi.flat().includes(t), t);
    const offerte = JSON.stringify(ld).match(/"@type":"Offer"/g) ?? [];
    assert.equal(offerte.length, 3);
    assert.ok(JSON.stringify(ld).includes('"price":"990.00"'));
    assert.ok(JSON.stringify(ld).includes('"priceCurrency":"EUR"'));
    // The questions on the page are the questions in the JSON-LD, word for word.
    const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage') as {
      mainEntity: Array<{ name: string }>;
    };
    assert.ok(faq.mainEntity.length >= 5);
    for (const q of faq.mainEntity)
      assert.ok(p.body.includes(q.name.replace(/'/g, '&#39;')), q.name);
  });

  it('is in the sitemap, robots.txt and llms.txt, and the footer leads to it', async () => {
    const b = new Browser();
    assert.match((await b.get('/sitemap.xml')).body, /<loc>[^<]+\/prezzi<\/loc>/);
    assert.match((await b.get('/sitemap.xml')).body, /<loc>[^<]+\/segnalazioni<\/loc>/);
    assert.match((await b.get('/robots.txt')).body, /Allow: \/prezzi\$/);
    assert.match((await b.get('/llms.txt')).body, /\/prezzi\)/);
    assert.match((await b.get('/privacy', HTML)).body, /href="\/prezzi"/);
  });
});
