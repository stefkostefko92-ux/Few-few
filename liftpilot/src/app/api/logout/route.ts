import { DEFAULT_LOCALE } from '@/i18n/locales';
import { audit } from '@/lib/audit';
import { endSession, getSessionUser } from '@/lib/auth';
import { sameOriginPost } from '@/lib/same-origin';
import { text } from '@/server/download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Esci», the shell's sign-out: a plain form POST, so a real page load. A page with unsaved changes (the Rilievi form)
// gets the browser's own «leave the page?» first, as every page load does, and nothing of the signed-in pages stays in
// the client's router cache. Only from the application's own pages (sameOriginPost); the session goes from the
// database and the cookie, the activity log says LOGOUT, then the sign-in page (303: the browser follows with a GET).
export async function POST(req: Request): Promise<Response> {
  if (!sameOriginPost(req.headers)) return text(403, 'Forbidden');
  const user = await getSessionUser();
  await endSession();
  if (user) await audit({ companyId: user.companyId, userId: user.id, action: 'LOGOUT', entity: 'User', entityId: user.id });
  return new Response(null, { status: 303, headers: { Location: `/${DEFAULT_LOCALE}/login`, 'Cache-Control': 'no-store' } });
}
