import './globals.css';

// Addresses outside every language (e.g. a file that does not exist): a plain page, links to the three languages.
export default function RootNotFound() {
  return (
    <html lang="it">
      <body>
        <main className="page page-narrow">
          <p className="eyebrow">404</p>
          <h1>Pagina non trovata · Page not found · Страницата не е намерена</h1>
          <p className="flex flex-wrap gap-3">
            <a className="btn" href="/it">Italiano</a>
            <a className="btn" href="/en">English</a>
            <a className="btn" href="/bg">Български</a>
          </p>
        </main>
      </body>
    </html>
  );
}
