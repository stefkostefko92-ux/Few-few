import Link from "next/link";
import { RosetteMotif } from "./Stitch";

// Inner 404 (no <html>/<body>) so it can be embedded inside any layout. It
// can't know the visitor's language, so it says it in all three.
export default function NotFoundContent() {
  return (
    <main className="notfound">
      <div className="wrap notfound__grid">
        <RosetteMotif size={9} className="notfound__rosette" />
        <div>
          <p className="notfound__code">404</p>
          <h1 lang="bg">Страницата не е намерена.</h1>
          <p lang="it">Pagina non trovata: il link potrebbe essere errato o non più valido.</p>
          <p lang="en">Page not found: the link may be wrong or out of date.</p>
          <div className="actions">
            <Link className="btn btn--red" href="/it">Torna alla home</Link>
            <Link className="btn btn--line" href="/bg" lang="bg">Към началото</Link>
            <Link className="btn btn--line" href="/en" lang="en">Back to home</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
