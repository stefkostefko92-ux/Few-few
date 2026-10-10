import "./base.css";
import "./site.css";
import { fontVars } from "@/lib/fonts";
import NotFoundContent from "@/components/NotFoundContent";
import { getOne } from "@/lib/content";

// Global 404 for unmatched top-level routes (rendered standalone, e.g. when an
// invalid locale makes the locale layout bail out), so it owns <html>/<body>.
export async function generateMetadata() {
  const settings = await getOne("it", "settings");
  return { title: `404 · ${settings.brandName}`, robots: { index: false }, icons: { icon: "/assets/img/brand/favicon.svg" } };
}

export default function NotFound() {
  return (
    <html lang="bg" className={fontVars}>
      <body>
        <NotFoundContent />
      </body>
    </html>
  );
}
