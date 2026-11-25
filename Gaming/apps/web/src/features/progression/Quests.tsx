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
        <span
          className={cn("text-sm", q.completed ? "text-ink-muted line-through" : "text-ink-100")}
        >
          {label}
        </span>
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

/** Запомненият избор „свито/разгънато“ (само удобство в този браузър). */
const COLLAPSE_KEY = "aso.quests.collapsed";
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* без хранилище (частен режим) — само за тази сесия */
  }
}

/** Панел „Задачи“ в лобито: дневни и седмични мисии с прогрес и награда (§12).
 *  Свива се до един ред с обобщение — изборът се помни, за да не пречи на игрите. */
export function Quests() {
  const { t } = useTranslation();
  const [state, setState] = useState<Load>({ status: "loading" });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () =>
    setCollapsed((v) => {
      writeCollapsed(!v);
      return !v;
    });

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

  const quests = state.status === "ready" ? state.quests : [];
  const done = quests.filter((q) => q.completed).length;
  const share = quests.length > 0 ? Math.round((done / quests.length) * 100) : 0;

  return (
    <Panel
      className="mb-6"
      aria-labelledby="quests-title"
      data-testid="quests"
      data-collapsed={collapsed}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="quests-title" className="flex items-center gap-3 text-lg text-brass-300">
          {t("quests.title")}
          {quests.length > 0 ? (
            <span className="tnum rounded-full border border-brass-400/25 bg-brass-400/10 px-2.5 py-0.5 font-body text-xs font-semibold text-brass-100">
              {t("quests.summary", { done, total: quests.length })}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="quests-body"
          data-action="quests-toggle"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-brass-400/20 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-brass-300/60 hover:text-brass-100"
        >
          {collapsed ? t("quests.show") : t("quests.hide")}
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className={cn(
              "size-3 transition-transform motion-reduce:transition-none",
              !collapsed && "rotate-180",
            )}
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {collapsed ? (
        quests.length > 0 ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-felt-700" aria-hidden>
            <div
              className="h-full rounded-full bg-gradient-to-r from-brass-100 to-brass-400"
              style={{ width: `${share}%` }}
            />
          </div>
        ) : null
      ) : (
        <div id="quests-body">
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
                      <span className="text-xs font-normal text-ink-muted">
                        · {t(`quests.resets.${period}`)}
                      </span>
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
        </div>
      )}
    </Panel>
  );
}
