// Брояч на посещенията — браузърната страна. Една заявка към /api/visit на
// ПЪЛНО зареждане на сайта: обещанието се пази в модула, а модулът живее
// докато страницата не се презареди. Затова началният екран и футърът четат
// един и същ номер, вътрешните навигации (App Router) не броят пак, а
// презареждането (F5) брои ново посещение.
let pending: Promise<number | null> | null = null;

export function visitNumber(): Promise<number | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  pending ??= fetch("/api/visit", { method: "POST" })
    .then((r) => r.json())
    .then((d: unknown) => {
      const n = (d as { ok?: unknown; n?: unknown } | null)?.n;
      return (d as { ok?: unknown } | null)?.ok === true && typeof n === "number" ? n : null;
    })
    .catch(() => null);
  return pending;
}

export function formatVisitNumber(n: number): string {
  return new Intl.NumberFormat("bg-BG").format(n);
}
