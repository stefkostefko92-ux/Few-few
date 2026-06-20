import { Link } from "react-router";
import type { VehicleListItem } from "@car-monitor/api-contract";
import { formatEur } from "@car-monitor/shared";
import { RiskBadge } from "./RiskBadge.tsx";

export function VehicleTable({ items }: { items: VehicleListItem[] }) {
  if (items.length === 0) return <p className="muted">Няма автомобили.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Автомобил</th>
          <th>Година</th>
          <th>Пробег</th>
          <th>Цена</th>
          <th>Град</th>
          <th>Риск</th>
        </tr>
      </thead>
      <tbody>
        {items.map((v) => (
          <tr key={v.id}>
            <td>
              <Link to={`/vehicles/${v.id}`}>
                {v.make} {v.model}
              </Link>
            </td>
            <td>{v.modelYear ?? "—"}</td>
            <td>{v.mileageKm != null ? `${v.mileageKm.toLocaleString("bg-BG")} км` : "—"}</td>
            <td>{formatEur(v.priceEur)}</td>
            <td>{v.settlement ?? "—"}</td>
            <td>
              <RiskBadge level={v.riskLevel} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
