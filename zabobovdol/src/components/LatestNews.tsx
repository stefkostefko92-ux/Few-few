import Link from "next/link";
import { Section } from "@/components/ui";
import { getLatestNews } from "@/lib/news";
import { MUNICIPALITY_SOURCE } from "@/lib/ingest-news-parse";
import { plainText } from "@/lib/markdown";

// Блок „Последно от общината“ за началната страница (сървърен компонент).
// Показва последните ПУБЛИКУВАНИ новини с дата и източник. Ако няма нито една —
// не рендира нищо (празна кутия внушава изоставен сайт).
//
// По подразбиране — само новините с източник „Община Бобов дол“, за да е вярно
// заглавието; `source={null}` показва всички публикувани новини.
export async function LatestNews({
  limit = 3,
  source = MUNICIPALITY_SOURCE,
  title = "Последно от общината",
}: {
  limit?: number;
  source?: string | null;
  title?: string;
}) {
  const items = await getLatestNews(limit, source ? { source } : {});
  if (items.length === 0) return null;

  const fmt = new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Sofia",
  });

  return (
    <Section title={title} href="/novini" hrefLabel="Всички новини">
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map((n) => {
          const summary = n.excerpt || plainText(n.content ?? "", 130);
          return (
            <li key={n.id}>
              <Link href={`/novini/${n.slug}`} className="card block h-full min-h-[44px]">
                <div className="text-sm text-slate-600">
                  <time dateTime={n.date.toISOString()}>{fmt.format(n.date)}</time>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{n.title}</h3>
                {summary && <p className="mt-1 text-sm text-slate-600">{summary}</p>}
                {n.source && (
                  <div className="mt-2 text-xs text-slate-600">Източник: {n.source}</div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
