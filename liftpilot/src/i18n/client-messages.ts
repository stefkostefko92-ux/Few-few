// The messages the browser gets. A public page sends only what its client components read (the language switch, the
// forms around the sign-in, the error page); the application's layout sends all of them. Every message of the app is
// otherwise some 200 KB on every public page.
import type { AbstractIntlMessages } from 'next-intl';

/** The namespaces the client components of the public pages read with useTranslations. */
export const PUBLIC_CLIENT_NAMESPACES = ['common', 'errors', 'auth', 'register', 'forgot', 'reset', 'verify', 'invite', 'roles'] as const;

export function pickMessages(all: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  return Object.fromEntries(namespaces.flatMap((ns) => (ns in all ? [[ns, all[ns]]] : [])));
}
