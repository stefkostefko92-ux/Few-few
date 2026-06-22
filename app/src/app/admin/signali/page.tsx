import { prisma } from "@/lib/prisma";
import { resolveComplaint, deleteComplaint } from "./actions";

export const dynamic = "force-dynamic";

async function getComplaints() {
  try {
    return await prisma.complaint.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  } catch {
    return [];
  }
}

const STATUS_LABEL: Record<string, string> = {
  NEW: "Нов",
  FORWARDED: "Препратен",
  RESOLVED: "Решен",
  REJECTED: "Отхвърлен",
};

export default async function AdminSignaliPage() {
  const items = await getComplaints();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Сигнали ({items.length})
      </h1>

      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма сигнали.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((c) => (
            <li key={c.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge">{STATUS_LABEL[c.status] ?? c.status}</span>
                <span className="text-sm text-slate-500">
                  {c.category} · {c.refCode}
                </span>
              </div>
              <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                {c.subject}
              </h2>
              {c.location && (
                <p className="text-sm text-slate-600">Място: {c.location}</p>
              )}
              <p className="mt-2 whitespace-pre-line text-base text-slate-700">
                {c.message}
              </p>
              {(c.name || c.phone || c.email) && (
                <p className="mt-2 text-sm text-slate-500">
                  {[c.name, c.phone, c.email].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {c.status !== "RESOLVED" && (
                  <form action={resolveComplaint}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-secondary" type="submit">
                      Отбележи като решен
                    </button>
                  </form>
                )}
                <form action={deleteComplaint}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    className="btn-secondary text-red-700"
                    type="submit"
                  >
                    Изтрий
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
