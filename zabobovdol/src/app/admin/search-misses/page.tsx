import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats";
import { addDays, formatPct, MIN_N, safeRate } from "@/lib/analytics-core";
import { groupMisses, guideQuestion } from "@/lib/search-misses";
import { SEARCH_MISS_RETENTION_DAYS } from "@/lib/retention-core";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { resolveMissGroup, deleteMissGroup, startGuideFromMiss } from "./actions";
import { CreateGuideButton, CopyButton } from "./GuideButtons";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("bg-BG", { timeZone: "Europe/Sofia" });
}

// Делът неуспешни търсения за последните N дни (от агрегатите в DailyStat).
async function missRate(days: number): Promise<{ searches: number; misses: number }> {
  try {
    const rows = await prisma.dailyStat.groupBy({
      by: ["metric"],
      where: {
        metric: { in: ["search", "search_miss"] },
        day: { gte: addDays(sofiaDay(), -(days - 1)) },
      },
      _sum: { count: true },
    });
    const get = (m: string) => rows.find((r) => r.metric === m)?._sum.count ?? 0;
    return { searches: get("search"), misses: get("search_miss") };
  } catch {
    return { searches: 0, misses: 0 };
  }
}

export default async function SearchMissesPage() {
  await requireUser();
  const [misses, w7, w30] = await Promise.all([
    prisma.searchMiss.findMany({
      orderBy: [{ resolved: "asc" }, { count: "desc" }, { updatedAt: "desc" }],
      take: 500,
    }),
    missRate(7),
    missRate(30),
  ]);
  const groups = groupMisses(misses).slice(0, 200);
  const now = Date.now();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Търсения без резултат</h1>
        <p className="text-slate-600">
          Какво търсят хората, но не намират — най-добрите идеи кое ръководство да
          напишете следващо. Неуспешно е търсене с 0 резултата или само със слаби
          съвпадения (думата я няма в заглавие или етикети).
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Личните данни (ЕГН, телефони, имейли, IBAN, адреси на сайтове, дълги
          номера) се заменят с етикет още преди запис. Всеки запис се изтрива
          автоматично {SEARCH_MISS_RETENTION_DAYS} дни след първото търсене.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Последните 7 дни", v: w7 },
          { label: "Последните 30 дни", v: w30 },
        ].map(({ label, v }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-600">{label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {formatPct(safeRate(v.misses, v.searches))}
            </div>
            <div className="text-sm text-slate-600">
              неуспешни: {v.misses.toLocaleString("bg-BG")} от {v.searches.toLocaleString("bg-BG")}{" "}
              търсения (процент само при поне {MIN_N})
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-semibold text-slate-600">Запитване</th>
              <th className="p-3 font-semibold text-slate-600">Брой</th>
              <th className="p-3 font-semibold text-slate-600">Кога</th>
              <th className="p-3 font-semibold text-slate-600">Статус</th>
              <th className="p-3 text-right font-semibold text-slate-600">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-600">
                  Все още няма такива търсения.
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const ids = g.items.map((r) => r.id);
                const question = guideQuestion(g.main.query);
                const isNew = now - g.firstAt.getTime() < 7 * DAY_MS;
                const others = g.items.slice(1).map((r) => r.query);
                return (
                  <tr key={g.key} className={g.resolved ? "opacity-60" : ""}>
                    <td className="p-3 align-top">
                      <div className="font-medium text-slate-800">{g.main.query}</div>
                      {others.length > 0 && (
                        <div className="mt-1 text-xs text-slate-600">
                          и още: {others.slice(0, 5).join(", ")}
                          {others.length > 5 ? ` (+${others.length - 5})` : ""}
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top font-semibold text-slate-800">{g.total}</td>
                    <td className="p-3 align-top text-slate-700">
                      <div>последно: {fmtDate(g.lastAt)}</div>
                      <div className="text-xs text-slate-600">първо: {fmtDate(g.firstAt)}</div>
                    </td>
                    <td className="p-3 align-top">
                      {g.resolved ? "Решено" : isNew ? "Ново (тази седмица)" : "Чака"}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!g.resolved && question && (
                          <form action={startGuideFromMiss.bind(null, ids, g.main.query)}>
                            <CreateGuideButton question={question} />
                          </form>
                        )}
                        {question && <CopyButton text={question} />}
                        <form action={resolveMissGroup.bind(null, ids, !g.resolved)}>
                          <button className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand-700 hover:underline">
                            {g.resolved ? "Върни като ново" : "Решено"}
                          </button>
                        </form>
                        <DeleteButton action={deleteMissGroup.bind(null, ids)} label="Изтрий" />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
