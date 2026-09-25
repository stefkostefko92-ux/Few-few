// frontend/src/components/StatTile.jsx
// KPI плочка: една стойност + промяна спрямо предходния равен период.
//
// Дисциплина (dataviz): стойността носи ПРОПОРЦИОНАЛНИ цифри (tabular-nums на
// голямо число изглежда разхлабено), същият sans като останалия интерфейс — без
// display/serif „декорация"; статусният цвят идва с иконка и знак, не само с
// цвят; „—" при липсваща стойност вместо подвеждаща нула.
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatTile({ icon: Icon, label, value, unit, deltaPct, hint, invertDelta = false }) {
  const has = value !== null && value !== undefined;
  // При „средно време до отговор" по-малкото е ДОБРО — затова invertDelta.
  const good = deltaPct == null ? null : invertDelta ? deltaPct < 0 : deltaPct > 0;
  const flat = deltaPct === 0;

  return (
    <div className="cs-card !p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-mono uppercase tracking-wider text-cs-dim">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-cs-cyan flex-shrink-0" aria-hidden="true" />}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-cs-text leading-none">{has ? value : "—"}</span>
        {has && unit && <span className="text-sm text-cs-muted">{unit}</span>}
      </div>

      <div className="mt-2 flex items-center gap-2 min-h-[18px]">
        {deltaPct != null && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              flat ? "text-cs-dim" : good ? "text-success" : "text-warning"
            }`}
          >
            {flat ? <Minus className="w-3 h-3" aria-hidden="true" />
              : deltaPct > 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" />
              : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
            {deltaPct > 0 ? "+" : ""}{deltaPct}%
          </span>
        )}
        {hint && <span className="text-xs text-cs-dim truncate">{hint}</span>}
      </div>
    </div>
  );
}
