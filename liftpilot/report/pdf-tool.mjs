// @ts-check
// The PDF tool of the relazione tecnica di modifica (pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1), run only by
// src/lib/report/render.ts (runPdfTool) as `node --max-old-space-size=1024 report/pdf-tool.mjs inspect|assemble`: the
// manifest (JSON) on stdin names the files the server wrote into a fresh private directory; the answer is stdout.
//   inspect  — an uploaded file (PDF, JPEG, PNG) goes in memory through what assemble will do with it; stdout
//              {"ok":true,"pages":n} or {"ok":false,"reason":"encrypted"|"xfa"|"form"|"pages"|"pageSize"|"invalid"}.
//   assemble — the relazione's body (relazione.py, whose «Pagina k di N» already counts the attachments) and after it every
//              page of every attachment on a new A4 page in the body's frame, stamped like the body (pdf-place.mjs),
//              written to the manifest's `out` in the same directory; stdout {"ok":true,"bytes":n}. The same inputs give
//              the same bytes.
// An attachment's form is flattened first, then its pages are embedded as form XObjects: annotations, links, fields,
// actions and JavaScript stay behind. Exit code 0 with the answer, otherwise 1 and a line on stderr.
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFObjectCopier } from 'pdf-lib';
import { z } from 'zod';
import { MAX_DOC_CONTENT, MAX_PAGE_CONTENT, MM, barePage, drawPlaced, exifTurn, layout, pageContent, scrubActions, stamp, uprightMatrix } from './pdf-place.mjs';
import { embedPngPass, pngDataComplete, pngPlan } from './png-pass.mjs';

// pdf-lib speaks on the console (XFA removed, …): never on stdout, which carries the answer
console.log = console.info = console.warn = (...args) => { process.stderr.write(`${args.join(' ')}\n`); };

const fileName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}\.(pdf|jpg|png)$/);
const fileType = z.enum(['pdf', 'jpeg', 'png']);
const dir = z.string().min(2).refine((d) => path.isAbsolute(d), 'absolute');
const line = z.string().max(400).regex(/^\P{Cc}*$/u, 'one line');

const inspectManifest = z.object({
  dir, file: fileName, type: fileType,
  limits: z.object({
    maxPages: z.number().int().min(1).max(1000),
    minSideMm: z.number().positive(), maxSideMm: z.number().positive(), maxShortSideMm: z.number().positive(),
    maxPixels: z.number().int().positive(), maxSidePx: z.number().int().positive(),
  }).strict(),
}).strict();

const assembleManifest = z.object({
  dir, body: fileName, out: fileName, header: line, code: line.optional(), notice: line.optional(),
  info: z.object({ title: line, author: line, subject: line, created: z.string().datetime() }).strict(),
  extraPages: z.number().int().min(0).max(2000),
  attachments: z.array(z.object({
    file: fileName, type: fileType, orientation: z.number().int().min(1).max(8).nullable().optional(),
    pages: z.number().int().min(1).max(1000), footer: line,
  }).strict()).max(100),
}).strict();

const ENCRYPT = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/;

/** A file refused for a reason the user can act on. */
class Refused extends Error {
  /** @param {'encrypted' | 'xfa' | 'form' | 'pages' | 'pageSize' | 'invalid'} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** A file of the manifest in a buffer of its own: a small file read by Node may sit at an offset of a shared pool, and
 *  pdf-lib's JPEG reader looks at the whole underlying ArrayBuffer.
 * @param {string} d @param {string} name */
const read = (d, name) => new Uint8Array(readFileSync(path.join(d, name)));

/**
 * An attachment's PDF ready to embed: loaded (an encrypted one is refused), its form flattened (an XFA form, or one
 * pdf-lib cannot flatten, is refused), each page bare and every action emptied (pdf-place.mjs), so that what
 * embedding copies into the fascicolo is the drawing only. No page, or more than `maxPages`, is refused before any work.
 * @param {Uint8Array} bytes
 * @param {number} maxPages
 */
async function openAttachment(bytes, maxPages) {
  // pdf-lib's own refusal (EncryptedPDFError) is not an instance of its class once compiled: the document says whether
  // it is encrypted, and a file whose structure the encryption hides still names its /Encrypt dictionary
  /** @type {PDFDocument} */
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    throw new Refused(ENCRYPT.test(Buffer.from(bytes).toString('latin1')) ? 'encrypted' : 'invalid');
  }
  if (doc.isEncrypted) throw new Refused('encrypted');
  if (doc.getPageCount() === 0) throw new Refused('invalid');
  if (doc.getPageCount() > maxPages) throw new Refused('pages');
  const acroForm = doc.catalog.getAcroForm();
  if (acroForm?.dict.has(PDFName.of('XFA'))) throw new Refused('xfa');
  if (acroForm) {
    try {
      doc.getForm().flatten();
    } catch {
      throw new Refused('form');
    }
  }
  // what embedding will decode: one Flate or none per stream, 64 MiB a page, 256 MiB the whole attachment
  let budget = MAX_DOC_CONTENT;
  for (const page of doc.getPages()) {
    const content = page.node.Contents() ? pageContent(page, Math.min(MAX_PAGE_CONTENT, budget)) : new Uint8Array(0);
    if (!content) throw new Refused('invalid');
    budget -= content.length;
    barePage(page);
  }
  scrubActions(doc);
  return doc;
}

/**
 * Every page of a PDF on new pages of `out`, upright and in the frame; `onPage` stamps each (index from 0). Each page
 * becomes a form XObject of its decoded content (as pdf-lib's embedPage makes it) with its resources copied by ONE copier
 * for the whole attachment: what its pages share (a letterhead, a font) is copied once, and nothing else of the page —
 * its stored content streams included — reaches the fascicolo.
 * @param {PDFDocument} out
 * @param {PDFDocument} src
 * @param {(page: import('pdf-lib').PDFPage, i: number) => void} onPage
 */
function placePdf(out, src, onPage) {
  const copy = PDFObjectCopier.for(src.context, out.context).copy;
  const pages = src.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const box = page.getCropBox(), turn = page.getRotation().angle;
    const quarter = ((turn % 180) + 180) % 180 === 90;
    const at = layout(quarter ? box.height : box.width, quarter ? box.width : box.height, false);
    const target = out.addPage(at.size);
    if (page.node.Contents()) {
      const content = pageContent(page, MAX_PAGE_CONTENT);
      if (!content) throw new Error(`page ${i + 1}: content refused`);
      const resources = page.node.Resources();
      const form = out.context.flateStream(content, {
        Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [box.x, box.y, box.x + box.width, box.y + box.height], Matrix: [1, 0, 0, 1, -box.x, -box.y],
        ...(resources ? { Resources: copy(resources) } : {}),
      });
      const name = target.node.newXObject('Allegato', out.context.register(form));
      drawPlaced(target, name, uprightMatrix(box.width, box.height, turn, false), at);
    }
    onPage(target, i);
  }
}

/**
 * A picture on a new page of `out`, upright by its EXIF orientation and fitted to the frame.
 * @param {PDFDocument} out
 * @param {Uint8Array} bytes
 * @param {'jpeg' | 'png'} type
 * @param {number | null | undefined} orientation
 */
async function placePicture(out, bytes, type, orientation) {
  // a PNG pdf-lib would decode, unless its data say the same as a PDF image (png-pass.mjs)
  const plan = type === 'png' ? pngPlan(bytes) : null;
  const image = plan?.pass ? embedPngPass(out, plan) : type === 'jpeg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
  const { turn, mirror } = exifTurn(orientation);
  const quarter = turn === 90 || turn === 270;
  const at = layout(quarter ? image.height : image.width, quarter ? image.width : image.height, true);
  const target = out.addPage(at.size);
  const [a, b, c, d, e, f] = uprightMatrix(image.width, image.height, turn, mirror);
  // the image XObject fills the unit square: its pixels first, then the turn
  drawPlaced(target, target.node.newXObject('Foto', image.ref), [a * image.width, b * image.width, c * image.height, d * image.height, e, f], at);
  return target;
}

/** @param {Uint8Array} bytes  PNG width × height from IHDR, before anything decodes the pixels */
const pngSize = (bytes) => (bytes.length >= 24 ? { w: Buffer.from(bytes).readUInt32BE(16), h: Buffer.from(bytes).readUInt32BE(20) } : null);

/** What one attachment may weigh in the fascicolo, against its stored size: twice it and 4 MiB — so a fascicolo stays
 *  bounded by its files' (at most 120 MiB) whatever they hold. */
const placedLimit = (/** @type {number} */ size) => 2 * size + 4 * 1024 * 1024;

/** @param {z.infer<typeof inspectManifest>} m */
async function inspect(m) {
  const bytes = read(m.dir, m.file), L = m.limits;
  try {
    const scratch = await PDFDocument.create({ updateMetadata: false });
    /** @param {number} pages */
    const placed = async (pages) => {
      const saved = await scratch.save({ useObjectStreams: false });
      if (saved.length > placedLimit(bytes.length)) throw new Refused('invalid');
      return { ok: true, pages };
    };
    if (m.type === 'pdf') {
      const doc = await openAttachment(bytes, L.maxPages);
      const pages = doc.getPages();
      for (const page of pages) {
        const { width, height } = page.getCropBox();
        const short = Math.min(width, height) / MM, long = Math.max(width, height) / MM;
        // half a millimetre of slack: the sizes are written in points, rounded
        if (short < L.minSideMm - 0.5 || long > L.maxSideMm + 0.5 || short > L.maxShortSideMm + 0.5) throw new Refused('pageSize');
      }
      placePdf(scratch, doc, () => {});
      return await placed(pages.length);
    }
    const size = m.type === 'png' ? pngSize(bytes) : null;
    if (size && (size.w * size.h > L.maxPixels || Math.max(size.w, size.h) > L.maxSidePx)) throw new Refused('invalid');
    // a PNG passed through: its data must be the rows its header says, as a viewer will decode them
    const plan = m.type === 'png' ? pngPlan(bytes) : null;
    if (m.type === 'png' && (!plan || (plan.pass && !(await pngDataComplete(plan))))) throw new Refused('invalid');
    await placePicture(scratch, bytes, m.type, 1);
    return await placed(1);
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason };
    process.stderr.write(`pdf-tool inspect: ${e instanceof Error ? e.message : String(e)}\n`);
    return { ok: false, reason: 'invalid' };
  }
}

/** @param {z.infer<typeof assembleManifest>} m */
async function assemble(m) {
  const declared = m.attachments.reduce((s, a) => s + a.pages, 0);
  if (declared !== m.extraPages) throw new Error(`the attachments declare ${declared} pages, the body counts ${m.extraPages}`);
  const out = await PDFDocument.load(read(m.dir, m.body), { updateMetadata: false });
  const body = out.getPageCount(), total = body + m.extraPages;
  out.registerFontkit(fontkit);
  const fontDir = process.env.REPORT_FONT_DIR || '/usr/share/fonts/truetype/dejavu';
  const font = await out.embedFont(readFileSync(path.join(fontDir, 'DejaVuSans.ttf')), { subset: true });
  let pageNo = body;
  for (const [n, a] of m.attachments.entries()) {
    const bytes = read(m.dir, a.file);
    /** @param {import('pdf-lib').PDFPage} page @param {number} i */
    const onPage = (page, i) => {
      pageNo += 1;
      const footer = a.footer.replaceAll('{i}', String(i + 1)).replaceAll('{m}', String(a.pages));
      stamp(page, font, { header: m.header, pageNo, total, footer, code: m.code, notice: m.notice });
    };
    if (a.type === 'pdf') {
      const src = await openAttachment(bytes, a.pages);
      if (src.getPageCount() !== a.pages) throw new Error(`attachment ${n + 1}: ${src.getPageCount()} pages, ${a.pages} declared`);
      placePdf(out, src, onPage);
    } else {
      if (a.pages !== 1) throw new Error(`attachment ${n + 1}: a picture is one page`);
      onPage(await placePicture(out, bytes, a.type, a.orientation), 0);
    }
  }
  const created = new Date(m.info.created);
  out.setTitle(m.info.title);
  out.setAuthor(m.info.author);
  out.setSubject(m.info.subject);
  out.setCreator('LiftPilot · Carbon Stealth VCC');
  out.setProducer('LiftPilot · pdf-lib');
  out.setCreationDate(created);
  out.setModificationDate(created);
  out.setLanguage('it-IT');
  // into the private directory, not through a pipe: the server streams the file to the download, never holds it
  const pdf = await out.save({ useObjectStreams: false, addDefaultPage: false });
  writeFileSync(path.join(m.dir, m.out), pdf, { mode: 0o600, flag: 'wx' });
  return { ok: true, bytes: pdf.length };
}

/** @returns {Promise<string>} */
async function stdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1 << 20) throw new Error('manifest too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const command = process.argv[2], manifest = JSON.parse(await stdin());
  if (command === 'inspect') process.stdout.write(JSON.stringify(await inspect(inspectManifest.parse(manifest))));
  else if (command === 'assemble') process.stdout.write(JSON.stringify(await assemble(assembleManifest.parse(manifest))));
  else throw new Error('usage: pdf-tool.mjs inspect|assemble');
}

main().catch((e) => {
  process.stderr.write(`pdf-tool: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
