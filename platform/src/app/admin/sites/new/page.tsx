import Link from "next/link";
import { SiteForm } from "@/components/admin/SiteForm";
import { createSiteAction } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default function NewSite() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/sites" className="text-xs text-ink-500 hover:text-ink-300">
          ← Сайтове
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Свържи нов сайт</h1>
      </div>
      <div className="card">
        <SiteForm action={createSiteAction} submitLabel="Свържи сайт" />
      </div>
    </div>
  );
}
