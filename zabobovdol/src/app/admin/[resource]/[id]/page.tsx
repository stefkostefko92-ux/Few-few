import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResource } from "@/lib/admin/resources";
import { saveRecord } from "@/lib/admin/actions";
import { buildInitial } from "@/lib/admin/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { ForwardPanel, forwardFlash } from "@/components/admin/ForwardPanel";
import { forwardDumpReport } from "@/lib/admin/forward-actions";
import { getMailConfig } from "@/lib/mail-config";
import { MUNICIPALITY_EMAIL } from "@/lib/mail";

export const dynamic = "force-dynamic";

type Delegate = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
};

export default async function ResourceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ error?: string; fwd?: string; to?: string }>;
}) {
  const { resource: key, id } = await params;
  const { error, fwd, to } = await searchParams;
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

  // „Сигнали за сметища“: „Изпрати сега“ към общината (без данните на подателя).
  const dumpForward = resource.key === "smetishta" && record;
  const mailOn = dumpForward ? (await getMailConfig()).params !== null : false;
  const flash = dumpForward ? forwardFlash(fwd, to) : null;

  return (
    <div className="space-y-4">
      {flash && (
        <p
          role={flash.ok ? "status" : "alert"}
          className={"rounded-lg px-4 py-2 text-sm " + (flash.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}
        >
          {flash.text}
        </p>
      )}
      {dumpForward && (
        <section aria-labelledby="fwd-title" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="fwd-title" className="text-lg font-semibold text-slate-900">
            Препрати към общината
          </h2>
          <p className="mb-3 mt-1 text-sm text-slate-600">
            Изпраща местоположението, описанието и снимката. Данните на подателя не се изпращат.
          </p>
          <ForwardPanel
            action={forwardDumpReport.bind(null, id)}
            defaultTo={MUNICIPALITY_EMAIL}
            mailOn={mailOn}
            forwardedTo={record?.status === "FORWARDED" ? "общината (виж бележката отдолу)" : undefined}
          />
        </section>
      )}
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
