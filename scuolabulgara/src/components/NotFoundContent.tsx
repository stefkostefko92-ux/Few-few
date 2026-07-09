import Link from "next/link";

// Inner 404 card (no <html>/<body>) so it can be embedded inside any layout.
export default function NotFoundContent() {
  return (
    <main className="notfound">
      <div className="notfound__card">
        <img src="/assets/img/brand/logo.webp" alt="Qui Bulgaria" width={150} height={130} />
        <div className="notfound__code" aria-hidden="true">404</div>
        <p className="notfound__lead">
          <strong>Страницата не е намерена.</strong><br />
          Pagina non trovata · Page not found
        </p>
        <p className="notfound__sub">
          Връзката може да е остаряла или сгрешена. · Il link potrebbe essere errato. · The link may be broken.
        </p>
        <div className="notfound__actions">
          <Link className="btn btn--primary btn--lg" href="/bg">Начало</Link>
          <Link className="btn btn--ghost btn--lg" href="/it">Home</Link>
          <Link className="btn btn--ghost btn--lg" href="/en">Home (EN)</Link>
        </div>
      </div>
    </main>
  );
}
