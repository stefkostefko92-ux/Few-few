import AdminShell from "@/components/admin/AdminShell";
import LeadsTable from "@/components/admin/LeadsTable";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const rows = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
  const leads = rows.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }));
  return (
    <AdminShell active="leads" title="Запитвания" subtitle="Съобщения, изпратени през формата за контакт на сайта.">
      <LeadsTable initial={leads} />
    </AdminShell>
  );
}
