// Форматиране за UI (български локал).

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(date);
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "никога";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("bg-BG", { numeric: "auto" });
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${ms} ms`;
}
