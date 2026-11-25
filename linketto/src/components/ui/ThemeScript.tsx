import { THEME_BOOT } from '@/components/ui/theme';

// Слага се първо в <head>: data-theme е на <html> преди рисуването — първият
// кадър в тъмна тема не е бял. Без CSP в проекта; съдържанието е константа.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />;
}
