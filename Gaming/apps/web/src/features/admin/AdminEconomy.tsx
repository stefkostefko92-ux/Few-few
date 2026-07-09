import { useTranslation } from "react-i18next";
import { Panel } from "../../ui";
import { GAME_CATALOG } from "../lobby/games";
import { adminApi } from "./adminApi";
import { ErrorPanel, useLoad } from "./load";

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const DAYS = 14;

/** Economy tab: 14-day per-day DAU / registrations / matches / revenue table
 *  plus top games by matches played. Plain tables — no chart libs. */
export function AdminEconomy() {
  const { t, i18n } = useTranslation();
  const { data, error, loading, reload } = useLoad(() => adminApi.timeseries(DAYS), []);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-ink-muted">{t("common.loading")}</p>;

  // Most recent day first — that's what staff scan for.
  const series = [...data.series].reverse();
  const totals = data.series.reduce(
    (acc, p) => ({
      registrations: acc.registrations + p.registrations,
      matches: acc.matches + p.matches,
      purchases: acc.purchases + p.purchases,
      revenueCents: acc.revenueCents + p.revenueCents,
    }),
    { registrations: 0, matches: 0, purchases: 0, revenueCents: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel className="overflow-x-auto p-0">
        <div className="px-4 pt-4">
          <h3 className="text-lg text-ink-100">{t("admin.perDay", "По дни (последни 14)")}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted">
            <tr className="border-b border-brass-400/15">
              <th className="px-4 py-2">{t("admin.day", "Ден")}</th>
              <th className="px-3 py-2 text-right">{t("admin.dau", "DAU")}</th>
              <th className="px-3 py-2 text-right">{t("admin.registrations", "Регистрации")}</th>
              <th className="px-3 py-2 text-right">{t("admin.matches")}</th>
              <th className="px-3 py-2 text-right">{t("admin.purchases")}</th>
              <th className="px-4 py-2 text-right">{t("admin.revenue")}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.day} className="border-b border-brass-400/5">
                <td className="px-4 py-1.5 text-ink-300">
                  {new Date(`${p.day}T00:00:00Z`).toLocaleDateString(i18n.language)}
                </td>
                <td className="px-3 py-1.5 text-right tnum text-ink-100">{p.dau}</td>
                <td className="px-3 py-1.5 text-right tnum text-ink-300">{p.registrations}</td>
                <td className="px-3 py-1.5 text-right tnum text-ink-300">{p.matches}</td>
                <td className="px-3 py-1.5 text-right tnum text-ink-300">{p.purchases}</td>
                <td className="px-4 py-1.5 text-right tnum text-brass-300">{eur(p.revenueCents)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-2 font-semibold text-ink-100">Σ</td>
              <td className="px-3 py-2 text-right text-ink-muted">—</td>
              <td className="px-3 py-2 text-right tnum font-semibold text-ink-100">{totals.registrations}</td>
              <td className="px-3 py-2 text-right tnum font-semibold text-ink-100">{totals.matches}</td>
              <td className="px-3 py-2 text-right tnum font-semibold text-ink-100">{totals.purchases}</td>
              <td className="px-4 py-2 text-right tnum font-semibold text-brass-300">{eur(totals.revenueCents)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel>
        <h3 className="mb-3 text-lg text-ink-100">{t("admin.topGames", "Топ игри (14 дни)")}</h3>
        {data.topGames.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("admin.noGames")}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.topGames.map((g) => (
              <li key={g.game} className="flex items-center justify-between">
                <span className="text-ink-200">
                  {GAME_CATALOG.find((c) => c.key === g.game)?.title ?? g.game}
                </span>
                <span className="tnum text-brass-300">{g.matches}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
