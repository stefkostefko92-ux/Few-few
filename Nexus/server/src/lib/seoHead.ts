// SEO head for the SPA shell (client/dist/index.html), rendered per request.
//
// Why: the shell is ONE static file. Its canonical always said "/" and its
// <html lang> "en", while the hreflang alternates pointed at /?lang=it and
// /?lang=bg. An alternate whose canonical is another URL is ignored, so for
// Google the Italian and Bulgarian landing pages did not exist (measured live
// 2026-10-24). The landing rewrote <title>/<description> in the browser, but
// never the canonical, and crawlers should not need JavaScript for that.
//
// Now:
//   • "/?lang=it|bg" → that locale's <html lang>, <title>, description,
//     og:title/og:description/og:url, and a SELF canonical;
//   • "/" (or ?lang=en / unknown) → the shell as built;
//   • any other path (login, app screens, legal pages) → noindex, follow, and
//     no canonical/hreflang — mixing noindex with a canonical to "/" is a
//     conflicting signal.
// The locale strings come from client/public/seo-locales.json — the same file
// the landing imports.

export type SeoLocale = { html: string; title: string; description: string };
export const SITE = 'https://nexus.carbonstealth.eu';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderShell(
  html: string,
  reqPath: string,
  lang: unknown,
  locales: Record<string, SeoLocale>,
): string {
  if (reqPath === '/') {
    const code = typeof lang === 'string' ? lang : '';
    const loc = code && code !== 'en' ? locales[code] : undefined;
    if (!loc) return html;
    const url = `${SITE}/?lang=${code}`;
    return html
      .replace(/<html lang="[^"]*"/, `<html lang="${esc(loc.html)}"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(loc.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(loc.description)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(loc.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(loc.description)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  }
  return html
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />')
    .replace(/[ \t]*<link rel="canonical"[^>]*>\n?/, '')
    .replace(/[ \t]*<link rel="alternate" hreflang="[^"]*"[^>]*>\n?/g, '');
}
