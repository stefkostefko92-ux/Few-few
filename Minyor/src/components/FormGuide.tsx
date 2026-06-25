import { matchResult, OUTCOME_SHORT, OUTCOME_LABEL, type MatchLike } from "@/lib/match";

const STYLE: Record<string, string> = {
  WIN: "bg-green-600",
  DRAW: "bg-slate-400",
  LOSS: "bg-crimson-600",
};

// Последни резултати като поредица от кръгчета П/Р/З (най-новият — отдясно).
export function FormGuide({
  matches,
  limit = 5,
}: {
  matches: MatchLike[];
  limit?: number;
}) {
  const finished = matches
    .filter((m) => matchResult(m).outcome !== null)
    .slice(0, limit)
    .reverse();

  if (finished.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" aria-label="Форма от последните мачове">
      {finished.map((m) => {
        const o = matchResult(m).outcome!;
        return (
          <span
            key={m.id}
            className={
              "inline-grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white " +
              STYLE[o]
            }
            title={`${OUTCOME_LABEL[o]} срещу ${m.opponent}`}
          >
            {OUTCOME_SHORT[o]}
          </span>
        );
      })}
    </div>
  );
}
