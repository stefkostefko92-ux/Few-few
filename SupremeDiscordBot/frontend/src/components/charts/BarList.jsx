// frontend/src/components/charts/BarList.jsx
// Хоризонтални барове за сравнение на величини (тикети по панел).
//
// Защо НЕ донът, макар брандбордът да рисува такъв: това е сравнение на
// величини, а не part-to-whole „на един поглед". Донът за близки стойности е
// анти-патърн, а 5 категорийни цвята паднаха all-pairs CVD проверката
// (violet↔blue ΔE 0.4 при deutan). Един цвят за всички барове + директни
// етикети решава и двете — дължината носи стойността, цветът не кодира нищо
// два пъти.
import { BAR_COLOR } from "./palette";

export default function BarList({ items = [], emptyLabel = "No data yet.", className = "" }) {
  if (!items.length) {
    return <p className={`text-sm text-cs-muted py-6 text-center ${className}`}>{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((it) => {
        const pctOfTotal = total ? Math.round((it.value / total) * 100) : 0;
        return (
          <li key={it.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm text-cs-text truncate">{it.label}</span>
              {/* Директен етикет — стойността никога не живее само в tooltip */}
              <span className="text-xs text-cs-muted tabular-nums flex-shrink-0">
                {it.value} <span className="text-cs-dim">· {pctOfTotal}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: BAR_COLOR }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
