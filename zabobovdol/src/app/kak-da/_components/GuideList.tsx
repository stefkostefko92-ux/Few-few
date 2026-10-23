import Link from "next/link";

export type GuideListItem = { id: string; slug: string; question: string; snippet?: string };

// Списък с ръководства като карти — общ за темите и за филтъра по етикет.
export function GuideList({ items }: { items: GuideListItem[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((g) => (
        <li key={g.id}>
          <Link href={`/kak-da/${g.slug}`} className="card block h-full">
            <h2 className="text-lg font-semibold text-slate-900">{g.question}</h2>
            {g.snippet && <p className="mt-1 text-base text-slate-600">{g.snippet}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
