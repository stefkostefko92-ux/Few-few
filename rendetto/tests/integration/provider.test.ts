import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const { COMPANY } = await import('../../src/company.js');

const page = async (path: string) => (await fetch(`${BASE}${path}`)).text();
const phoneLink = `<a class="nowrap" href="${COMPANY.phoneHref}">${COMPANY.phone}</a>`;
const bgName = 'Карбон Стелт ЕДПК (Carbon Stealth VCC), еднолично дружество с променлив капитал';

test('the terms name the provider in full: registered names, legal form, register, representative, phone, email', async () => {
  const cases = [
    [
      '/terms',
      /Карбон Стелт ЕДПК \(Carbon Stealth VCC\) — еднолично дружество с променлив капитал, вписано в Търговския регистър и регистъра на юридическите лица с нестопанска цел към Агенция по вписванията с ЕИК&nbsp;208725180, ДДС&nbsp;№&nbsp;BG208725180, представлявано от Стефан Костадинов\./,
    ],
    [
      '/en/terms',
      /Carbon Stealth VCC \(Bulgarian name: <span lang="bg">Карбон Стелт ЕДПК<\/span>\) — a variable capital company \(VCC\) under Bulgarian law, entered in the Commercial Register and Register of Non-Profit Legal Entities kept by the Registry Agency of Bulgaria under company number \(EIK\)&nbsp;208725180, VAT number&nbsp;BG208725180, represented by Stefan Kostadinov\./,
    ],
    [
      '/it/terms',
      /Carbon Stealth VCC \(denominazione in bulgaro: <span lang="bg">Карбон Стелт ЕДПК<\/span>\) — società a capitale variabile \(VCC\) di diritto bulgaro, iscritta nel Registro di commercio e delle persone giuridiche senza scopo di lucro tenuto dall'Agenzia delle iscrizioni della Bulgaria con codice EIK&nbsp;208725180, partita IVA&nbsp;BG208725180, rappresentata da Stefan Kostadinov\./,
    ],
  ] as const;
  for (const [path, provider] of cases) {
    const main = /<main id="main"[^>]*>([\s\S]*?)<\/main>/.exec(await page(path))?.[1] ?? '';
    assert.match(main, provider, path);
    assert.ok(main.includes(phoneLink), `${path}: the phone is next to the address and the email`);
  }
  const form = /<div class="model-form">([\s\S]*?)<\/div>/.exec(await page('/terms'))?.[1] ?? '';
  assert.ok(form.includes('— До Карбон Стелт ЕДПК (Carbon Stealth VCC), ул.'), 'model form');
});

test('the privacy policy, the footer, JSON-LD and llms.txt carry the same names, legal form and phone', async () => {
  const en = 'Carbon Stealth VCC, a variable capital company (VCC) under Bulgarian law';
  const it = 'Carbon Stealth VCC, società a capitale variabile (VCC) di diritto bulgaro';
  for (const [path, provider] of [
    ['/privacy', bgName],
    ['/en/privacy', en],
    ['/it/privacy', it],
  ] as const) {
    // само съдържанието на страницата — футърът също ги носи
    const main = /<main id="main"[^>]*>([\s\S]*?)<\/main>/.exec(await page(path))?.[1] ?? '';
    assert.ok(main.includes(provider), `${path}: names and legal form`);
    assert.ok(main.includes(phoneLink), `${path}: phone`);
  }
  for (const [path, provider] of [
    ['/', bgName],
    ['/terms', bgName],
    ['/en/', en.replace(', a ', ', ')],
    ['/it/', it],
  ] as const) {
    const foot = /<footer class="site-foot">([\s\S]*?)<\/footer>/.exec(await page(path))?.[1] ?? '';
    assert.ok(foot.includes(provider), `${path}: footer names and legal form`);
    assert.ok(foot.includes(phoneLink), `${path}: footer phone`);
  }
  const home = await page('/en/');
  const ld = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(home)?.[1] ?? '';
  const org = (
    JSON.parse(ld) as {
      '@graph': Array<Record<string, unknown> & { '@type': string | string[] }>;
    }
  )['@graph'].find((node) => [node['@type']].flat().includes('Organization'));
  assert.deepEqual(
    [org?.legalName, org?.alternateName, org?.telephone],
    [COMPANY.name, COMPANY.nameBg, COMPANY.phone],
  );
  const llms = await page('/llms.txt');
  assert.match(
    llms,
    /Carbon Stealth VCC\]\(https:\/\/carbonstealth\.eu\) \(in Bulgarian: Карбон Стелт ЕДПК\), variable capital company \(VCC\) under Bulgarian law, company number \(EIK\) 208725180, VAT number BG208725180; ul\. Samuil 3, 2670 Bobov Dol, Bulgaria; phone \+359 877 414 874/,
  );
});
