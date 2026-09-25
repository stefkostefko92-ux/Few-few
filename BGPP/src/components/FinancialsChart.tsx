import type { FinancialYear } from "@/data/types";

// Компактна визуализация на многогодишна финансова серия: ленти за приходите и
// цветен резултат (зелено печалба / оранжево загуба). Инлайн SVG, без зависимости.
export function FinancialsChart({ series }: { series: FinancialYear[] }) {
  const revs = series.map((s) => s.revenueMln).filter((v): v is number => v != null);
  const maxRev = Math.max(1, ...revs);
  const fmt = (n?: number) =>
    n == null ? "—" : n.toLocaleString("bg-BG", { maximumFractionDigits: 0 });

  return (
    <div>
      {revs.length > 0 && (
        <div className="mb-4 flex items-end gap-3">
          {series.map((s) => {
            const h = s.revenueMln != null ? Math.round((s.revenueMln / maxRev) * 100) : 0;
            return (
              <div key={s.year} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end">
                  <div
                    className="w-full rounded-t bg-brand-400"
                    style={{ height: `${Math.max(h, 2)}%` }}
                    title={`${s.year}: ${fmt(s.revenueMln)} млн. лв. приходи`}
                  />
                </div>
                <span className="text-xs font-medium text-slate-500">{s.year}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2">Година</th>
              <th className="px-4 py-2 text-right">Приходи (млн. лв.)</th>
              <th className="px-4 py-2 text-right">Резултат (млн. лв.)</th>
              <th className="px-4 py-2 text-right">Заети</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {series.map((s) => (
              <tr key={s.year}>
                <td className="px-4 py-2 font-medium text-slate-900">{s.year}</td>
                <td className="px-4 py-2 text-right text-slate-700">{fmt(s.revenueMln)}</td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    s.resultMln == null
                      ? "text-slate-400"
                      : s.resultMln >= 0
                        ? "text-inflow-700"
                        : "text-outflow-700"
                  }`}
                >
                  {s.resultMln == null ? "—" : `${s.resultMln > 0 ? "+" : ""}${fmt(s.resultMln)}`}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {s.employees ? s.employees.toLocaleString("bg-BG") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
