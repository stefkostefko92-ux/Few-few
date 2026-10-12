// The former interface languages (English and Bulgarian, until 2026-10-12): their addresses still arrive from old
// e-mails, bookmarks and indexed pages, and answer with a permanent redirect to the same page in Italian.
import { DEFAULT_LOCALE, LEGACY_LOCALES } from './locales';

/** The former languages' prefix: /en, /bg and everything under them, in any case (/EN/pricing, as typed or pasted;
 *  not /english, /bgx). A trailing slash (/en/) first gets Next's own 308 to /en, before the middleware runs. */
const LEGACY = new RegExp(`^/(?:${LEGACY_LOCALES.join('|')})(?=/|$)`, 'i');

/** The same address under /it, with the rest of the path and the query string; null for every other address. */
export function legacyRedirect(url: { href: string; pathname: string }): URL | null {
  const m = LEGACY.exec(url.pathname);
  if (!m) return null;
  const to = new URL(url.href);
  to.pathname = `/${DEFAULT_LOCALE}${url.pathname.slice(m[0].length)}`;
  return to;
}
