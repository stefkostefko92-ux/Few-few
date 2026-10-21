import 'server-only';
// What every download route does the same way: the short answers in plain text, the file names, the attachment, and
// the checks before any work (signed in, the right to download, a bounded rate).
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { ANSWER } from '@/lib/answers';

/** A short answer in plain text, never cached. */
export const text = (status: number, body: string): Response =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** A name for a file: letters, digits and dashes, at most 60 characters. */
export const slug = (s: string, fallback = 'impianto'): string =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || fallback;

/** A file to save, private to the user who asked for it; `inline` opens it in the browser instead (to print it). */
export const attachment = (body: BodyInit, mime: string, name: string, disposition: 'attachment' | 'inline' = 'attachment'): Response => new Response(body, {
  headers: { 'Content-Type': mime, 'Content-Disposition': `${disposition}; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** The user allowed to download (`capability`) at most `max` times in 10 minutes per `key`, or the answer refusing. */
export async function downloader(key: string, max: number, capability: Capability = 'report:download'): Promise<{ user: SessionUser } | { refused: Response }> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return { refused: text(401, ANSWER.unauthorized) };
  if (!can(user, capability)) return { refused: text(403, ANSWER.forbidden) };
  if (!rateLimit(`${key}:${user.id}`, max, 10 * 60 * 1000)) return { refused: text(429, ANSWER.rateLimited) };
  return { user };
}

/** Downloads under way, by user and kind: a rate limit counts requests, not how many run at once. */
const flying = new Map<string, number>();

/** A place among at most `max` downloads of `key` under way at once — its release (idempotent) — or null when they are
 *  all taken. */
export function inFlight(key: string, max: number): (() => void) | null {
  const n = flying.get(key) ?? 0;
  if (n >= max) return null;
  flying.set(key, n + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = (flying.get(key) ?? 1) - 1;
    if (left > 0) flying.set(key, left); else flying.delete(key);
  };
}
