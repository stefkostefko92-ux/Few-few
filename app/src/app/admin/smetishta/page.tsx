import { prisma } from "@/lib/prisma";
import { publishDump, deleteDump } from "./actions";

export const dynamic = "force-dynamic";

async function getDumps() {
  try {
    return await prisma.dumpReport.findMany({
      orderBy: [{ published: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
  } catch {
    return [];
  }
}

export default async function AdminSmetishtaPage() {
  const items = await getDumps();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Сигнали за сметища ({items.length})
      </h1>

      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма сигнали.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((d) => (
            <li key={d.id} className="card">
              <span className="badge">
                {d.published ? "Публикуван" : "Чака преглед"}
              </span>
              <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                {d.location}
              </h2>
              {d.description && (
                <p className="mt-2 text-base text-slate-700">{d.description}</p>
              )}
              {(d.reporterName || d.reporterPhone) && (
                <p className="mt-2 text-sm text-slate-500">
                  {[d.reporterName, d.reporterPhone].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {!d.published && (
                  <form action={publishDump}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn-primary" type="submit">
                      Публикувай
                    </button>
                  </form>
                )}
                <form action={deleteDump}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn-secondary text-red-700" type="submit">
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
