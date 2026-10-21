import 'server-only';
// POST /api/projects/[id]/allegati (round 49, plan §6.1): a file uploaded for an installation, as a route handler — a
// server action takes at most 1 MB. In order, each step before any costlier one: the request comes from the
// application's own pages (Origin = PUBLIC_BASE_URL), the session, the right ('projects:edit': not a Commerciale, not
// a read-only company), the installation's id, 60 uploads an hour per user, the declared size, the installation (of
// the company, not archived), a free reading slot; then the body is read with a byte counter (stopped past 20 MiB +
// the envelope, whatever Content-Length said), its form parsed, the file recognised by its bytes and its metadata
// removed (src/lib/allegati), the same bytes on the installation answered with the row already there, the file put
// through the PDF tool (pages, protection, forms), and stored within the limits under the company's lock (quota.ts).
// Every answer is JSON — { ok: true, duplicate, attachment } or { ok: false, error } with an errors.* key — never cached.
import { createHash } from 'node:crypto';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { publicBaseUrl } from '@/lib/env';
import { ALLEGATI_LIMITS, MAX_BODY_BYTES, MAX_FILE_BYTES } from '@/lib/allegati/limits';
import { cleanFileName, titleFromName, uploadMetaSchema } from '@/lib/allegati/kinds';
import { prepareFile } from '@/lib/allegati/strip';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { RendererBusy } from '@/lib/report/render';
import { sameOriginPost } from '@/lib/same-origin';
import { idSchema } from '@/lib/schemas';
import { inspectUpload } from './inspect';
import { existing, storeAttachment } from './quota';
import { uploadTarget, viewOf } from './queries';

export type UploadError = 'forbidden' | 'unauthorized' | 'notFound' | 'rateLimited' | 'fileTooLarge' | 'fileInvalid' | 'invalidFields'
  | 'archived' | 'rendererBusy' | 'pdfProtected' | 'pdfForm' | 'quotaExceeded';

const STATUS: Readonly<Record<UploadError, number>> = {
  forbidden: 403, unauthorized: 401, notFound: 404, rateLimited: 429, fileTooLarge: 413, fileInvalid: 415, invalidFields: 400,
  archived: 409, rendererBusy: 503, pdfProtected: 422, pdfForm: 422, quotaExceeded: 409,
};

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (error: UploadError): Response => json(STATUS[error], { ok: false, error });

/**
 * The upload comes from a page of the application: the browser's Origin is present and is PUBLIC_BASE_URL's, and the
 * rest of the same-origin check of the route handlers holds (Sec-Fetch-Site, Host / X-Forwarded-Host). Stricter than
 * the other routes: an Origin is required — every browser sends one on a POST made by fetch or XMLHttpRequest.
 */
export function uploadOrigin(headers: Headers, base: string): boolean {
  const origin = headers.get('origin');
  if (!origin || !sameOriginPost(headers)) return false;
  try {
    return new URL(origin).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** The body, at most `max` bytes: null as soon as it passes them (the rest is never read). */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** The form's fields: exactly one file (`file`) and the kind, title and component as text; anything else refuses it. */
export function formFields(fd: FormData): { file: File; fields: Record<string, string> } | null {
  let file: File | null = null;
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k === 'file' && typeof v !== 'string' && !file) file = v;
    else if ((k === 'kind' || k === 'title' || k === 'component') && typeof v === 'string' && !(k in fields)) fields[k] = v;
    else return null;
  }
  return file ? { file, fields } : null;
}

let reading = 0;

export async function handleUpload(req: Request, rawId: string): Promise<Response> {
  if (!uploadOrigin(req.headers, publicBaseUrl())) return refuse('forbidden');
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return refuse('unauthorized');
  if (!can(user, 'projects:edit')) return refuse('forbidden');
  const id = idSchema.safeParse(rawId);
  if (!id.success) return refuse('notFound');
  if (!rateLimit(`allegati-up:${user.id}`, ALLEGATI_LIMITS.uploadsPerHour, 60 * 60 * 1000)) return refuse('rateLimited');
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse('fileTooLarge');
  if (!/^multipart\/form-data;\s*boundary=/i.test(req.headers.get('content-type') ?? '')) return refuse('invalidFields');
  const project = await uploadTarget(user, id.data);
  if (!project) return refuse('notFound');
  if (project.archivedAt) return refuse('archived');
  // a slot from the first byte read to the answer: the body, its parsed copy and the kept copy are in memory meanwhile
  if (reading >= ALLEGATI_LIMITS.uploadsInFlight) return refuse('rendererBusy');
  reading++;
  try {
    return await receive(req, { userId: user.id, companyId: user.companyId, projectId: project.id });
  } finally {
    reading--;
  }
}

async function receive(req: Request, ctx: { userId: string; companyId: string; projectId: string }): Promise<Response> {
  const body = await readCapped(req.body, MAX_BODY_BYTES);
  if (!body) return refuse('fileTooLarge');
  let form: { file: File; fields: Record<string, string> } | null;
  try {
    form = formFields(await new Response(body, { headers: { 'Content-Type': req.headers.get('content-type') ?? '' } }).formData());
  } catch {
    form = null;
  }
  if (!form) return refuse('invalidFields');
  const meta = uploadMetaSchema.safeParse(form.fields);
  if (!meta.success) return refuse('invalidFields');
  if (form.file.size === 0) return refuse('fileInvalid');
  if (form.file.size > MAX_FILE_BYTES) return refuse('fileTooLarge');
  const file = prepareFile(new Uint8Array(await form.file.arrayBuffer()));
  if (!file.ok) return refuse('fileInvalid');
  const sha256 = createHash('sha256').update(file.data).digest('hex');
  const same = await existing(ctx.projectId, sha256, ctx.companyId);
  if (same) return json(200, { ok: true, duplicate: true, attachment: viewOf(same) });
  let pages: number;
  try {
    const inspected = await inspectUpload(file.data, file.type, ctx);
    if (!inspected.ok) return refuse(inspected.error);
    pages = inspected.pages;
  } catch (e) {
    if (e instanceof RendererBusy) return refuse('rendererBusy');
    throw e;
  }
  const fileName = cleanFileName(form.file.name, file.type);
  const stored = await storeAttachment({
    ...ctx, kind: meta.data.kind, title: meta.data.title ?? titleFromName(fileName), component: meta.data.component ?? null,
    fileName, mime: file.mime, data: file.data, sha256, pages, width: file.width, height: file.height, orientation: file.orientation,
  });
  if (!stored.ok) return refuse(stored.error);
  if (!stored.duplicate) {
    // the file's name never goes in the log: it may name a person
    await audit({
      companyId: ctx.companyId, userId: ctx.userId, action: 'ATTACHMENT_UPLOADED', entity: 'Attachment', entityId: stored.row.id,
      meta: { attachmentId: stored.row.id, sha256, size: file.data.length, kind: meta.data.kind },
    });
  }
  return json(stored.duplicate ? 200 : 201, { ok: true, duplicate: stored.duplicate, attachment: viewOf(stored.row) });
}
