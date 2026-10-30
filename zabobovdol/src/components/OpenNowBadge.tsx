// Малка значка „Отворено сега / Затворено сега“, пресметната от работното време.
// Сървърен компонент — изчислява се при заявка (страниците са force-dynamic).
// При неразбираемо работно време не показва нищо (за да не подвежда).
// Значката е с ширината на текста (w-fit + self-start), а не на картата —
// иначе в flex колона се разпъваше като лента-прогрес. Отвореното е зелено
// (успех), затвореното — неутрално сиво; точката не е единственият сигнал.
import { openState } from "@/lib/hours";

/**
 * Работното време за показване до часовник или под етикет „Работно време“:
 * „Работно време: 09:00–17:30 ч.“ → „09:00–17:30 ч.“ (без повтора). Другите
 * уточнения („Приемно време за граждани: …“) остават.
 */
export function hoursText(h: string): string {
  return h.replace(/^\s*работно време:\s*/i, "");
}

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
      className={`${open ? "badge-success" : "badge-neutral"} self-start gap-1.5 tabular-nums ${className}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${open ? "bg-green-600" : "bg-slate-500"}`}
      />
      {label}
      {detail}
    </span>
  );
}
