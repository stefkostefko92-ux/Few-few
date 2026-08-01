import { z } from 'zod';
import { createSession, verifyLogin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';
import { chiaveAccesso, registroAccessi } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email('Indirizzo e-mail non valido.'),
  password: z.string().min(1, 'Password obbligatoria.'),
});

export const POST = route(async (request: Request) => {
  const { email, password } = await readBody(request, schema);
  const chiave = chiaveAccesso(email, request);

  // Il limite si controlla PRIMA di confrontare la password: altrimenti ogni
  // tentativo bloccato costerebbe comunque un hash bcrypt, e l'attacco a forza
  // bruta diventerebbe anche un modo per saturare il server.
  const limite = registroAccessi.controlla(chiave);
  if (!limite.consentito) {
    return fail(
      429,
      `Troppi tentativi di accesso. Riprova fra ${Math.ceil(limite.attesaSecondi / 60)} minuti.`,
      'troppi_tentativi',
    );
  }

  const user = await verifyLogin(email, password);

  if (!user) {
    const esito = registroAccessi.fallito(chiave);
    await audit({
      action: 'LOGIN_FALLITO',
      entity: 'User',
      summary: esito.consentito
        ? 'Credenziali errate'
        : 'Credenziali errate — accesso temporaneamente bloccato',
    });
    // Messaggio unico: non si rivela se l'errore è l'indirizzo o la password.
    return fail(401, 'Credenziali non valide.', 'credenziali');
  }

  registroAccessi.riuscito(chiave);
  await createSession(user, request.headers.get('user-agent'));
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

  return ok({ id: user.id, name: user.name, role: user.role });
});
