import QRCode from 'qrcode';

/**
 * QR като SVG низ (пакетът `qrcode`, като в korpora): за TOTP (otpauth://) и етикета на таблото.
 * UI го показва през <img src="data:image/svg+xml,…"> — не като вграден HTML.
 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
