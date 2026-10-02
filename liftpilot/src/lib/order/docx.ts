// A report model (src/lib/report/model.ts: the blocks report/relazione.py draws as a PDF) as a Word document (Office
// Open XML, ECMA-376): the same letterhead, headings, tables and notes, A4 with the PDF's margins, the header and footer
// with the page "N di M", in styles the reader can change; the views as pictures (report/raster.py paints them, the
// caller passes them in the order of the plan blocks). Pure: the same bytes in the browser and on the server; zip.ts
// packs it.
import { readLogo } from '@/lib/logo';
import type { BlockStatus, ReportBlock, ReportDoc } from '@/lib/report/model';
import { A_NS, IMAGE_REL, PIC_NS, WP_NS, fromBase64, pictures } from './docx-pic';
import { zipStore } from './zip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// A4 in twentieths of a point, the PDF's 16 mm margins; the text frame between them
const PAGE = { w: 11906, h: 16838, margin: 907 };
const FRAME = PAGE.w - 2 * PAGE.margin;
const INK = '121829', MUTED = '5A6480', RULE = 'D6DCE6', HEAD_BG = 'EEF1F6', WARN_BG = 'FBEFD9', HEAD_INK = '3B4A73';
const STATUS: Readonly<Record<Exclude<BlockStatus, ''>, string>> = { ok: '1F7A4A', warn: '8F5500', fail: 'B3261E', info: '3B4A73' };

/** A code point XML 1.0 allows in text. */
const xmlChar = (c: number): boolean => c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000;
/** XML text: escaped, without the characters XML 1.0 refuses. */
const esc = (s: string): string => Array.from(s).filter((ch) => xmlChar(ch.codePointAt(0) ?? 0)).join('')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// the engineering notation of the texts, as the PDF writes it: M_cw, η_d → subscripts; e^(f·α) → superscript
const NOTATION = /(?<=[A-Za-zΑ-Ωα-ω])_([A-Za-z0-9]+)|\^\(([^()]{1,24})\)/gu;

/** Runs of `text` with the run properties `rPr` (without its tags), line breaks and the notation kept. */
function runs(text: string, rPr = ''): string {
  const out: string[] = [];
  const run = (t: string, extra = ''): void => {
    if (!t) return;
    const lines = t.split('\n').map((l) => `<w:t xml:space="preserve">${esc(l)}</w:t>`).join('<w:br/>');
    out.push(`<w:r>${rPr || extra ? `<w:rPr>${rPr}${extra}</w:rPr>` : ''}${lines}</w:r>`);
  };
  let at = 0;
  for (const m of text.matchAll(NOTATION)) {
    run(text.slice(at, m.index));
    if (m[1] !== undefined) run(m[1], '<w:vertAlign w:val="subscript"/>');
    else run(m[2] ?? '', '<w:vertAlign w:val="superscript"/>');
    at = (m.index ?? 0) + m[0].length;
  }
  run(text.slice(at));
  return out.join('');
}

const para = (text: string, style: string | null, pPr = '', rPr = ''): string =>
  `<w:p>${style || pPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${pPr}</w:pPr>` : ''}${runs(text, rPr)}</w:p>`;

const border = (side: string, sz: number, color: string): string => `<w:${side} w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/>`;

/** A table of rows of cells (already paragraphs), the widths in twips; `head`: the first row repeats on each page. */
function table(widths: readonly number[], rows: readonly { cells: readonly string[]; head?: boolean }[], opts: { lines?: boolean; topLine?: boolean } = {}): string {
  const lines = opts.lines ?? true;
  // the table's borders: only the rules under the rows (the schema's order: tblW, tblBorders, tblLayout, tblCellMar)
  const borders = lines ? `<w:tblBorders>${border('bottom', 3, RULE)}${border('insideH', 3, RULE)}</w:tblBorders>` : '';
  const grid = widths.map((w) => `<w:gridCol w:w="${Math.round(w)}"/>`).join('');
  const tr = rows.map((r) => `<w:tr>${r.head ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${r.cells.map((c, j) => {
    const shd = r.head ? `<w:shd w:val="clear" w:color="auto" w:fill="${HEAD_BG}"/>` : '';
    const top = opts.topLine ? `<w:tcBorders>${border('top', 6, INK)}</w:tcBorders>` : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${Math.round(widths[j] ?? 0)}" w:type="dxa"/>${top}${shd}</w:tcPr>${c}</w:tc>`;
  }).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(widths.reduce((s, w) => s + w, 0))}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/>`
    + '<w:tblCellMar><w:top w:w="45" w:type="dxa"/><w:left w:w="45" w:type="dxa"/><w:bottom w:w="45" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
    + `</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${tr}</w:tbl>`;
}

/** A spacer paragraph after a table, so two tables in a row do not merge. */
const gap = (pt: number): string => `<w:p><w:pPr><w:spacing w:before="0" w:after="${pt * 20}"/><w:rPr><w:sz w:val="4"/></w:rPr></w:pPr></w:p>`;

/** The letterhead's logo box [mm]. */
const LOGO_BOX = { w: 42, h: 16 };

/** The writer of the blocks: pictures added as they come (`views`: the PNG of each plan block, in their order). */
function blocks(doc: ReportDoc, views: readonly Uint8Array[], pics: ReturnType<typeof pictures>): (b: ReportBlock) => string {
  let view = 0;
  const logo = (): string => {
    const img = doc.drawing?.images.logo, data = img ? fromBase64(img.data) : null, info = data ? readLogo(data) : null;
    if (!data || !info) return '';
    const k = Math.min(LOGO_BOX.w / info.width, LOGO_BOX.h / info.height);
    return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>${pics.inline(data, info.mime, info.width * k, info.height * k, 'Logo')}</w:p>`;
  };
  return (b) => {
    switch (b.t) {
      case 'h1': return para(b.text, 'Title');
      case 'sub': return para(b.text, 'Subtitle');
      case 'h2': return para(b.text, 'Heading2');
      case 'h3': return para(b.text, 'Heading3');
      case 'p': return para(b.text, b.style === 'note' ? 'Note' : null);
      case 'box': return para(b.text, 'Box');
      case 'list': return b.items.map((x) => para(`•\t${x}`, 'ListItem')).join('');
      case 'verdict': return para(b.text, 'Verdict', '', b.status ? `<w:color w:val="${STATUS[b.status]}"/>` : '');
      case 'kv': return table([FRAME * 0.34, FRAME * 0.66], b.rows.map(([k, v]) => ({ cells: [para(k, 'CellKey'), para(v, 'Cell')] }))) + gap(4);
      case 'grid': {
        const n = b.head.length, align = b.align ?? ['l', ...Array<'r'>(Math.max(0, n - 1)).fill('r')];
        const widths = b.widths ? b.widths.map((w) => FRAME * w) : n > 1 ? [FRAME * 0.34, ...Array<number>(n - 1).fill((FRAME * 0.66) / (n - 1))] : [FRAME];
        const right = (j: number): string => (align[j] === 'r' ? '<w:jc w:val="right"/>' : '');
        const scol = b.statusCol ?? n - 1, st = b.status ?? [];
        return table(widths, [
          { head: true, cells: b.head.map((h, j) => para(h, 'CellHead', right(j))) },
          ...b.rows.map((row, i) => ({
            cells: row.map((c, j) => {
              const s = st[i];
              return para(c, 'Cell', right(j), j === scol && s ? `<w:b/><w:color w:val="${STATUS[s]}"/>` : '');
            }),
          })),
        ]) + gap(4);
      }
      case 'sign': {
        const w = [0.46, 0.3, 0.24].map((x) => FRAME * x);
        return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="1250" w:after="0"/></w:pPr></w:p>${table(w, [{ cells: b.labels.map((l) => para(l, 'Note')) }], { lines: false, topLine: true })}`;
      }
      case 'letterhead': {
        const from = (b.logo ? logo() : '') + b.from.map((l, i) => para(l, i === 0 ? 'LetterName' : 'Note')).join('');
        const to = b.to.map((l, i) => para(l, i === 1 ? 'LetterName' : 'Cell')).join('');
        return table([FRAME * 0.56, FRAME * 0.44], [{ cells: [from, to] }], { lines: false }) + gap(14);
      }
      case 'plan': {
        const png = views[view++];
        if (!png) return para(`[${b.scale}: disegno nel PDF]`, 'Note');
        return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="60" w:after="20"/><w:jc w:val="center"/></w:pPr>${pics.inline(png, 'image/png', b.w, b.h, b.scale)}</w:p>`
          + para(b.scale, 'Note', '<w:jc w:val="right"/>');
      }
    }
  };
}

const style = (id: string, name: string, pPr: string, rPr: string, extra = ''): string =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;

const STYLES = `${XML}<w:styles xmlns:w="${W_NS}">`
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>'
  + `<w:color w:val="${INK}"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault>`
  + '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + style('Title', 'Title', '<w:spacing w:after="40"/>', '<w:b/><w:sz w:val="31"/><w:szCs w:val="31"/>')
  + style('Subtitle', 'Subtitle', '<w:spacing w:after="160"/>', `<w:color w:val="${MUTED}"/>`)
  + style('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="220" w:after="70"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="22"/><w:szCs w:val="22"/>')
  + style('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="2"/>', '<w:b/>')
  + style('Note', 'Note', '', `<w:color w:val="${MUTED}"/><w:sz w:val="16"/><w:szCs w:val="16"/>`)
  + style('Box', 'Box', `<w:pBdr>${border('left', 18, STATUS.warn).replace('w:space="0"', 'w:space="6"')}</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${WARN_BG}"/><w:spacing w:before="80" w:after="120"/><w:ind w:left="140" w:right="140"/>`,
    '<w:color w:val="6B4000"/><w:sz w:val="17"/><w:szCs w:val="17"/>')
  + style('ListItem', 'List item', '<w:tabs><w:tab w:val="left" w:pos="227"/></w:tabs><w:ind w:left="227" w:hanging="227"/>', '')
  + style('Verdict', 'Verdict', '<w:spacing w:before="80"/>', '<w:b/><w:sz w:val="22"/><w:szCs w:val="22"/>')
  + style('Cell', 'Table text', '<w:spacing w:after="0"/>', '<w:sz w:val="16"/><w:szCs w:val="16"/>')
  + style('LetterName', 'Letterhead name', '<w:spacing w:after="20"/>', '<w:b/><w:sz w:val="20"/><w:szCs w:val="20"/>')
  + style('CellKey', 'Table key', '<w:spacing w:after="0"/>', `<w:color w:val="${MUTED}"/><w:sz w:val="16"/><w:szCs w:val="16"/>`)
  + style('CellHead', 'Table head', '<w:keepNext/><w:spacing w:after="0"/>', `<w:b/><w:color w:val="${HEAD_INK}"/><w:sz w:val="16"/><w:szCs w:val="16"/>`)
  + style('PageBand', 'Page band', `<w:tabs><w:tab w:val="right" w:pos="${FRAME}"/></w:tabs><w:spacing w:after="0"/>`, `<w:color w:val="${MUTED}"/><w:sz w:val="14"/><w:szCs w:val="14"/>`)
  + '</w:styles>';

const field = (instr: string): string => `<w:fldSimple w:instr=" ${instr} "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;

/** The document of `doc` as a .docx, dated `when`; `views`: the PNG of each plan block, in their order. */
export function toDocx(doc: ReportDoc, when: Date, views: readonly Uint8Array[] = []): Uint8Array {
  const m = doc.meta, iso = when.toISOString().replace(/\.\d{3}Z$/, 'Z'), pics = pictures(esc);
  // the body ends on a paragraph, as Word writes it
  const body = `${doc.blocks.map(blocks(doc, views, pics)).join('')}<w:p/>`;
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/>`
    + `<w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="964" w:right="${PAGE.margin}" w:bottom="964" w:left="${PAGE.margin}" w:header="454" w:footer="340" w:gutter="0"/></w:sectPr>`;
  const document = `${XML}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}"><w:body>${body}${sect}</w:body></w:document>`;
  const header = `${XML}<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="PageBand"/><w:pBdr>${border('bottom', 3, RULE)}</w:pBdr></w:pPr>`
    + `${runs(m.header)}<w:r><w:tab/><w:t xml:space="preserve">Pagina </w:t></w:r>${field('PAGE')}<w:r><w:t xml:space="preserve"> di </w:t></w:r>${field('NUMPAGES')}</w:p></w:hdr>`;
  const footer = `${XML}<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="PageBand"/><w:pBdr>${border('top', 3, RULE)}</w:pBdr></w:pPr>`
    + `${runs(m.footer)}<w:r><w:tab/><w:t xml:space="preserve">Created and Designed by Carbon Stealth VCC · carbonstealth.eu</w:t></w:r></w:p>`
    + `<w:p><w:pPr><w:pStyle w:val="PageBand"/></w:pPr>${runs(m.code)}</w:p></w:ftr>`;
  const settings = `${XML}<w:settings xmlns:w="${W_NS}"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>`
    + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" `
    + 'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${esc(m.title)}</dc:title><dc:subject>${esc(m.subject)}</dc:subject><dc:creator>${esc(m.author)}</dc:creator><dc:language>it-IT</dc:language>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LiftPilot · Carbon Stealth VCC</Application></Properties>`;
  const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const rel = (id: string, type: string, target: string): string => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  const rels = `${XML}<Relationships xmlns="${PKG_REL}">${rel('rId1', `${OFFICE_REL}/officeDocument`, 'word/document.xml')}`
    + `${rel('rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml')}`
    + `${rel('rId3', `${OFFICE_REL}/extended-properties`, 'docProps/app.xml')}</Relationships>`;
  const docRels = `${XML}<Relationships xmlns="${PKG_REL}">${rel('rId1', `${OFFICE_REL}/styles`, 'styles.xml')}${rel('rId2', `${OFFICE_REL}/settings`, 'settings.xml')}`
    + `${rel('rId3', `${OFFICE_REL}/header`, 'header1.xml')}${rel('rId4', `${OFFICE_REL}/footer`, 'footer1.xml')}`
    + `${pics.media.map((x) => rel(x.rel, IMAGE_REL, x.name)).join('')}</Relationships>`;
  const enc = new TextEncoder(), part = (name: string, xml: string) => ({ name, data: enc.encode(xml) });
  return zipStore([
    part('[Content_Types].xml', types), part('_rels/.rels', rels), part('word/document.xml', document), part('word/_rels/document.xml.rels', docRels),
    part('word/styles.xml', STYLES), part('word/settings.xml', settings), part('word/header1.xml', header), part('word/footer1.xml', footer),
    part('docProps/core.xml', core), part('docProps/app.xml', app), ...pics.media.map((x) => ({ name: `word/${x.name}`, data: x.data })),
  ], when);
}
