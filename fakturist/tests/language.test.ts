import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as systemTextModule from '../src/system-text.js';
import { safeBack } from '../src/http/view.js';
import {
  inboxReceivedMail,
  ownershipReviewMail,
  transferInviteMail,
} from '../src/mail/templates.js';

const { SYSTEM_TEXT_EN, systemText, BANK_NOTE_REF } = systemTextModule;
const CYRILLIC = /[А-Яа-яЁё]/;

test('всеки текст, който системата записва на български, има превод за изгледа на английски', () => {
  const constants = Object.entries(systemTextModule).filter(
    ([name, value]) => typeof value === 'string' && name !== 'BANK_NOTE_REF',
  ) as Array<[string, string]>;
  assert.ok(constants.length >= 9);
  for (const [name, value] of constants) {
    const en = SYSTEM_TEXT_EN[value];
    assert.ok(en, `${name} няма превод`);
    assert.ok(!CYRILLIC.test(en), `${name}: ${en}`);
    assert.equal(systemText(value, 'en'), en);
    assert.equal(systemText(value, 'bg'), value);
  }
  assert.equal(
    systemText(`${BANK_NOTE_REF}FT2611150001`, 'en'),
    'Bank statement, ref. FT2611150001',
  );
  // Въведеното от човек или върнатото от доставчика — без промяна.
  assert.equal(systemText('Плащане по договор', 'en'), 'Плащане по договор');
  assert.equal(systemText('eConnect send: HTTP 400 — bad', 'en'), 'eConnect send: HTTP 400 — bad');
});

test('адресът за връщане след смяна на езика — само наш път в приложението или панела', () => {
  for (const ok of [
    '/app',
    '/app/sigurnost',
    '/app/o/cmabc123/nov?zamenya=cmdoc1',
    '/admin/r/organizations/cm1?greshka=grant.plan',
    '/prilozhenie',
  ]) {
    assert.equal(safeBack(ok), ok, ok);
  }
  for (const bad of [
    '//evil.example/app',
    'https://evil.example/app',
    '/\\evil.example',
    '/app/../admin',
    '/vhod',
    '/app/<script>',
    '/app?x="1"',
    'app',
    42,
    undefined,
    `/app/${'a'.repeat(600)}`,
  ]) {
    assert.equal(safeBack(bad), '/app', String(bad));
  }
});

test('писмата до получател с профил на английски — без български извън данните', () => {
  const inbox = inboxReceivedMail({
    locale: 'en',
    senderName: 'Zlato Mill OOD',
    senderEik: '175074752',
    senderVerified: false,
    recipientName: 'Zora Bakery EOOD',
    documentTitle: 'Invoice',
    number: '0000000124',
    issueDate: '12/11/2026',
    dueDate: '26/11/2026',
    amount: '114.69 EUR',
    link: 'https://fakturist.eu/app/o/x/shkafche/y',
    signature: 'Created with fakturist.eu — a product of Carbon Stealth VCC.',
    domain: 'fakturist.eu',
  });
  const invite = transferInviteMail({
    locale: 'en',
    companyName: 'Sunrise Trading EOOD',
    companyEik: '831642181',
    firmName: 'Balance Accounting OOD',
    link: 'https://fakturist.eu/pokana/TOKEN?lang=en',
    privacyUrl: 'https://fakturist.eu/en/privacy',
    retentionDays: { invite: 30, mail: 90 },
    expires: '20/11/2026',
    signature: 'Created with fakturist.eu — a product of Carbon Stealth VCC.',
    domain: 'fakturist.eu',
  });
  const review = ownershipReviewMail({
    locale: 'en',
    companyName: 'Sunrise Trading EOOD',
    companyEik: '831642181',
    firmName: 'Balance Accounting OOD',
    link: 'https://fakturist.eu/admin/r/organizations/x',
  });
  for (const mail of [inbox, invite, review]) {
    for (const part of [mail.subject, mail.text, mail.html]) {
      assert.ok(!CYRILLIC.test(part), part.slice(0, 300));
    }
    assert.match(mail.html, /<html lang="en">/);
  }
  assert.equal(inbox.subject, 'Invoice No. 0000000124 from Zlato Mill OOD');
  // Без `locale` — български, както досега.
  const bg = transferInviteMail({
    companyName: 'Слънце ЕООД',
    companyEik: '831642181',
    link: 'https://fakturist.eu/pokana/TOKEN',
    privacyUrl: 'https://fakturist.eu/poveritelnost',
    retentionDays: { invite: 30, mail: 90 },
    expires: '20.11.2026',
    signature: 'Подпис',
    domain: 'fakturist.eu',
  });
  assert.match(bg.text, /^Здравейте,/);
  assert.match(bg.html, /<html lang="bg">/);
});

/** Всички .ejs под views/. */
function templates(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? templates(path) : path.endsWith('.ejs') ? [path] : [];
  });
}

test('атрибут, добавян по условие, не се екранира (иначе aria-current/class не важат)', () => {
  // `<%= x ? ' class="a"' : '' %>` дава class=&#34;a&#34; — браузърът вижда стойност с кавичките.
  const escaped =
    /<%=[^%]*\?\s*'\s[a-z-]+="[^']*'\s*:\s*''\s*%>|<%=[^%]*\?\s*''\s*:\s*'\s[a-z-]+="/;
  const offenders = templates(join(import.meta.dirname, '..', 'views')).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (escaped.test(line) ? [`${file}:${i + 1}`] : [])),
  );
  assert.deepEqual(offenders, []);
});
