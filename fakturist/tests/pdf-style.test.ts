import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import * as fontkit from 'fontkit';
import {
  PDF_FONTS,
  PDF_TEMPLATES,
  DEFAULT_PDF_STYLE,
  contrastOnWhite,
  parsePdfStyleForm,
  resolvePdfStyle,
} from '../src/documents/pdf-style.js';
import { normalizeLogo, sniffLogo } from '../src/documents/logo.js';
import { renderPdf } from '../src/documents/pdf.js';
import { calculate } from '../src/einvoice/calculate.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { BRAND } from '../src/brand.js';
import { SAMPLES } from './fixtures/einvoice-samples.js';

const FONT_ROOT = process.env['PDF_FONT_ROOT'] ?? '/usr/share/fonts/truetype';
const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('всеки шрифт от списъка е в образа и има кирилица, € и българските кавички', () => {
  for (const [key, font] of Object.entries(PDF_FONTS)) {
    for (const file of [font.regular, font.bold, font.mono]) {
      const path = join(FONT_ROOT, file);
      assert.ok(existsSync(path), `${key}: липсва ${path}`);
      const face = fontkit.openSync(path);
      for (const ch of 'ЖщЮъ€№„“') {
        assert.ok(face.hasGlyphForCodePoint(ch.codePointAt(0)!), `${key} ${file}: ${ch}`);
      }
    }
  }
});

test('акцентният цвят: само #rrggbb с контраст поне 4,5:1 върху бяло', () => {
  assert.ok(contrastOnWhite('#0b6b52') >= 4.5);
  assert.ok(contrastOnWhite('#ffff00') < 4.5);
  const ok = parsePdfStyleForm({
    font: 'liberation-serif',
    template: 'band',
    accent: '#1F3A93',
    logoPosition: 'right',
  });
  assert.deepEqual(ok, {
    ok: true,
    style: { font: 'liberation-serif', template: 'band', accent: '#1f3a93', logoPosition: 'right' },
  });
  const pale = parsePdfStyleForm({ ...DEFAULT_PDF_STYLE, accent: '#ffff00' });
  assert.ok(!pale.ok && pale.errors['accent'] === 'lowContrast');
  const bad = parsePdfStyleForm({
    font: 'comic',
    template: 'fancy',
    accent: 'red',
    logoPosition: 'top',
  });
  assert.ok(
    !bad.ok &&
      bad.errors['font'] === 'invalid' &&
      bad.errors['template'] === 'invalid' &&
      bad.errors['accent'] === 'invalidAccent' &&
      bad.errors['logoPosition'] === 'invalid',
  );
});

test('непознат шрифт или липсващ файл → DejaVu Sans', () => {
  const unknown = resolvePdfStyle({ ...DEFAULT_PDF_STYLE, font: 'comic' }, null, FONT_ROOT);
  assert.equal(unknown.font, 'dejavu-sans');
  const missing = resolvePdfStyle(
    { ...DEFAULT_PDF_STYLE, font: 'liberation-sans' },
    null,
    join(tmpdir(), 'няма-такива-шрифтове'),
  );
  assert.equal(missing.font, 'dejavu-sans');
  assert.ok(missing.fonts.regular.endsWith('DejaVuSans.ttf'));
});

test('логото: само PNG/JPEG по сигнатура, прекодирано; SVG и повредено — отказ', async () => {
  const png = await sharp({
    create: { width: 2400, height: 800, channels: 4, background: '#0b6b52' },
  })
    .png()
    .toBuffer();
  assert.equal(sniffLogo(png), 'png');
  const ok = await normalizeLogo(png);
  assert.ok(
    ok.ok && ok.logo.type === 'image/png' && ok.logo.width === 1200 && ok.logo.height === 400,
  );
  const jpeg = await sharp({
    create: { width: 300, height: 100, channels: 3, background: '#ffffff' },
  })
    .jpeg()
    .toBuffer();
  const jok = await normalizeLogo(jpeg);
  assert.ok(jok.ok && jok.logo.type === 'image/jpeg');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  assert.deepEqual(await normalizeLogo(svg), { ok: false, error: 'type' });
  const broken = Buffer.concat([png.subarray(0, 40), Buffer.alloc(200, 7)]);
  assert.deepEqual(await normalizeLogo(broken), { ok: false, error: 'corrupt' });
});

test('всеки шаблон × позиция на логото: валиден PDF със същите реквизити, суми и подпис', async () => {
  const logoPng = await sharp({
    create: { width: 600, height: 200, channels: 4, background: '#1f3a93' },
  })
    .png()
    .toBuffer();
  const logo = await normalizeLogo(logoPng);
  assert.ok(logo.ok);
  const input = InvoiceInputSchema.parse(SAMPLES['domestic']);
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-pdf-'));
  for (const template of PDF_TEMPLATES) {
    for (const logoPosition of ['left', 'right'] as const) {
      const style = resolvePdfStyle(
        { font: 'liberation-serif', template, accent: '#1f3a93', logoPosition },
        { data: logo.logo.data, width: logo.logo.width, height: logo.logo.height },
        FONT_ROOT,
      );
      const pdf = await renderPdf(
        input,
        calculate(input),
        {
          number: input.number,
          chainIndex: 7n,
          sha256: 'a'.repeat(64),
          signature: BRAND.signature,
          issuedVia: { firm: 'Кантора ООД', mandateRef: 'Пълномощно № 1' },
        },
        style,
      );
      const label = `${template}/${logoPosition}`;
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', label);
      const raw = pdf.toString('latin1');
      assert.ok(raw.includes('/Subtype /Image'), `${label}: логото`);
      assert.ok(raw.includes('LiberationSerif'), `${label}: шрифтът`);
      if (!hasPdftotext) continue;
      const file = join(dir, `${template}-${logoPosition}.pdf`);
      writeFileSync(file, pdf);
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
      for (const required of [
        'ФАКТУРА',
        input.number,
        'Доставчик'.toUpperCase(),
        'Получател'.toUpperCase(),
        'ЕИК',
        'За плащане',
        'Пълномощно № 1',
        'fakturist.eu',
      ]) {
        assert.ok(text.includes(required), `${label}: липсва „${required}“`);
      }
    }
  }
});
