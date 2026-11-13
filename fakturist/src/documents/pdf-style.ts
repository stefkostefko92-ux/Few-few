import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { prisma } from '../db.js';

/**
 * Изгледът на PDF копието, който фирмата избира от настройките си: шрифт, шаблон, акцентен цвят, лого и
 * позицията му. Само външен вид — реквизитите, сумите, пълномощното и подписът на продукта са едни и
 * същи във всеки изглед (pdf.ts).
 */

/** Подбраните шрифтове: TTF с кирилица, € и „“ (тест), от пакетите fonts-dejavu-core и fonts-liberation. */
export const PDF_FONTS = {
  'dejavu-sans': {
    label: 'DejaVu Sans',
    regular: 'dejavu/DejaVuSans.ttf',
    bold: 'dejavu/DejaVuSans-Bold.ttf',
    mono: 'dejavu/DejaVuSansMono.ttf',
  },
  'dejavu-serif': {
    label: 'DejaVu Serif',
    regular: 'dejavu/DejaVuSerif.ttf',
    bold: 'dejavu/DejaVuSerif-Bold.ttf',
    mono: 'dejavu/DejaVuSansMono.ttf',
  },
  'liberation-sans': {
    label: 'Liberation Sans',
    regular: 'liberation/LiberationSans-Regular.ttf',
    bold: 'liberation/LiberationSans-Bold.ttf',
    mono: 'liberation/LiberationMono-Regular.ttf',
  },
  'liberation-serif': {
    label: 'Liberation Serif',
    regular: 'liberation/LiberationSerif-Regular.ttf',
    bold: 'liberation/LiberationSerif-Bold.ttf',
    mono: 'liberation/LiberationMono-Regular.ttf',
  },
} as const;
export type PdfFontKey = keyof typeof PDF_FONTS;

export const PDF_TEMPLATES = ['classic', 'band', 'compact'] as const;
export type PdfTemplate = (typeof PDF_TEMPLATES)[number];
export const LOGO_POSITIONS = ['left', 'right'] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export interface PdfStyleSettings {
  font: string;
  template: string;
  accent: string;
  logoPosition: string;
}

export const DEFAULT_PDF_STYLE = {
  font: 'dejavu-sans',
  template: 'classic',
  accent: '#0b6b52',
  logoPosition: 'left',
} as const satisfies PdfStyleSettings;

const isFont = (value: string): value is PdfFontKey => Object.hasOwn(PDF_FONTS, value);
const isTemplate = (value: string): value is PdfTemplate =>
  (PDF_TEMPLATES as readonly string[]).includes(value);
const isPosition = (value: string): value is LogoPosition =>
  (LOGO_POSITIONS as readonly string[]).includes(value);

/** Относителна яркост по WCAG 2.x. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Контрастът на цвета върху бяло: бял текст върху лентата и цветен номер върху бялата страница. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/;

/** Формата → изгледа; кодовете на грешките са ключове от преводите (app.settings.errors.*). */
export function parsePdfStyleForm(body: Record<string, unknown>):
  | {
      ok: true;
      style: {
        font: PdfFontKey;
        template: PdfTemplate;
        accent: string;
        logoPosition: LogoPosition;
      };
    }
  | { ok: false; errors: Record<string, string> } {
  const text = (name: string) =>
    typeof body[name] === 'string' ? (body[name] as string).trim() : '';
  const font = text('font');
  const template = text('template');
  const accent = text('accent').toLowerCase();
  const logoPosition = text('logoPosition');
  const errors: Record<string, string> = {};
  if (!isFont(font)) errors['font'] = 'invalid';
  if (!isTemplate(template)) errors['template'] = 'invalid';
  if (!HEX.test(accent)) errors['accent'] = 'invalidAccent';
  else if (contrastOnWhite(accent) < 4.5) errors['accent'] = 'lowContrast';
  if (!isPosition(logoPosition)) errors['logoPosition'] = 'invalid';
  if (
    Object.keys(errors).length > 0 ||
    !isFont(font) ||
    !isTemplate(template) ||
    !isPosition(logoPosition)
  ) {
    return { ok: false, errors };
  }
  return { ok: true, style: { font, template, accent, logoPosition } };
}

export interface PdfLogo {
  data: Buffer;
  width: number;
  height: number;
}

export interface ResolvedPdfStyle {
  font: PdfFontKey;
  template: PdfTemplate;
  accent: string;
  logoPosition: LogoPosition;
  fonts: { regular: string; bold: string; mono: string };
  logo: PdfLogo | null;
}

/**
 * Записаният изглед → готов за рисуване. Непознати стойности (стар запис, ръчна промяна) стават
 * подразбиращите се; шрифт без файлове в образа става DejaVu Sans — PDF-ът не пада заради изгледа.
 */
export function resolvePdfStyle(
  settings: PdfStyleSettings,
  logo: PdfLogo | null,
  fontRoot: string,
): ResolvedPdfStyle {
  const files = (key: PdfFontKey) => {
    const font = PDF_FONTS[key];
    return {
      regular: join(fontRoot, font.regular),
      bold: join(fontRoot, font.bold),
      mono: join(fontRoot, font.mono),
    };
  };
  let font: PdfFontKey = isFont(settings.font) ? settings.font : DEFAULT_PDF_STYLE.font;
  if (!Object.values(files(font)).every((path) => existsSync(path))) font = DEFAULT_PDF_STYLE.font;
  const accent =
    HEX.test(settings.accent) && contrastOnWhite(settings.accent) >= 4.5
      ? settings.accent
      : DEFAULT_PDF_STYLE.accent;
  return {
    font,
    template: isTemplate(settings.template) ? settings.template : DEFAULT_PDF_STYLE.template,
    accent,
    logoPosition: isPosition(settings.logoPosition)
      ? settings.logoPosition
      : DEFAULT_PDF_STYLE.logoPosition,
    fonts: files(font),
    logo,
  };
}

/** Изгледът на фирмата от базата (или подразбиращият се). */
export async function loadPdfStyle(organizationId: string | null): Promise<ResolvedPdfStyle> {
  const row = organizationId
    ? await prisma.pdfStyle.findUnique({ where: { organizationId } })
    : null;
  const logo =
    row?.logo && row.logoWidth && row.logoHeight
      ? { data: Buffer.from(row.logo), width: row.logoWidth, height: row.logoHeight }
      : null;
  return resolvePdfStyle(row ?? DEFAULT_PDF_STYLE, logo, config().PDF_FONT_ROOT);
}
