import Link from "next/link";
import { ChevronDown } from "@/components/icons";

export type GuideListItem = { id: string; slug: string; question: string; snippet?: string };

/**
 * Една карта-връзка към ръководство — еднаква навсякъде (темите, етикетите,
 * „Най-четени“, „Сродни“, /izmami, /pomoshti): заглавие на Inter в синьо,
 * по избор кратко описание и „›“ вдясно като знак, че се натиска. `h-full` —
 * картите в един ред са с еднаква височина.
 */
export function GuideCard({
  guide,
  as: Title = "h2",
  className = "",
}: {
  guide: GuideListItem;
  /** Нивото на заглавието според мястото (h2 на страница с теми, h3 под раздел). */
  as?: "h2" | "h3" | "p";
  className?: string;
}) {
  return (
    <Link
      href={`/kak-da/${guide.slug}`}
      className={`card group flex h-full items-start gap-3 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <Title className="h-card text-brand-800">{guide.question}</Title>
        {guide.snippet && <p className="mt-1 text-base text-slate-600">{guide.snippet}</p>}
      </div>
      <ChevronDown className="mt-0.5 h-6 w-6 shrink-0 -rotate-90 text-brand-600" aria-hidden />
    </Link>
  );
}

// Списък с ръководства като карти — общ за темите и за филтъра по етикет.
export function GuideList({
  items,
  as = "h2",
  className = "",
}: {
  items: GuideListItem[];
  as?: "h2" | "h3" | "p";
  className?: string;
}) {
  return (
    <ul role="list" className={`grid gap-4 md:grid-cols-2 ${className}`}>
      {items.map((g) => (
        <li key={g.id}>
          <GuideCard guide={g} as={as} />
        </li>
      ))}
    </ul>
  );
}
