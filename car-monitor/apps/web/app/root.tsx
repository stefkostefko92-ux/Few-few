import { Links, Meta, Outlet, Scripts, ScrollRestoration, Form, NavLink } from "react-router";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <header className="site">
          <div className="container">
            <NavLink to="/" className="brand">
              Car Monitor
            </NavLink>
            <NavLink to="/vehicles">Автомобили</NavLink>
            <Form method="get" action="/search" className="search" style={{ marginLeft: "auto", minWidth: 280 }}>
              <input name="q" placeholder="VIN, рег. №, марка/модел, продавач…" aria-label="Търсене" />
            </Form>
          </div>
        </header>
        <main className="container">{children}</main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return (
    <div>
      <h1>Възникна грешка</h1>
      <p className="muted">Опитайте отново по-късно.</p>
    </div>
  );
}
