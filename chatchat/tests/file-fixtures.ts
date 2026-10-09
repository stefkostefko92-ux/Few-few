/**
 * Фикстури за прикачените файлове. Минимален валиден PDF (без зависимост): по страница списък
 * от абзаци, редовете в абзаца — с „\n“. Шрифт Helvetica с WinAnsiEncoding (латиница с
 * ударения). Празна страница = „сканирана“ (без текстов слой).
 */

const escapePdf = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pages: ReadonlyArray<readonly string[]>): Buffer {
  const objects: Array<string | Buffer> = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((paragraphs, i) => {
    let content = '';
    let y = 780;
    for (const paragraph of paragraphs) {
      for (const line of paragraph.split('\n')) {
        content += `BT /F1 11 Tf 72 ${y} Td (${escapePdf(line)}) Tj ET\n`;
        y -= 14;
      }
      y -= 20;
    }
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = Buffer.from(content, 'latin1');
  });

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
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

/** EICAR — стандартният безвреден тестов „вирус“, сглобен в runtime (не стои цял в репото). */
export const EICAR = [
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
].join('');

/** Най-малките валидни заглавки на поддържаните формати (останалото е пълнеж). */
export const MAGIC = {
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]),
  png: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(60, 2),
  ]),
  webp: Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x40, 0, 0, 0]),
    Buffer.from('WEBPVP8 ', 'latin1'),
    Buffer.alloc(48, 3),
  ]),
  heic: Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypheic', 'latin1'),
    Buffer.alloc(52, 4),
  ]),
  heif: Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypmif1', 'latin1'),
    Buffer.alloc(52, 5),
  ]),
  /** Изпълним файл на Windows („MZ“) — трябва да бъде отказан, каквото и да е името. */
  exe: Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(62, 0x90)]),
} as const;
