import type { SiteStatus } from "@prisma/client";

const MAP: Record<SiteStatus, { label: string; cls: string; dot: string }> = {
  UP: { label: "Работи", cls: "bg-green-500/15 text-green-400", dot: "bg-green-400" },
  DEGRADED: {
    label: "Забавен",
    cls: "bg-amber-500/15 text-amber-400",
    dot: "bg-amber-400",
  },
  DOWN: { label: "Не работи", cls: "bg-red-500/15 text-red-400", dot: "bg-red-400" },
  PAUSED: { label: "На пауза", cls: "bg-ink-500/15 text-ink-400", dot: "bg-ink-400" },
  UNKNOWN: {
    label: "Неизвестно",
    cls: "bg-ink-500/15 text-ink-400",
    dot: "bg-ink-500",
  },
};

export function StatusBadge({ status }: { status: SiteStatus }) {
  const s = MAP[status] ?? MAP.UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
