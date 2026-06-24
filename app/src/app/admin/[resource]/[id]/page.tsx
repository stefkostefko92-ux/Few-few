import { notFound } from "next/navigation";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResource } from "@/lib/admin/resources";
import { saveRecord } from "@/lib/admin/actions";
import { buildInitial } from "@/lib/admin/format";
import { AdminForm } from "@/components/admin/AdminForm";

export const dynamic = "force-dynamic";

type Delegate = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
};

export default async function ResourceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { resource: key, id } = await params;
  const { error } = await searchParams;
  const resource = getResource(key);
  if (!resource) notFound();
  if (resource.adminOnly) await requireAdmin();
  else await requireUser();

  const isNew = id === "new";
  let record: Record<string, unknown> | null = null;
  if (!isNew) {
    const delegate = (prisma as unknown as Record<string, Delegate>)[resource.model];
    record = await delegate.findUnique({ where: { id } });
    if (!record) notFound();
  }

  const initial = buildInitial(resource, record);
  const action = saveRecord.bind(null, resource.key, isNew ? null : id);

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <AdminForm
        title={
          isNew
            ? `Нов запис: ${resource.labelSingular}`
            : `Редакция: ${resource.labelSingular}`
        }
        fields={resource.fields}
        initial={initial}
        action={action}
        cancelHref={`/admin/${resource.key}`}
      />
    </div>
  );
}
