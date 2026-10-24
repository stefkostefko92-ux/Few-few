import Link from "next/link";
import { AlertTriangle } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { formatDate, isoDate } from "@/lib/format-date";

// Показва закачено предупреждение за измама като видна лента (ако има активно).
// Датата е важна: без нея старо предупреждение изглежда като днешно. Текстът е
// text-base — това е най-важното съобщение за възрастните.
export async function ScamBanner() {
  let alert: { title: string; summary: string; createdAt: Date } | null = null;
  try {
    alert = await prisma.scamAlert.findFirst({
      where: { published: true, pinned: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: { title: true, summary: true, createdAt: true },
    });
  } catch {
    alert = null;
  }
  if (!alert) return null;

  return (
    <Link
      href="/izmami"
      className="block border-b border-crimson-800 bg-crimson-700 text-white transition-colors hover:bg-crimson-800"
    >
      <div className="container-content flex min-h-tap items-center gap-3 py-3 text-base">
        <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
        <span className="min-w-0">
          <strong className="font-bold">Внимание, измама: </strong>
          {alert.title}
          {alert.summary ? ` — ${alert.summary}` : ""}
          <span className="text-sm">
            {" "}
            · публикувано на{" "}
            <time dateTime={isoDate(alert.createdAt)}>{formatDate(alert.createdAt)}</time>
          </span>{" "}
          <span className="font-semibold underline underline-offset-2">
            Вижте как да се пазите<span aria-hidden="true">&nbsp;→</span>
          </span>
        </span>
      </div>
    </Link>
  );
}
