import { useLoaderData, Link } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getHomeTotals } from "@car-monitor/db";
import { formatEur } from "@car-monitor/shared";

export const meta: MetaFunction = () => [
  { title: "Car Monitor — прозрачност на пазара на автомобили" },
  { name: "description", content: "Проследи историята на автомобила, цените и рисковете." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  return getHomeTotals(context.cloudflare.env.DB);
}

export default function Home() {
  const t = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Прозрачност на пазара на автомобили</h1>
      <p className="muted">
        Проследи историята на колата, цените и рисковете — върнат километраж, скрити
        катастрофи, клонирани VIN и аномални цени.
      </p>
      <div className="kpis">
        <div className="kpi">
          <div className="n">{t.vehicles.toLocaleString("bg-BG")}</div>
          <div className="l">Автомобили</div>
        </div>
        <div className="kpi">
          <div className="n">{t.activeListings.toLocaleString("bg-BG")}</div>
          <div className="l">Активни обяви</div>
        </div>
        <div className="kpi">
          <div className="n">{t.sellers.toLocaleString("bg-BG")}</div>
          <div className="l">Продавачи</div>
        </div>
        <div className="kpi">
          <div className="n" style={{ color: "var(--red)" }}>
            {t.redVehicles.toLocaleString("bg-BG")}
          </div>
          <div className="l">С висок риск</div>
        </div>
        <div className="kpi">
          <div className="n">{formatEur(t.medianPriceEur)}</div>
          <div className="l">Медианна цена</div>
        </div>
      </div>
      <p style={{ marginTop: 24 }}>
        <Link to="/vehicles">Разгледай всички автомобили →</Link>
      </p>
      {t.asOf && <p className="muted">Данни към: {t.asOf}</p>}
    </>
  );
}
