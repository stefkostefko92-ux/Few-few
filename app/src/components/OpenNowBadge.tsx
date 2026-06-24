// Малка значка „Отворено сега / Затворено”, пресметната от работното време.
// Сървърен компонент — изчислява се при заявка (страниците са force-dynamic).
// При неразбираемо работно време не показва нищо (за да не подвежда).
import { openState } from "@/lib/hours";

export function OpenNowBadge({ hours, className = "" }: { hours?: string | null; className?: string }) {
  if (!hours) return null;
  const state = openState(hours);
  if (state.status === "unknown") return null;

  const open = state.status === "open";
  const label = open ? "Отворено сега" : "Затворено сега";
  const detail = open
    ? state.until
      ? ` · до ${state.until}`
      : ""
    : state.opensAt
      ? ` · отваря в ${state.opensAt}`
      : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        open ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${open ? "bg-green-600" : "bg-slate-500"}`}
      />
      {label}
      {detail}
    </span>
  );
}
