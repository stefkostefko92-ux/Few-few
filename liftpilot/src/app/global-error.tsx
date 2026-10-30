'use client';

import { GLOBAL_ERROR_TEXTS as T } from '@/lib/fallback-texts';
import { PROVIDER } from '@/lib/provider';
import Credit from '@/components/Credit';
import './globals.css';
import './public.css';

// The last resort: an error in the root layout itself, which this page replaces with its own <html> and <body> (no
// messages, no fonts' preload, no header — whatever failed may be among them). In Italian, the interface's one language,
// with the words of messages/it.json (src/lib/fallback-texts.ts), «Riprova», the way home as a plain link, the code that
// links it to the server's log, and the Carbon Stealth credit — the owner's rule for every page. No script of its own:
// the page's Content-Security-Policy (src/middleware.ts) stays as it is.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body>
        <main id="main" tabIndex={-1} className="pub-page err-page blueprint">
          <p className="err-code" aria-hidden="true">500</p>
          <h1>{T.title}</h1>
          <p className="lead">{T.text}</p>
          {error.digest ? <p className="note mono">{T.code}{error.digest}</p> : null}
          <p className="err-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>{T.retry}</button>
            {/* a full page load: the router may be what failed */}
            <a className="btn" href="/it">{T.home}</a>
          </p>
          <p className="note">{T.mail[0]}{PROVIDER.email}{T.mail[1]}</p>
        </main>
        <footer className="site-footer">
          <div className="inner"><Credit /></div>
        </footer>
      </body>
    </html>
  );
}
