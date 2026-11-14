import QRCode from 'qrcode';
import { config } from '../config.js';

/**
 * Етикетът с QR на уредбата (собственикът, 12 ноември 2026 — точка C6): QR към страницата на картата в
 * портала — отваря я който я вижда (без вход — входът, после картата). Само адрес, нищо друго в кода:
 * етикетът виси в машинното и в кабината, да не носи данни.
 */
export const COPIE_ETICHETTA = [1, 3, 24] as const;
export type CopieEtichetta = (typeof COPIE_ETICHETTA)[number];

/** Колко етикета на листа: 24 (A4, 3 × 8 по 70 × 37 mm) по подразбиране. */
export function copieDi(value: unknown): CopieEtichetta {
  const n = Number(value);
  return (COPIE_ETICHETTA as readonly number[]).includes(n) ? (n as CopieEtichetta) : 24;
}

export const urlScheda = (id: string): string =>
  new URL(`/schede/${encodeURIComponent(id)}`, config().PUBLIC_BASE_URL).href;

/** QR като SVG (само черно, без поле — полето е на етикета). */
export function qrScheda(id: string): Promise<string> {
  return QRCode.toString(urlScheda(id), {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'Q',
    color: { dark: '#000000', light: '#ffffff' },
  });
}
