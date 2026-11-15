import { ShieldCheck } from "@/components/icons";
import { formatDate, isoDate } from "@/lib/format-date";

// „Проверено на … · източник: …“ до телефона. Показва се САМО когато админът
// е въвел дата на проверка — никога не се измисля (updatedAt не е проверка:
// мени се при всяка редакция). След ~6 месеца излиза „Предстои повторна проверка“,
// за да не изглежда старата проверка като днешна.
//
// Всичко след иконата е в ЕДИН ред текст, който се пренася по думи: точката
// е залепена (U+00A0) за датата, затова нов ред никога не започва с „·“.
// verifiedAt е поле datetime от админа — стенно софийско време ({ wall: true }).
const STALE_MS = 183 * 86_400_000;

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
    <p className={"flex items-start gap-1.5 text-sm text-slate-600 " + className}>
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
      <span>
        Проверено на{" "}
        <time dateTime={isoDate(at, { wall: true })}>{formatDate(at, { wall: true })}</time>
        {src && (
          <>
            {" · "}източник:{" "}
            {url ? (
              <a
                href={url.toString()}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="link"
              >
                {url.hostname.replace(/^www\./, "")}
              </a>
            ) : (
              src
            )}
          </>
        )}
        {stale && (
          <>
            {" "}
            <span className="badge-warning ml-0.5 align-middle">Предстои повторна проверка</span>
          </>
        )}
      </span>
    </p>
  );
}
