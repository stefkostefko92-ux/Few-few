import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { renderPdf, bgAmount } from '../src/documents/pdf.js';
import { calculate } from '../src/einvoice/calculate.js';
import { dec } from '../src/einvoice/decimal.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { inboxReceivedMail } from '../src/mail/templates.js';
import { recipientEik } from '../src/inbox/deliver.js';
import { BRAND } from '../src/brand.js';
import { SAMPLES } from './fixtures/einvoice-samples.js';

const FONT_DIR = process.env['PDF_FONT_DIR'] ?? '/usr/share/fonts/truetype/dejavu';

test('сумите в PDF-а: групи с неразделим интервал и десетична запетая', () => {
  assert.equal(bgAmount(dec('1234567.5')), '1 234 567,50');
  assert.equal(bgAmount(dec('-12.345')), '−12,35');
  assert.equal(bgAmount(dec('0')), '0,00');
});

test(
  'PDF за всеки примерен документ (DejaVu: кирилица и €)',
  { skip: !existsSync(FONT_DIR) },
  async () => {
    for (const [name, raw] of Object.entries(SAMPLES)) {
      const input = InvoiceInputSchema.parse(raw);
      const pdf = await renderPdf(input, calculate(input), {
        number: input.number,
        chainIndex: 7n,
        sha256: 'a'.repeat(64),
        signature: BRAND.signature,
        issuedVia:
          name === 'domestic' ? { firm: 'Кантора ООД', mandateRef: 'Пълномощно № 1' } : null,
        fontDir: FONT_DIR,
      });
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', name);
      assert.ok(pdf.subarray(-8).toString().includes('%%EOF'), name);
      assert.ok(pdf.length > 5000, `${name}: ${pdf.length}`);
    }
  },
);

test('ЕИК на получателя: от BT-47 (и клон → юридическото лице) или от BG ДДС номера', () => {
  assert.equal(recipientEik({ legalId: '131063188' }), '131063188');
  assert.equal(recipientEik({ legalId: '1310631880001' }), '131063188');
  assert.equal(recipientEik({ vatId: 'BG131063188' }), '131063188');
  assert.equal(recipientEik({ vatId: 'IT12345678903' }), null);
  assert.equal(recipientEik({}), null);
});

test('писмото към шкафчето екранира данните от фактурата и казва дали изпращачът е потвърден', () => {
  const mail = inboxReceivedMail({
    senderName: 'Доставчик <script>alert(1)</script> ООД',
    senderEik: '208725180',
    senderVerified: false,
    recipientName: 'Получател & Син АД',
    documentTitle: 'Фактура',
    number: '0000000124',
    issueDate: '12.11.2026',
    dueDate: '26.11.2026',
    amount: '114,69 EUR',
    link: 'https://fakturist.eu/app/o/x/shkafche/y',
    signature: BRAND.signature,
    domain: BRAND.signatureDomain,
  });
  assert.ok(mail.subject.includes('0000000124'));
  assert.equal(mail.html.includes('<script>'), false);
  assert.ok(mail.html.includes('&lt;script&gt;'));
  assert.ok(mail.html.includes('Получател &amp; Син АД'));
  assert.ok(mail.text.includes('още не е потвърден'));
  assert.ok(mail.text.includes('fakturist.eu') && mail.html.includes('Carbon Stealth VCC'));
});
