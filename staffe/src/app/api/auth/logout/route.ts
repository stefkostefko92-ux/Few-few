import { destroySession, getSessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ok, route } from '@/lib/api';

export const POST = route(async () => {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await audit({ userId: user.id, action: 'LOGOUT', entity: 'User', entityId: user.id });
  }
  return ok({ uscita: true });
});
