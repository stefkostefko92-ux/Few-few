// A form POSTed by the application's own pages, for the route handlers that take one (a server action gets the same
// check from Next.js itself): the browser's Origin names this host — X-Forwarded-Host behind the proxy, else Host —
// as Next.js checks it on every server action; and Sec-Fetch-Site, when the browser sends it, says same-origin. An
// Origin of `null` (a sandboxed frame) or another site is refused. Neither header (a browser older than both) passes,
// as it does for the server actions.

/** True when the request comes from a page of this application (see above). */
export function sameOriginPost(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = headers.get('origin');
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (!host) return false;
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return host === forwarded || host === headers.get('host');
}
