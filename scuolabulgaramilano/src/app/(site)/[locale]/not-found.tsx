import NotFoundContent from "@/components/NotFoundContent";

// 404 for missing paths under a valid locale — rendered inside the locale
// layout (which already provides <html>/<body>), so content only.
export default function LocaleNotFound() {
  return <NotFoundContent />;
}
