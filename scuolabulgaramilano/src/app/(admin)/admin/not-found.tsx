import NotFoundContent from "@/components/NotFoundContent";

// 404 for missing /admin paths — rendered inside the admin layout (which
// provides <html>/<body>), so content only.
export default function AdminNotFound() {
  return <NotFoundContent />;
}
