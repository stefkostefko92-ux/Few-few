import { prisma } from "@/lib/prisma";
import { publishRide, deleteRide } from "./actions";

export const dynamic = "force-dynamic";

async function getRides() {
  try {
    return await prisma.rideshare.findMany({
      orderBy: [{ published: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
  } catch {
    return [];
  }
}

export default async function AdminRidesPage() {
  const items = await getRides();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Споделено пътуване ({items.length})
      </h1>
      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма обяви.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((r) => (
            <li key={r.id} className="card">
              <span className="badge">{r.published ? "Публикувана" : "Чака"}</span>
              <h2 className="mt-2 font-bold text-slate-900">
                {r.routeFrom} → {r.routeTo}
              </h2>
              <p className="text-sm text-slate-500">
                {[r.kind === "OFFER" ? "Предлага" : "Търси", r.schedule, r.contactPhone].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-3 flex gap-2">
                {!r.published && (
                  <form action={publishRide}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-primary" type="submit">Публикувай</button>
                  </form>
                )}
                <form action={deleteRide}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-secondary text-red-700" type="submit">Изтрий</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
