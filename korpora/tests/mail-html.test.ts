import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// The mails are built for real (JSON transport, nothing leaves the machine): set the config first.
process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = 'https://korpora.example';
process.env.DATABASE_URL = 'postgresql://127.0.0.1:5432/unused';
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.CONTACT_EMAIL = 'contact@korpora.example';
process.env.LOG_LEVEL = 'silent';

const { LOCALES } = await import('../src/i18n.js');
const { outbox } = await import('../src/mail/mailer.js');
const t = await import('../src/mail/templates.js');

const last = () => {
  const mail = outbox.at(-1);
  assert.ok(mail?.html, 'the mail has an HTML part');
  return mail as typeof mail & { html: string };
};

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test('every mail goes out as plain text and as branded HTML in the language of the mail', async () => {
  for (const locale of LOCALES) {
    await t.mailVerifyEmail('a@example.test', locale, 'A'.repeat(43));
    const mail = last();
    assert.match(mail.text, /\/verify-email\?token=A{43}&lang=/, 'the text part stays');
    assert.ok(mail.html.startsWith('<!doctype html>'));
    assert.ok(mail.html.includes(`<html lang="${locale}"`), locale);
    assert.match(mail.html, /<meta name="color-scheme" content="light dark">/);
    assert.match(mail.html, /@media \(prefers-color-scheme: dark\)/);
    // the logo from our server, by absolute address, with a text alternative
    assert.match(
      mail.html,
      /<img src="https:\/\/korpora\.example\/static\/img\/brand\/logo\.png"[^>]* alt="Korpora"/,
    );
    // the main action is a button to the same address the text gives
    const link = /https:\/\/korpora\.example\/verify-email\?token=A{43}&amp;lang=\w+/.exec(
      mail.html,
    );
    assert.ok(link, 'the link is in the HTML');
    assert.match(mail.html, /class="k-btn-a"[^>]*>[^<]+<\/a>/);
    assert.doesNotMatch(mail.html, /<script|<link |@import|fonts\.googleapis/i, 'nothing external');
    // the Bulgarian localized letter forms are off in Bulgarian (owner's decision), as on the site
    assert.equal(mail.html.includes("font-feature-settings:'locl' 0"), locale === 'bg', locale);
  }
});

test('the HTML escapes what people wrote and links only addresses of Korpora', async () => {
  await t.mailPlanChanged(
    'b@example.test',
    'en',
    'Eve <script>alert(1)</script> https://evil.example/x',
    { plan: 'Premium', until: '9 October 2027' },
  );
  const { html } = last();
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Eve &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="https:\/\/evil\.example/);
  await t.mailBanned('b@example.test', 'en', null, 'see https://korpora.example.evil.com/x', null);
  assert.doesNotMatch(last().html, /href="https:\/\/korpora\.example\.evil/, 'only our own host');
  assert.match(html, /href="https:\/\/korpora\.example\/account\?lang=en"/);
  assert.match(html, /href="mailto:contact@korpora\.example"/);
});

test('the buttons and links keep their contrast in the light and the dark theme', () => {
  // light: white on the brand green; dark: deep green on the light green (mail/html.ts)
  assert.ok(contrast('#ffffff', '#2c6a10') >= 4.5);
  assert.ok(contrast('#1b2414', '#9cc97b') >= 4.5);
  assert.ok(contrast('#2c6a10', '#ffffff') >= 4.5, 'links on the light card');
  assert.ok(contrast('#b9de9c', '#323438') >= 4.5, 'links on the dark card');
  assert.ok(contrast('#5d5752', '#f6f7f1') >= 4.5, 'the footer on the paper');
  assert.ok(contrast('#c8c3bb', '#2a2c2f') >= 4.5, 'the footer on the dark paper');
});

test('the order confirmation keeps its model withdrawal form and gets a button to the orders', async () => {
  const { sendOrderConfirmation } = await import('../src/services/order-mail.js');
  await sendOrderConfirmation(
    {
      id: 'x',
      number: 7,
      option: 'm1',
      months: 1,
      listPriceCents: 2500,
      buyerType: 'CONSUMER',
      earlyStartRequestedAt: null,
      termsVersion: null,
      status: 'OPEN',
      createdAt: new Date('2026-10-09T12:00:00Z'),
      withdrawnAt: null,
    },
    { email: 'c@example.test', name: 'Мария', locale: 'bg', emailVerifiedAt: new Date() },
  );
  const { html, text } = last();
  assert.match(text, /Стандартен формуляр за отказ/);
  assert.match(html, /class="k-box"[\s\S]*Стандартен формуляр за отказ/);
  assert.match(html, /Поръчка № <span style="white-space:nowrap;">KP-2026-000007<\/span>/);
  assert.match(
    html,
    /href="https:\/\/korpora\.example\/account\/plan\?lang=bg"[^>]*>Вашите поръчки</,
  );
});
