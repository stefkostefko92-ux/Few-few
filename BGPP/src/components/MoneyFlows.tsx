import type { MoneyFlow } from "@/data/types";
import { ArrowInflow, ArrowOutflow } from "./icons";

// Визуализира списък с парични потоци (входящи или изходящи). Тежестта (weight)
// се показва като етикет за приоритет, за да е ясно кое е основен поток.
const WEIGHT_LABEL: Record<number, string> = {
  1: "основен",
  2: "значим",
  3: "второстепенен",
};

export function MoneyFlowColumn({
  kind,
  flows,
}: {
  kind: "in" | "out";
  flows: MoneyFlow[];
}) {
  const isIn = kind === "in";
  const accent = isIn ? "inflow" : "outflow";
  return (
    <div
      className={`rounded-2xl border p-5 ${
        isIn
          ? "border-inflow-200 bg-inflow-50"
          : "border-outflow-200 bg-outflow-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${
            isIn ? "bg-inflow-600" : "bg-outflow-600"
          }`}
        >
          {isIn ? (
            <ArrowInflow className="h-5 w-5" aria-hidden />
          ) : (
            <ArrowOutflow className="h-5 w-5" aria-hidden />
          )}
        </span>
        <h3 className="text-lg font-bold text-slate-900">
          {isIn ? "Откъде влизат парите" : "Къде излизат парите"}
        </h3>
      </div>
      <ul className="mt-4 space-y-3">
        {flows.map((f, i) => (
          <li key={i} className="rounded-lg bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium text-slate-900">{f.label}</span>
              {f.weight && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isIn
                      ? "bg-inflow-100 text-inflow-800"
                      : "bg-outflow-100 text-outflow-800"
                  }`}
                >
                  {WEIGHT_LABEL[f.weight]}
                </span>
              )}
            </div>
            {f.note && <p className="mt-1 text-sm text-slate-600">{f.note}</p>}
          </li>
        ))}
      </ul>
      <p className="sr-only">Акцентен цвят: {accent}</p>
    </div>
  );
}
