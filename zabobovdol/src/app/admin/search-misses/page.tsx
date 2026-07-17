import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveMiss, deleteMiss } from "@/lib/admin/misc-actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function SearchMissesPage() {
  await requireUser();
  const misses = await prisma.searchMiss.findMany({
    orderBy: [{ resolved: "asc" }, { count: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Търсения без резултат</h1>
        <p className="text-slate-600">
          Какво търсят хората, но не намират. Това са най-добрите идеи кое
          съдържание да добавите следващо.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-semibold text-slate-600">Запитване</th>
              <th className="p-3 font-semibold text-slate-600">Брой</th>
              <th className="p-3 font-semibold text-slate-600">Статус</th>
              <th className="p-3 text-right font-semibold text-slate-600">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {misses.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-600">
                  Все още няма такива търсения.
                </td>
              </tr>
            ) : (
              misses.map((m) => (
                <tr key={m.id} className={m.resolved ? "opacity-50" : ""}>
                  <td className="p-3 font-medium text-slate-800">{m.query}</td>
                  <td className="p-3 text-slate-700">{m.count}</td>
                  <td className="p-3">
                    {m.resolved ? "Обработено" : "Ново"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-3">
                      <form action={resolveMiss.bind(null, m.id, !m.resolved)}>
                        <button className="text-sm font-medium text-brand-700 hover:underline">
                          {m.resolved ? "Върни като ново" : "Отбележи обработено"}
                        </button>
                      </form>
                      <DeleteButton action={deleteMiss.bind(null, m.id)} label="Изтрий" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
