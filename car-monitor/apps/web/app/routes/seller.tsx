import { useLoaderData, Link } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getSeller } from "@car-monitor/db";
import { formatEur } from "@car-monitor/shared";
import { VehicleTable } from "../components/VehicleTable.tsx";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.name} — Car Monitor` : "Продавач" },
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const seller = await getSeller(context.cloudflare.env.DB, params.id!);
  if (!seller) throw new Response("Не е намерен", { status: 404 });
  return seller;
}

export default function Seller() {
  const s = useLoaderData<typeof loader>();
  const suspectPct = Math.round(s.suspectShare * 100);
  return (
    <>
      <h1>{s.name}</h1>
      <p className="muted">
        {s.kind ?? "продавач"}
        {s.settlement ? ` · ${s.settlement}` : ""}
        {s.region ? ` · ${s.region}` : ""}
      </p>

      <div className="kpis">
        <div className="kpi">
          <div className="n">{s.vehicles.toLocaleString("bg-BG")}</div>
          <div className="l">Автомобили</div>
        </div>
        <div className="kpi">
          <div className="n">{formatEur(s.medianPriceEur)}</div>
          <div className="l">Медианна цена</div>
        </div>
        <div className="kpi">
          <div className="n" style={{ color: s.redListings ? "var(--red)" : undefined }}>
            {s.redListings.toLocaleString("bg-BG")}
          </div>
          <div className="l">С висок риск</div>
        </div>
        <div className="kpi">
          <div className="n" style={{ color: suspectPct >= 30 ? "var(--yellow)" : undefined }}>
            {suspectPct}%
          </div>
          <div className="l">Дял съмнителни</div>
        </div>
      </div>

      {s.models.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Най-предлагани модели</h2>
          <table>
            <thead>
              <tr><th>Модел</th><th>Обяви</th><th>Медианна цена</th></tr>
            </thead>
            <tbody>
              {s.models.map((m) => (
                <tr key={m.modelKey}>
                  <td>
                    {m.make && m.model ? (
                      <Link to={`/models/${encodeURIComponent(m.make)}/${encodeURIComponent(m.model)}`}>
                        {m.make} {m.model}
                      </Link>
                    ) : (
                      m.modelKey
                    )}
                  </td>
                  <td>{m.listings}</td>
                  <td>{formatEur(m.medianPriceEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ marginTop: 24 }}>Налични автомобили</h2>
      <VehicleTable items={s.inventory} />
    </>
  );
}
