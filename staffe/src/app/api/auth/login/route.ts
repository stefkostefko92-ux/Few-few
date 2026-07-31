import { z } from 'zod';
import { createSession, verifyLogin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Indirizzo e-mail non valido.'),
  password: z.string().min(1, 'Password obbligatoria.'),
});

export const POST = route(async (request: Request) => {
  const { email, password } = await readBody(request, schema);
  const user = await verifyLogin(email, password);

  if (!user) {
    await audit({ action: 'LOGIN_FALLITO', entity: 'User', summary: 'Credenziali errate' });
    // Messaggio unico: non si rivela se l'errore è l'indirizzo o la password.
    return fail(401, 'Credenziali non valide.', 'credenziali');
  }

  await createSession(user, request.headers.get('user-agent'));
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

  return ok({ id: user.id, name: user.name, role: user.role });
});
