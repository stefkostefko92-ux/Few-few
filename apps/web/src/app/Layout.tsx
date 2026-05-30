import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";

/** Authenticated app chrome: header + routed content + footer. */
export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-4 py-8 sm:px-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
