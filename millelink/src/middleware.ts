import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Публичните профили (/u/...), API и статичните файлове са извън
  // локализирания рутинг — езикът им се решава от съдържанието на профила.
  matcher: ['/((?!api|u|_next|_vercel|.*\\..*).*)'],
};
