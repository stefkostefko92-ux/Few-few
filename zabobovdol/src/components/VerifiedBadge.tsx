import { ShieldCheck } from "@/components/icons";

// „Проверено на … · източник: …“ до телефона. Показва се САМО когато админът
// е въвел дата на проверка — никога не се измисля (updatedAt не е проверка:
// мени се при всяка редакция). След ~6 месеца излиза „Предстои повторна проверка“,
// за да не изглежда старата проверка като днешна.
const STALE_MS = 183 * 86_400_000;

const DATE_FMT = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Източникът е свободен текст („bobovdol.bg“, „обаждане до аптеката“) или
// адрес. Връзка правим само към http(s) — нищо друго не става href.
export function sourceLink(source: string): URL | null {
  if (!/^https?:\/\//i.test(source.trim())) return null;
  try {
    const u = new URL(source.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function VerifiedBadge({
  at,
  source,
  className = "",
}: {
  at: Date | null | undefined;
  source?: string | null;
  className?: string;
}) {
  if (!at || Number.isNaN(at.getTime())) return null;
  const src = (source ?? "").trim();
  const url = src ? sourceLink(src) : null;
  const stale = Date.now() - at.getTime() > STALE_MS;

  return (
    <p className={"flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600 " + className}>
      <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
      <span>Проверено на {DATE_FMT.format(at)}</span>
      {src && (
        <span>
          · източник:{" "}
          {url ? (
            <a
              href={url.toString()}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              {url.hostname.replace(/^www\./, "")}
            </a>
          ) : (
            src
          )}
        </span>
      )}
      {stale && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
          Предстои повторна проверка
        </span>
      )}
    </p>
  );
}
