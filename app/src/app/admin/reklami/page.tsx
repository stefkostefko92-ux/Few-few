import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setAdRequestStatus, deleteAdRequest } from "@/lib/admin/adrequest-actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Нова",
  CONTACTED: "Свързахме се",
  PAID: "Платена",
  ACTIVE: "Активна",
  REJECTED: "Отказана",
};
const STATUS_CLASS: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-brand-100 text-brand-800",
  PAID: "bg-green-100 text-green-800",
  ACTIVE: "bg-green-100 text-green-800",
  REJECTED: "bg-slate-200 text-slate-600",
};

export default async function AdminAdRequestsPage() {
  await requireAdmin();
  const items = await prisma.adRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Заявки за реклама</h1>
        <p className="text-slate-600">
          Заявки от потенциални рекламодатели. След плащане създайте банера от
          раздел „Реклами (банери)“.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Все още няма заявки.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.fullName}</span>
                  <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + STATUS_CLASS[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <span className="text-xs text-slate-600">
                  {new Intl.DateTimeFormat("bg-BG", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(r.createdAt)}
                </span>
              </div>

              <div className="mt-2 text-sm text-slate-600">
                {r.phone && (
                  <>
                    тел:{" "}
                    <a href={`tel:${r.phone}`} className="text-brand-700">
                      {r.phone}
                    </a>
                  </>
                )}
                {r.email && (
                  <>
                    {r.phone ? " · " : ""}
                    <a href={`mailto:${r.email}`} className="text-brand-700">
                      {r.email}
                    </a>
                  </>
                )}
              </div>
              {r.message && (
                <p className="mt-2 whitespace-pre-line text-slate-700">{r.message}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <form action={setAdRequestStatus.bind(null, r.id, "CONTACTED")}>
                  <button className="text-sm text-brand-700 hover:underline">Свързах се</button>
                </form>
                <form action={setAdRequestStatus.bind(null, r.id, "PAID")}>
                  <button className="text-sm text-green-700 hover:underline">Платена</button>
                </form>
                <form action={setAdRequestStatus.bind(null, r.id, "ACTIVE")}>
                  <button className="text-sm text-green-700 hover:underline">Активна</button>
                </form>
                <form action={setAdRequestStatus.bind(null, r.id, "REJECTED")}>
                  <button className="text-sm text-slate-500 hover:underline">Откажи</button>
                </form>
                <DeleteButton action={deleteAdRequest.bind(null, r.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
