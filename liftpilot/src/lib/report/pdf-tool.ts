import 'server-only';
// The typed side of report/pdf-tool.mjs (run by runPdfTool in the renderers' slots): what an uploaded file is worth to
// the fascicolo (inspect) and the fascicolo itself (assemble). The tool's limits live here and travel in its manifest;
// its answer is checked with zod before anyone reads it.
import { z } from 'zod';
import { RendererBusy, assembleToFile, runPdfTool, type ToolFile, type ToolOutput } from './render';

/** What an uploaded file may be: the database refuses more than 200 pages (CHECK on Attachment.pages); a page side
 *  between 50 mm and A0 (841 × 1189 mm); a PNG up to 40 megapixels and 12 000 px a side (read from its header before
 *  anything decodes it). */
export const PDF_TOOL_LIMITS = { maxPages: 200, minSideMm: 50, maxSideMm: 1189, maxShortSideMm: 841, maxPixels: 40_000_000, maxSidePx: 12_000 } as const;
/** What one fascicolo may append: 40 files, 400 pages (plan §13). */
export const FASCICOLO_LIMITS = { maxAttachments: 40, maxPages: 400 } as const;

export type AttachmentType = 'pdf' | 'jpeg' | 'png';
const EXT: Record<AttachmentType, string> = { pdf: 'pdf', jpeg: 'jpg', png: 'png' };

/** Why a file cannot go into a fascicolo: protected, an XFA form, a form that cannot be flattened, too many pages, a
 *  page too small or too large, or not readable at all (also a file that crashes or outlasts the tool). */
export type InspectRefusal = 'encrypted' | 'xfa' | 'form' | 'pages' | 'pageSize' | 'invalid';
export type Inspection = { ok: true; pages: number } | { ok: false; reason: InspectRefusal; detail?: string };

const inspectionSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), pages: z.number().int().min(1).max(PDF_TOOL_LIMITS.maxPages) }).strict(),
  z.object({ ok: z.literal(false), reason: z.enum(['encrypted', 'xfa', 'form', 'pages', 'pageSize', 'invalid']) }).strict(),
]);

/**
 * An uploaded file put through what the fascicolo will do with it (in memory, nothing kept): its pages, or why it is
 * refused. A busy renderer throws RendererBusy (the route answers 503); a tool that fails, overruns or answers nonsense
 * refuses the file as 'invalid', with the reason in `detail` for the log.
 */
export async function inspectFile(data: Uint8Array, type: AttachmentType): Promise<Inspection> {
  const file = `upload.${EXT[type]}`;
  let out: Buffer;
  try {
    out = await runPdfTool('inspect', { file, type, limits: PDF_TOOL_LIMITS }, { [file]: data });
  } catch (e) {
    if (e instanceof RendererBusy) throw e;
    return { ok: false, reason: 'invalid', detail: e instanceof Error ? e.message.slice(0, 300) : 'pdf tool failed' };
  }
  let answer: unknown;
  try {
    answer = JSON.parse(out.toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid', detail: 'pdf tool: not JSON' };
  }
  const parsed = inspectionSchema.safeParse(answer);
  return parsed.success ? parsed.data : { ok: false, reason: 'invalid', detail: 'pdf tool: unexpected answer' };
}

export interface FascicoloAttachment {
  /** its bytes as stored, whole or read a slice at a time (written to the tool's directory inside the renderer's slot) */
  data: ToolFile;
  type: AttachmentType;
  /** JPEG EXIF orientation 1..8 read at upload (the stored copy has no metadata); null or absent: as stored */
  orientation?: number | null;
  /** pages as stored at upload (1 for a picture): the tool refuses a file whose pages differ */
  pages: number;
  /** the first footer line of each of its pages, `{i}` its page and `{m}` its pages: «Allegato 3 — … (p. {i}/{m}) · SHA-256 …» */
  footer: string;
}

export interface FascicoloInput {
  /** the body as relazione.py drew it with meta.extraPages = the attachments' pages */
  body: Uint8Array;
  /** the body's meta.header and code, and the appended pages' notice, in the places of the body's lines */
  header: string;
  code?: string;
  notice?: string;
  /** the PDF's information, dated as the record */
  info: { title: string; author: string; subject: string; created: Date };
  attachments: readonly FascicoloAttachment[];
}

/** The pages a fascicolo appends after its body: what relazione.py's meta.extraPages must say. */
export const appendedPages = (attachments: readonly Pick<FascicoloAttachment, 'pages'>[]): number =>
  attachments.reduce((s, a) => s + a.pages, 0);

/** One line for the tool's manifest: a control character (a tab pasted into a name, U+0085) becomes a space — the
 *  record keeps what was typed, the pages print it on one line (the tool refuses any \p{Cc}). */
export const oneLine = (s: string): string => s.replace(/\p{Cc}+/gu, ' ');

/**
 * The fascicolo into an open file (render.ts assembleToFile): the body, then every page of every attachment in its order
 * on an A4 page of its orientation, stamped «Pagina k di N» and with its footer. Deterministic (the same inputs, the same
 * bytes). Throws RendererBusy when the renderers are busy, and an Error past the limits or when the tool fails.
 */
export function assembleFascicoloFile(input: FascicoloInput): Promise<ToolOutput> {
  const extraPages = appendedPages(input.attachments);
  if (input.attachments.length > FASCICOLO_LIMITS.maxAttachments || extraPages > FASCICOLO_LIMITS.maxPages) {
    return Promise.reject(new Error(`fascicolo: ${input.attachments.length} files and ${extraPages} pages exceed the limits`));
  }
  const files: Record<string, ToolFile> = { 'body.pdf': input.body };
  const attachments = input.attachments.map((a, i) => {
    const file = `a${String(i + 1).padStart(2, '0')}.${EXT[a.type]}`;
    files[file] = a.data;
    return { file, type: a.type, orientation: a.orientation ?? null, pages: a.pages, footer: oneLine(a.footer) };
  });
  const info = input.info;
  return assembleToFile({
    body: 'body.pdf', header: oneLine(input.header), code: input.code === undefined ? undefined : oneLine(input.code),
    notice: input.notice === undefined ? undefined : oneLine(input.notice),
    info: { title: oneLine(info.title), author: oneLine(info.author), subject: oneLine(info.subject), created: info.created.toISOString() }, extraPages, attachments,
  }, files);
}

/** The fascicolo as bytes (the tests, small RTs): assembleFascicoloFile read whole. */
export async function assembleFascicolo(input: FascicoloInput): Promise<Buffer> {
  const out = await assembleFascicoloFile(input);
  try {
    return await out.handle.readFile();
  } finally {
    await out.handle.close();
  }
}
