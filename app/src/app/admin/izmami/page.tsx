import { prisma } from "@/lib/prisma";
import { ScamForm } from "./ScamForm";
import { togglePin, deleteScam } from "./actions";

export const dynamic = "force-dynamic";

async function getAlerts() {
  try {
    return await prisma.scamAlert.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  } catch {
    return [];
  }
}

export default async function AdminIzmamiPage() {
  const items = await getAlerts();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Предупреждения за измами
      </h1>

      <div className="mt-6">
        <h2 className="section-title mb-4">Добави ново</h2>
        <ScamForm />
      </div>

      <div className="mt-10">
        <h2 className="section-title mb-4">Съществуващи ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-base text-slate-600">Няма предупреждения.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge">{a.severity}</span>
                  {a.pinned && <span className="badge bg-crimson-100 text-crimson-700">Закачено</span>}
                </div>
                <h3 className="mt-2 font-bold text-slate-900">{a.title}</h3>
                {a.summary && <p className="text-base text-slate-700">{a.summary}</p>}
                <div className="mt-3 flex gap-2">
                  <form action={togglePin}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="pin" value={a.pinned ? "0" : "1"} />
                    <button className="btn-secondary" type="submit">
                      {a.pinned ? "Откачи" : "Закачи"}
                    </button>
                  </form>
                  <form action={deleteScam}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn-secondary text-red-700" type="submit">Изтрий</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
