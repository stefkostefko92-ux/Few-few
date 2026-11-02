import AdminShell from "@/components/admin/AdminShell";
import MediaManager from "@/components/admin/MediaManager";

export const dynamic = "force-dynamic";

export default function MediaPage() {
  return (
    <AdminShell active="media" title="Медия" subtitle="Качвайте и управлявайте снимките, използвани в сайта.">
      <MediaManager />
    </AdminShell>
  );
}
