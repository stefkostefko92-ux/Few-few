import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getVehicle } from "@car-monitor/db";
import { formatEur } from "@car-monitor/shared";
import { RiskBadge, reasonLabel } from "../components/RiskBadge.tsx";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.make ?? ""} ${data.model ?? ""} — Car Monitor` : "Автомобил" },
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const vehicle = await getVehicle(context.cloudflare.env.DB, params.id!);
  if (!vehicle) throw new Response("Не е намерен", { status: 404 });
  return vehicle;
}

export default function Vehicle() {
  const v = useLoaderData<typeof loader>();
  return (
    <>
      <h1>
        {v.make} {v.model} {v.modelYear ?? ""} <RiskBadge level={v.riskLevel} />
      </h1>

      {v.riskReasons.length > 0 && (
        <div className="kpi" style={{ borderColor: "var(--red)" }}>
          <strong>Сигнали за риск</strong>
          <ul>
            {v.riskReasons.map((r) => (
              <li key={r}>{reasonLabel(r)}</li>
            ))}
          </ul>
        </div>
      )}

      <table style={{ marginTop: 16 }}>
        <tbody>
          <tr><th>VIN</th><td>{v.vin ?? "—"}</td></tr>
          <tr><th>Рег. номер</th><td>{v.plate ?? "—"}</td></tr>
          <tr><th>Цена</th><td>{formatEur(v.priceEur)}</td></tr>
          <tr><th>Пробег</th><td>{v.mileageKm != null ? `${v.mileageKm.toLocaleString("bg-BG")} км` : "—"}</td></tr>
          <tr><th>Гориво</th><td>{v.fuelType ?? "—"}</td></tr>
          <tr><th>Скоростна кутия</th><td>{v.gearbox ?? "—"}</td></tr>
          <tr><th>Мощност</th><td>{v.powerHp != null ? `${v.powerHp} к.с.` : "—"}</td></tr>
          <tr><th>Внос от</th><td>{v.originCountry ?? "—"}</td></tr>
          <tr><th>Продавач</th><td>{v.seller ? `${v.seller.name} (${v.seller.kind ?? "—"})` : "—"}</td></tr>
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>История на автомобила</h2>
      {v.timeline.length === 0 ? (
        <p className="muted">Няма налични събития.</p>
      ) : (
        <ul className="timeline">
          {v.timeline.map((e) => (
            <li key={e.id}>
              <strong>{e.eventDate ?? "—"}</strong> · {e.eventType}
              {e.mileageKm != null && ` · ${e.mileageKm.toLocaleString("bg-BG")} км`}
              {e.description && <div className="muted">{e.description}</div>}
              {e.source && <span className="muted"> ({e.source})</span>}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 24 }}>Обяви</h2>
      <table>
        <thead>
          <tr><th>Дата</th><th>Източник</th><th>Цена</th><th>Пробег</th><th></th></tr>
        </thead>
        <tbody>
          {v.listings.map((l) => (
            <tr key={l.id}>
              <td>{l.listedAt ?? "—"}</td>
              <td>{l.source ?? "—"}</td>
              <td>{formatEur(l.priceEur)}</td>
              <td>{l.mileageKm != null ? `${l.mileageKm.toLocaleString("bg-BG")} км` : "—"}</td>
              <td>{l.url && <a href={l.url} target="_blank" rel="noreferrer">обява ↗</a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
