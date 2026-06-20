import { useLoaderData, Link, Form } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { listVehicles } from "@car-monitor/db";
import { formatEur } from "@car-monitor/shared";
import type { ListingsQuery } from "@car-monitor/api-contract";
import { RiskBadge } from "../components/RiskBadge.tsx";

export const meta: MetaFunction = () => [{ title: "Автомобили — Car Monitor" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const num = (k: string) => {
    const v = url.searchParams.get(k);
    return v ? Number(v) : undefined;
  };
  const query: ListingsQuery = {
    make: url.searchParams.get("make") ?? undefined,
    fuel: url.searchParams.get("fuel") ?? undefined,
    priceMax: num("priceMax"),
    risk: (url.searchParams.get("risk") as ListingsQuery["risk"]) ?? undefined,
    sort: (url.searchParams.get("sort") as ListingsQuery["sort"]) ?? undefined,
    page: num("page"),
  };
  const result = await listVehicles(context.cloudflare.env.DB, query);
  return { result, query };
}

export default function Vehicles() {
  const { result, query } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Автомобили</h1>
      <Form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <input name="make" placeholder="Марка" defaultValue={query.make ?? ""} />
        <input name="priceMax" placeholder="Макс. цена (EUR)" defaultValue={query.priceMax ?? ""} />
        <select name="risk" defaultValue={query.risk ?? ""}>
          <option value="">Всякакъв риск</option>
          <option value="green">Нисък</option>
          <option value="yellow">Внимание</option>
          <option value="red">Висок</option>
        </select>
        <select name="sort" defaultValue={query.sort ?? ""}>
          <option value="">По цена (намаляващо)</option>
          <option value="price_asc">По цена (нарастващо)</option>
          <option value="newest">Най-нови</option>
        </select>
        <button type="submit">Филтрирай</button>
      </Form>
      <p className="muted">{result.total.toLocaleString("bg-BG")} резултата</p>
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
          {result.items.map((v) => (
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
    </>
  );
}
