import { ANSWER } from '@/lib/answers';
import { ALLEGATI_LIMITS, EXT_OF, TYPE_OF, isAllegatoMime } from '@/lib/allegati/limits';
import { idSchema } from '@/lib/schemas';
import { blobStream } from '@/server/allegati/blob';
import { attachmentFile } from '@/server/allegati/queries';
import { attachment, downloader, inFlight, slug, text } from '@/server/download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// An uploaded file as it was kept (its metadata removed), to save, never to open in the page: whoever downloads the
// documents ('report:download', every role, a read-only company too), 60 in 10 minutes and two at a time per user;
// another company's id is «not found». The bytes are streamed a slice at a time (src/server/allegati/blob.ts), never
// held whole. The name is the title's slug and the first 8 characters of the SHA-256, never the uploaded name. Opened
// anyway, the response may do nothing: sandboxed, no source allowed (no script, plugin, request or frame).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const d = await downloader('allegati', ALLEGATI_LIMITS.downloadsPer10Min);
  if ('refused' in d) return d.refused;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return text(404, ANSWER.notFound);
  const f = await attachmentFile(d.user, id.data);
  if (!f || !isAllegatoMime(f.mime)) return text(404, ANSWER.notFound);
  const release = inFlight(`allegati:${d.user.id}`, 2);
  if (!release) return text(429, ANSWER.rateLimited);
  const res = attachment(blobStream(f.id, f.size, release), f.mime, `${slug(f.title, 'documento')}-${f.sha256.slice(0, 8)}.${EXT_OF[TYPE_OF[f.mime]]}`);
  res.headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
  res.headers.set('Content-Length', String(f.size));
  return res;
}
