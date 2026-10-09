import { Buffer } from 'node:buffer';

/**
 * Фикстура за визуализатора на схеми: двустранен PDF с ВЕКТОРЕН чертеж (шини, контактори, клемен ред) и
 * текстови етикети K1, K2, X3:1…6, S12 — pdf.js ги намира в текстовия слой и ги подчертава.
 * Страница 842×595 (A4 по дължина). Само за тестове/демо; реални схеми на клиента — никога в репото.
 */

const W = 842;
const H = 595;

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const text = (x: number, y: number, size: number, s: string) =>
  `BT /F1 ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET\n`;
const box = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re S\n`;
const line = (x1: number, y1: number, x2: number, y2: number) => `${x1} ${y1} m ${x2} ${y2} l S\n`;

function pageOne(): string {
  let c = '1 w 0 G\n';
  c += text(
    40,
    560,
    14,
    'LTX-500 tav. 17 - Catena di sicurezza: contattori K1 e K2, morsettiera X3, pulsante S12',
  );
  c += text(40, 542, 9, 'Rev. C - il contatto porta di piano apre K1 e K2 in serie con la catena.');
  // Due binari di alimentazione
  c += line(40, 480, 800, 480) + line(40, 120, 800, 120);
  c += text(44, 486, 9, '24VDC') + text(44, 106, 9, '0V');
  // Contattori K1, K2
  for (const [i, label] of ['K1', 'K2'].entries()) {
    const x = 120 + i * 190;
    c += line(x + 30, 480, x + 30, 420) + box(x, 340, 60, 80) + line(x + 30, 340, x + 30, 120);
    c += text(x + 18, 372, 16, label);
    c += text(x + 66, 392, 8, i === 0 ? 'bobina 24V' : 'bobina 24V (ritardo)');
  }
  // Pulsante S12
  c += line(520, 480, 520, 400) + box(500, 330, 40, 70) + line(520, 330, 520, 120);
  c += text(546, 360, 16, 'S12');
  // Morsettiera X3
  c += box(600, 150, 190, 36);
  for (let k = 0; k < 6; k += 1) {
    const x = 600 + k * 31.67;
    c += line(x, 150, x, 186);
    c += text(x + 3, 192, 8, `X3:${k + 1}`);
  }
  c += line(631, 120, 631, 150) + line(663, 186, 663, 480);
  c += text(610, 135, 9, 'cavo encoder: X3:4');
  return c;
}

function pageTwo(): string {
  let c = '1 w 0 G\n';
  c += text(40, 560, 14, 'LTX-500 tav. 18 - Alimentazione ausiliaria e inverter');
  c += box(60, 300, 120, 80) + text(78, 336, 14, 'T1 24VDC');
  c += box(300, 300, 160, 80) + text(318, 336, 14, 'Inverter A2');
  c += line(180, 340, 300, 340) + text(200, 346, 8, 'F2 / X1:1');
  return c;
}

export function makeSchematicPdf(): Buffer {
  const streams = [pageOne(), pageTwo()];
  const objects: Array<string | Buffer> = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${streams.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${streams.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  streams.forEach((content, i) => {
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = Buffer.from(content, 'latin1');
  });
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  for (let k = 1; k < objects.length; k += 1) {
    offsets[k] = length;
    const o = objects[k] ?? '';
    const chunk =
      typeof o === 'string'
        ? Buffer.from(`${k} 0 obj\n${o}\nendobj\n`, 'latin1')
        : Buffer.concat([
            Buffer.from(`${k} 0 obj\n<< /Length ${o.length} >>\nstream\n`, 'latin1'),
            o,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ]);
    parts.push(chunk);
    length += chunk.length;
  }
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let k = 1; k < objects.length; k += 1) {
    xref += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}
