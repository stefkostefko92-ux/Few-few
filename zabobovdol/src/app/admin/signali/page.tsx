import { requireUser } from "@/lib/auth";
import { Mail, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MUNICIPALITY_EMAIL } from "@/lib/mail";
import { setComplaintStatus, deleteComplaint } from "@/lib/admin/complaint-actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Нов",
  FORWARDED: "Препратен",
  RESOLVED: "Решен",
  REJECTED: "Отхвърлен",
};
const STATUS_CLASS: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800",
  FORWARDED: "bg-brand-100 text-brand-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-slate-200 text-slate-600",
};

export default async function AdminSignaliPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireUser();
  const { filter } = await searchParams;
  const where =
    filter && filter in STATUS_LABEL ? { status: filter as never } : {};
  const items = await prisma.complaint.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Сигнали до общината</h1>
        <p className="text-slate-600">
          Получените сигнали се препращат към {MUNICIPALITY_EMAIL}. Ако SMTP не е
          конфигуриран, препратете ръчно с бутона и отбележете статуса.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <a
          href="/admin/signali"
          className={
            "rounded-full px-3 py-1.5 " +
            (!filter ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-300")
          }
        >
          Всички
        </a>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <a
            key={k}
            href={`/admin/signali?filter=${k}`}
            className={
              "rounded-full px-3 py-1.5 " +
              (filter === k ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-300")
            }
          >
            {v}
          </a>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Няма сигнали за показване.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((c) => {
            const mailto = `mailto:${MUNICIPALITY_EMAIL}?subject=${encodeURIComponent(
              `Сигнал ${c.refCode}: ${c.subject}`,
            )}&body=${encodeURIComponent(
              `Категория: ${c.category}\n${c.location ? "Местоположение: " + c.location + "\n" : ""}\n${c.message}\n\nПодател: ${c.name || "—"}, тел: ${c.phone || "—"}, имейл: ${c.email || "—"}`,
            )}`;
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-500">{c.refCode}</span>
                    <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + STATUS_CLASS[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    <span className="badge">{c.category}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Intl.DateTimeFormat("bg-BG", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(c.createdAt)}
                  </span>
                </div>

                <h2 className="mt-2 text-lg font-semibold text-slate-900">{c.subject}</h2>
                {c.location && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {c.location}</div>
                )}
                <p className="mt-2 whitespace-pre-line text-slate-700">{c.message}</p>

                <div className="mt-3 text-sm text-slate-500">
                  Подател: {c.name || "—"}
                  {c.phone && <> · тел: <a href={`tel:${c.phone}`} className="text-brand-700">{c.phone}</a></>}
                  {c.email && <> · <a href={`mailto:${c.email}`} className="text-brand-700">{c.email}</a></>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                  <a href={mailto} className="text-sm font-medium text-brand-700 hover:underline">
                    <Mail className="inline h-4 w-4 align-text-bottom" aria-hidden /> Препрати по имейл
                  </a>
                  <form action={setComplaintStatus.bind(null, c.id, "FORWARDED")}>
                    <button className="text-sm text-slate-700 hover:underline">Отбележи „Препратен“</button>
                  </form>
                  <form action={setComplaintStatus.bind(null, c.id, "RESOLVED")}>
                    <button className="text-sm text-green-700 hover:underline">Решен</button>
                  </form>
                  <form action={setComplaintStatus.bind(null, c.id, "REJECTED")}>
                    <button className="text-sm text-slate-500 hover:underline">Отхвърли</button>
                  </form>
                  <DeleteButton action={deleteComplaint.bind(null, c.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
