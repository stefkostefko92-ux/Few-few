import AdminShell from "@/components/admin/AdminShell";
import MediaManager from "@/components/admin/MediaManager";

export const dynamic = "force-dynamic";

export default function MediaPage() {
  return (
    <AdminShell active="media" title="Media" subtitle="Carica e gestisci le immagini usate nel sito.">
      <MediaManager />
    </AdminShell>
  );
}
