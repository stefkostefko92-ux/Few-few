import "./globals.css";
import { fontVars } from "@/lib/fonts";
import NotFoundContent from "@/components/NotFoundContent";

// Global 404 for unmatched top-level routes (rendered standalone, e.g. when an
// invalid locale makes the locale layout bail out), so it owns <html>/<body>.
export const metadata = { title: "404 · Qui Bulgaria", robots: { index: false } };

export default function NotFound() {
  return (
    <html lang="bg" className={fontVars}>
      <body>
        <NotFoundContent />
      </body>
    </html>
  );
}
