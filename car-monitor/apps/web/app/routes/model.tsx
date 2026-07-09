import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getModel } from "@car-monitor/db";
import { formatEur } from "@car-monitor/shared";
import { PriceChart } from "../components/PriceChart.tsx";
import { VehicleTable } from "../components/VehicleTable.tsx";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.make} ${data.model} — цени и обяви — Car Monitor` : "Модел" },
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const model = await getModel(context.cloudflare.env.DB, params.make!, params.model!);
  if (!model) throw new Response("Не е намерен", { status: 404 });
  return model;
}

export default function Model() {
  const m = useLoaderData<typeof loader>();
  return (
    <>
      <h1>
        {m.make} {m.model}
      </h1>
      {m.segment && <p className="muted">Сегмент: {m.segment}</p>}

      <div className="kpis">
        <div className="kpi">
          <div className="n">{formatEur(m.medianPriceEur)}</div>
          <div className="l">Медианна цена</div>
        </div>
        <div className="kpi">
          <div className="n">{m.vehicles.toLocaleString("bg-BG")}</div>
          <div className="l">Автомобили</div>
        </div>
        <div className="kpi">
          <div className="n">
            {m.avgMileageKm != null ? `${Math.round(m.avgMileageKm).toLocaleString("bg-BG")} км` : "—"}
          </div>
          <div className="l">Среден пробег</div>
        </div>
        <div className="kpi">
          <div className="n" style={{ color: m.suspect ? "var(--yellow)" : undefined }}>
            {m.suspect.toLocaleString("bg-BG")}
          </div>
          <div className="l">Съмнителни</div>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Тренд на медианната цена</h2>
      <PriceChart points={m.priceHistory} />
      <p className="muted">
        Диапазон на цените: {formatEur(m.minPriceEur)} – {formatEur(m.maxPriceEur)}
      </p>

      <h2 style={{ marginTop: 24 }}>Обяви</h2>
      <VehicleTable items={m.inventory} />
    </>
  );
}
