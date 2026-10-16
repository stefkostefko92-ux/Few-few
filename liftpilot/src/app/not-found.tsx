import './globals.css';
import it from '../../messages/it.json';
import Credit from '@/components/Credit';

// Addresses outside the language segment (e.g. a file that does not exist): a plain page in Italian, the only language
// of the interface, with the way to the home page and the Carbon Stealth credit (the owner's rule for every page). Its
// words are those of the localized 404 (messages/it.json); the links are plain ones — there is no language segment here.
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
        <footer className="site-footer">
          <div className="inner"><Credit /></div>
        </footer>
      </body>
    </html>
  );
}
