import Link from "next/link";
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

  // „Сгрешени номера“: показваме името на услугата и връзка към нея (PhoneReport
  // пази само serviceId, без релация).
  const reportedServiceId =
    resource.key === "greshni-nomera" && record ? String(record.serviceId ?? "") : "";
  const reportedService = reportedServiceId
    ? await prisma.service.findUnique({
        where: { id: reportedServiceId },
        select: { id: true, name: true },
      })
    : null;

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {reportedServiceId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {reportedService ? (
            <>
              <span>
                Сигналът е за услугата: <strong className="text-slate-900">{reportedService.name}</strong>
              </span>
              <Link
                href={`/admin/services/${encodeURIComponent(reportedService.id)}`}
                className="btn-secondary min-h-11"
              >
                Отвори услугата <span aria-hidden>→</span>
              </Link>
            </>
          ) : (
            <span>Услугата от сигнала вече я няма ({reportedServiceId}).</span>
          )}
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
