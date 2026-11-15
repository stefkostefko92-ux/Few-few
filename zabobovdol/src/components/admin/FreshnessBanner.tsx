import Link from "next/link";
import { checkFreshness, type FreshnessResult } from "@/lib/freshness";
import { FRESHNESS_THRESHOLDS, type FreshnessProblem } from "@/lib/freshness-core";

// Червена лента на таблото: кои сведения може да са остарели и къде се поправят.
// Същата проверка като GET /api/health/freshness (src/lib/freshness.ts). Без
// проблеми → нищо. Ако самата проверка се провали, таблото НЕ се чупи — показва
// се само кратка бележка.

const T = FRESHNESS_THRESHOLDS;

const FIX: Record<FreshnessProblem["code"], { title: string; href: string; cta: string }> = {
  pharmacy_today_missing: {
    title: "Няма въведена дежурна аптека за днес.",
    href: "/admin/dezhurstva/new",
    cta: "Въведи дежурство",
  },
  news_waiting_approval: {
    title: `Внесени новини чакат преглед повече от ${T.pendingDays} дни.`,
    href: "/admin/novini",
    cta: "Прегледай новините",
  },
  news_not_imported: {
    title: `Последните ${T.newsDays} дни не е внесена нито една новина от общината.`,
    href: "/admin/novini",
    cta: "Внеси новини",
  },
  news_not_published: {
    title: `Последните ${T.newsDays} дни не е публикувана нито една новина.`,
    href: "/admin/novini",
    cta: "Към новините",
  },
  scams_stale: {
    title: `Предупрежденията за измами не са обновявани повече от ${T.scamDays} дни.`,
    href: "/admin/izmami",
    cta: "Прегледай измамите",
  },
  outages_stale: {
    title: `Прекъсванията на ток и вода не са обновявани повече от ${T.outageDays} дни.`,
    href: "/admin/prekysvaniya",
    cta: "Обнови прекъсванията",
  },
  services_unverified: {
    title: `Има телефони в „Услуги“, които не са проверени последните ${T.serviceMonths} месеца.`,
    href: "/admin/services",
    cta: "Провери номерата",
  },
};

export async function FreshnessBanner() {
  let result: FreshnessResult;
  try {
    ({ result } = await checkFreshness());
  } catch (err) {
    console.error(
      "[admin] проверката за свежест не мина:",
      err instanceof Error ? err.message : err,
    );
    return (
      <p className="text-sm text-slate-600">
        Проверката дали данните са актуални не можа да се направи сега. Опитайте по-късно.
      </p>
    );
  }

  if (result.problems.length === 0) return null;

  // Спешното (напр. липсваща дежурна аптека) — най-горе.
  const problems = [...result.problems].sort(
    (a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"),
  );

  return (
    <section
      aria-labelledby="freshness-title"
      className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
    >
      <h2 id="freshness-title" className="text-lg font-bold">
        {problems.length === 1
          ? "1 сведение може да е остаряло"
          : `${problems.length} сведения може да са остарели`}
      </h2>
      <p className="mt-1 text-sm">
        Хората разчитат на тези данни. Поправете ги, когато можете — спешното е най-горе.
      </p>
      <ul className="mt-3 space-y-3">
        {problems.map((p) => {
          const fix = FIX[p.code];
          return (
            <li
              key={p.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {p.severity === "critical" && (
                    <span className="mr-2 inline-block rounded bg-red-700 px-2 py-0.5 text-xs font-bold text-white">
                      Спешно
                    </span>
                  )}
                  {fix ? fix.title : p.message}
                </div>
                {fix && <div className="mt-1 text-sm text-slate-700">{p.message}</div>}
              </div>
              {fix && (
                <Link href={fix.href} className="btn-secondary min-h-11 shrink-0">
                  {fix.cta} <span aria-hidden>→</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
