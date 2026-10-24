import { create } from "qrcode";

// QR код като SVG пътека — генерира се на НАШИЯ сървър от библиотеката qrcode.
// Без външни услуги: адресът, който се кодира, не излиза никъде.

export type QrEcc = "L" | "M" | "Q" | "H";

export type QrPath = {
  /** Страна на квадрата в модули, вкл. бялото поле наоколо. */
  size: number;
  /** SVG пътека на тъмните модули (за fill). */
  d: string;
};

// Тихото поле (бял кант) по стандарт е 4 модула — без него някои телефони не
// разчитат кода, особено от хартия.
export function qrPath(text: string, opts: { ecc?: QrEcc; margin?: number } = {}): QrPath {
  const margin = opts.margin ?? 4;
  const qr = create(text, { errorCorrectionLevel: opts.ecc ?? "Q" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!data[y * n + x]) {
        x++;
        continue;
      }
      // Сливаме съседните тъмни модули на реда в един правоъгълник — по-малък
      // SVG и без тънки бели линии между модулите при мащабиране.
      const start = x;
      while (x < n && data[y * n + x]) x++;
      const len = x - start;
      d += `M${start + margin} ${y + margin}h${len}v1h-${len}z`;
    }
  }
  return { size: n + margin * 2, d };
}
