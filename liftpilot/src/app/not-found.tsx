import './globals.css';
import it from '../../messages/it.json';

// Addresses outside the language segment (e.g. a file that does not exist): a plain page in Italian, the only language
// of the interface, with the way to the home page. Its words are those of the localized 404 (messages/it.json).
export default function RootNotFound() {
  return (
    <html lang="it">
      <body>
        <main className="page page-narrow">
          <span className="chip">404</span>
          <h1>{it.errors.notFoundTitle}</h1>
          <p className="flex flex-wrap gap-3">
            <a className="btn" href="/it">{it.errors.toHome}</a>
          </p>
        </main>
      </body>
    </html>
  );
}
