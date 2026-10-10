import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Фикстури за разбора на файлове (§4.1): ZIP с пълен контрол над заглавките (за враждебните
 * случаи — излъган размер, застъпване, шифроване, ZIP64), минимални DOCX/XLSX от XML и PNG
 * заглавка с произволен размер. Нищо бинарно в репото — всичко се сглобява в теста.
 */

export interface RawEntry {
  name: string;
  data: Buffer | string;
  method?: 0 | 8;
  /** Излъган размер в централната директория (бомба). */
  declaredSize?: number;
  crc?: number;
  flags?: number;
  /** Сочи данните на друг запис (застъпване): индексът му. */
  overlapWith?: number;
}

export function buildZip(entries: readonly RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const crc = e.crc ?? crc32(raw);
    const size = e.declaredSize ?? raw.length;
    const flags = (e.flags ?? 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const at = e.overlapWith !== undefined ? (offsets[e.overlapWith] ?? 0) : offset;
    offsets.push(at);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(at, 42);
    centrals.push(central, name);
    if (e.overlapWith === undefined) {
      locals.push(local, name, body);
      offset += local.length + name.length + body.length;
    }
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type DocxBlock =
  { style?: string; text: string } | { table: ReadonlyArray<readonly string[]> };

const CONTENT_TYPES_DOCX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Стиловете: ID-тата са италиански (Titolo1/2), имената — вградените английски (като в Word). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Titolo1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Titolo2"><w:name w:val="heading 2"/></w:style>
<w:style w:type="paragraph" w:styleId="Titolo3"><w:name w:val="heading 3"/></w:style>
</w:styles>`;

export function docxXml(blocks: readonly DocxBlock[]): string {
  const body = blocks
    .map((b) => {
      if ('table' in b) {
        const rows = b.table
          .map(
            (r) =>
              `<w:tr>${r.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`,
          )
          .join('');
        return `<w:tbl>${rows}</w:tbl>`;
      }
      const style = b.style ? `<w:pPr><w:pStyle w:val="${b.style}"/></w:pPr>` : '';
      return `<w:p>${style}<w:r><w:t xml:space="preserve">${esc(b.text)}</w:t></w:r></w:p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

export function makeDocx(blocks: readonly DocxBlock[], extra: RawEntry[] = []): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_DOCX },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/document.xml', data: docxXml(blocks) },
    ...extra,
  ]);
}

export interface SheetSpec {
  name: string;
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>;
  hidden?: boolean;
  /** Клетки с дата (по адрес, напр. „B2“) — числото е сериен номер, стилът е дата. */
  dates?: readonly string[];
}

const col = (i: number): string => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** XLSX: низовете — в sharedStrings (първият лист) и inline (другите), числа, булеви, дати. */
export function makeXlsx(sheets: readonly SheetSpec[], opts: { date1904?: boolean } = {}): Buffer {
  const shared: string[] = [];
  const sheetXml = sheets.map((sheet, si) => {
    const rows = sheet.rows
      .map((row, ri) => {
        const cells = row
          .map((v, ci) => {
            if (v === null || v === '') return '';
            const ref = `${col(ci)}${ri + 1}`;
            if (typeof v === 'number') {
              const style = sheet.dates?.includes(ref) ? ' s="1"' : '';
              return `<c r="${ref}"${style}><v>${v}</v></c>`;
            }
            if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
            if (si === 0) {
              shared.push(v);
              return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join('');
        return `<row r="${ri + 1}">${cells}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr${opts.date1904 ? ' date1904="1"' : ''}/>
<sheets>${sheets
    .map(
      (s, i) =>
        `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? ' state="hidden"' : ''}/>`,
    )
    .join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;
  const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join('')}</sst>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`;
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: rels },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/styles.xml', data: styles },
    ...sheetXml.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
  ]);
}

/** PNG заглавка с произволен размер (без пиксели) — за таваните преди OCR. */
export function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
