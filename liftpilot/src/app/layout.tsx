import type { ReactNode } from 'react';

// The real root layout (html, body, language) is app/[locale]/layout.tsx; this one only exists for the pages
// outside the locale segment (the plain not-found page).
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
