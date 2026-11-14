import Link from "next/link";
import { Section } from "@/components/ui";
import { getLatestNews } from "@/lib/news";
import { MUNICIPALITY_SOURCE } from "@/lib/ingest-news-parse";
import { plainText } from "@/lib/markdown";
import { formatDate, isoDate } from "@/lib/format-date";

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

  return (
    <Section title={title} href="/novini" hrefLabel="Всички новини">
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map((n) => {
          const summary = n.excerpt || plainText(n.content ?? "", 130);
          return (
            <li key={n.id}>
              <Link href={`/novini/${n.slug}`} className="card group flex h-full flex-col">
                <p className="text-meta">
                  <time dateTime={isoDate(n.date)}>{formatDate(n.date)}</time>
                </p>
                <h3 className="h-card mt-1 group-hover:underline">{n.title}</h3>
                {summary && <p className="mt-1 text-base text-slate-600">{summary}</p>}
                {n.source && <p className="text-meta mt-auto pt-2">Източник: {n.source}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
