import 'server-only';
// What every download route does the same way: the short answers in plain text, the file names, the attachment, and
// the checks before any work (signed in, the right to download, a bounded rate).
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';

/** A short answer in plain text, never cached. */
export const text = (status: number, body: string): Response =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** A name for a file: letters, digits and dashes, at most 60 characters. */
export const slug = (s: string, fallback = 'impianto'): string =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || fallback;

/** A file to save, private to the user who asked for it. */
export const attachment = (body: BodyInit, mime: string, name: string): Response => new Response(body, {
  headers: { 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** The user allowed to download (`capability`) at most `max` times in 10 minutes per `key`, or the answer refusing. */
export async function downloader(key: string, max: number, capability: Capability = 'report:download'): Promise<{ user: SessionUser } | { refused: Response }> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return { refused: text(401, 'Unauthorized') };
  if (!can(user, capability)) return { refused: text(403, 'Forbidden') };
  if (!rateLimit(`${key}:${user.id}`, max, 10 * 60 * 1000)) return { refused: text(429, 'Too many requests') };
  return { user };
}
