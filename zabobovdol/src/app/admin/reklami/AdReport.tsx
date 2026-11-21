import { SITE } from "@/lib/site";
import { loadAdReport } from "@/lib/ad-report-data";
import {
  advertiserText,
  formatDecimal,
  formatEur,
  formatInt,
  formatPercent,
  MIN_SAMPLE,
  toCents,
  type MonthReport,
} from "@/lib/ad-report";
import { CopyText } from "./CopyText";

function Approx({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1 text-xs text-amber-900" title={`По-малко от ${MIN_SAMPLE} — ориентировъчно`}>
      (малко данни)
    </span>
  );
}

function money(cents: number | null): string {
  return cents === null ? "—" : formatEur(cents);
}

// Последният ЗАВЪРШЕН месец е най-честният за изпращане; ако още няма такъв
// с данни, ползваме текущия.
function pickForText(months: MonthReport[]): MonthReport | null {
  return months.find((m) => !m.partial && m.views > 0) ?? months.find((m) => m.views > 0) ?? null;
}

// Месечен отчет за рекламодателя: колко пъти е показан банерът, колко клика и
// каква е цената на 1000 показвания и на клик при сегашната цена. Само общи
// броеве на ден (DailyStat) — никакви данни за отделни хора.
export async function AdReport() {
  const data = await loadAdReport(6);
  const forText = pickForText(data.months);
  const text = forText ? advertiserText(forText, SITE.name, data.priceEur) : "";

  return (
    <section aria-labelledby="ad-report-title" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="ad-report-title" className="text-xl font-bold text-slate-900">
        Отчет за рекламодателя
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Сегашна цена: <strong className="text-slate-800">{formatEur(toCents(data.priceEur))}</strong> на
        месец за един банер · Публикувани банери: <strong className="text-slate-800">{data.activeBanners}</strong>
      </p>

      {!data.available ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Статистиката още не е достъпна (липсва таблицата или базата не отговаря). Пуснете миграциите и
          опитайте пак.
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Показвания, кликове и цена по месеци</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr>
                  <th scope="col" className="p-3 font-semibold text-slate-600">
                    Месец
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Показвания на банер
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Кликове (общо)
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Банери
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Кликове на 100 показвания
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Цена на 1000 показвания
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold text-slate-600">
                    Средна цена на клик
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="p-3 text-left font-medium text-slate-800">
                      {m.label}
                      {m.partial && (
                        <span className="block text-xs font-normal text-slate-600">
                          до днес ({m.daysCounted} от {m.daysInMonth} дни)
                        </span>
                      )}
                    </th>
                    <td className="p-3 text-right text-slate-800">
                      {formatInt(m.views)}
                      <Approx show={m.views > 0 && m.lowViews} />
                    </td>
                    <td className="p-3 text-right text-slate-800">
                      {formatInt(m.clicks)}
                      {m.banners > 1 && m.clicksPerBanner !== null && (
                        <span className="block text-xs text-slate-600">
                          ≈ {formatDecimal(m.clicksPerBanner)} на банер
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right text-slate-800">{m.banners}</td>
                    <td className="p-3 text-right text-slate-800">
                      {m.ctr === null ? "—" : formatPercent(m.ctr)}
                      <Approx show={m.ctr !== null && m.lowClicks} />
                    </td>
                    <td className="p-3 text-right text-slate-800">{money(m.cpmCents)}</td>
                    <td className="p-3 text-right text-slate-800">{money(m.cpcCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-3 text-sm text-slate-600">
            <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-slate-700">
              Как се смята?
            </summary>
            <ul className="ml-5 list-disc space-y-1 pb-2">
              <li>
                „Показвания“ = колко пъти е отворена началната страница. Там стоят всички банери, затова всеки банер
                се показва толкова пъти. Това е горна граница — не всеки превърта до банерите.
              </li>
              <li>
                „Кликове“ = натискания на банер на началната страница, общо за всички банери (сайтът не пази кой
                банер е натиснат). Средната цена на клик ги дели поравно между банерите.
              </li>
              <li>
                Цената е сегашната месечна цена. За текущия месец се взема само частта за изминалите дни.
              </li>
              <li>
                Броят на банерите е по сегашните публикувани банери и датата им на създаване — свалени банери не се
                виждат, затова за минали месеци числото е приблизително.
              </li>
              <li>
                Под {MIN_SAMPLE} прегледа или клика числата са ориентировъчни. Ботовете не се броят.
              </li>
              <li>Пазят се само общи броеве на ден — без бисквитки, IP адреси или данни за отделни хора.</li>
            </ul>
          </details>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-slate-900">Текст за изпращане на рекламодател</h3>
            {forText && text ? (
              <>
                <p className="mt-1 text-sm text-slate-600">За {forText.label}{forText.partial ? " (до днес)" : ""}:</p>
                <p className="mt-2 rounded-lg bg-slate-50 p-3 text-slate-800">{text}</p>
                <div className="mt-3">
                  <CopyText text={text} />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Още няма преброени отваряния на началната страница. Текстът ще се появи, щом има данни.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
