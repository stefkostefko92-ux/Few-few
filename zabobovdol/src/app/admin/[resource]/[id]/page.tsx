import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
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
}: {
  params: Promise<{ resource: string; id: string }>;
}) {
  await requireUser();
  const { resource: key, id } = await params;
  const resource = getResource(key);
  if (!resource) notFound();

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
  );
}
