import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { QuestPeriod, QuestView } from "@aso/shared";
import { Badge, Button, Panel, cn } from "../../ui";
import { api } from "../../lib/api";
import { gameTitle } from "../lobby/games";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; quests: QuestView[] };

const PERIODS: QuestPeriod[] = ["daily", "weekly"];

/** Етикет на задача от вида ѝ (игра/победа, брой, игра-филтър). */
function questLabel(q: QuestView, t: ReturnType<typeof useTranslation>["t"]): string {
  const base = q.trigger === "win" ? "quests.win" : "quests.play";
  return q.game
    ? t(`${base}Game`, { count: q.target, game: gameTitle(t, q.game) })
    : t(base, { count: q.target });
}

function QuestRow({ q }: { q: QuestView }) {
  const { t } = useTranslation();
  const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
  const label = questLabel(q, t);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("text-sm", q.completed ? "text-ink-muted line-through" : "text-ink-100")}>{label}</span>
        {q.completed ? (
          <Badge tone="brass">{t("quests.done")}</Badge>
        ) : (
          <span className="tnum text-xs text-ink-300">
            {t("quests.progress", { progress: Math.min(q.progress, q.target), target: q.target })}
          </span>
        )}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-felt-700"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={q.target}
        aria-valuenow={Math.min(q.progress, q.target)}
      >
        <div className="h-full rounded-full bg-brass-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="tnum mt-1 text-xs text-brass-300">
        {t("quests.reward", { chips: q.rewardChips, xp: q.rewardXp })}
      </p>
    </li>
  );
}

/** Панел „Задачи“ в лобито: дневни и седмични мисии с прогрес и награда (§12). */
export function Quests() {
  const { t } = useTranslation();
  const [state, setState] = useState<Load>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    api
      .quests()
      .then((r) => setState({ status: "ready", quests: r.quests }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Panel className="mb-6" aria-labelledby="quests-title">
      <h2 id="quests-title" className="text-lg text-brass-300">
        {t("quests.title")}
      </h2>
      {state.status === "loading" ? (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          {t("common.loading")}
        </p>
      ) : state.status === "error" ? (
        <div className="mt-2 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-ink-muted">{t("quests.error")}</p>
          <Button variant="felt" onClick={load}>
            {t("quests.retry")}
          </Button>
        </div>
      ) : state.quests.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t("quests.empty")}</p>
      ) : (
        <div className="mt-2 grid gap-x-8 md:grid-cols-2">
          {PERIODS.map((period) => {
            const list = state.quests.filter((q) => q.period === period);
            if (list.length === 0) return null;
            return (
              <section key={period} aria-label={t(`quests.${period}`)}>
                <h3 className="mt-2 text-sm font-semibold text-ink-300">
                  {t(`quests.${period}`)}{" "}
                  <span className="text-xs font-normal text-ink-muted">· {t(`quests.resets.${period}`)}</span>
                </h3>
                <ul className="divide-y divide-brass-400/10">
                  {list.map((q) => (
                    <QuestRow key={`${q.period}:${q.key}`} q={q} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
