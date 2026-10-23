'use client';

import ErrorView from '@/components/ErrorView';

// An unexpected error on a page of the application: the shell stays around it (the menu, the top bar, the footer with
// the credit), so the way on is where it always is; «Segnala il problema» takes the code and the page to the report.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} inApp />;
}
