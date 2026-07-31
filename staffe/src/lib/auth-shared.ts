/**
 * Costanti condivise tra middleware (runtime edge) e server.
 *
 * Esistono a parte perché `auth.ts` importa Prisma e bcrypt, che sul runtime
 * edge del middleware non girano: importarlo lì farebbe fallire la build.
 */
export const SESSION_COOKIE = 'staffe_session';
export const JWT_ISSUER = 'staffe';
