import { useLoaderData, Link } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { search } from "@car-monitor/db";

export const meta: MetaFunction = () => [{ title: "Търсене — Car Monitor" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const hits = q ? await search(context.cloudflare.env.DB, q) : [];
  return { q, hits };
}

const HREF: Record<string, (ref: string) => string> = {
  vehicle: (ref) => `/vehicles/${ref}`,
  seller: (ref) => `/vehicles?seller=${ref}`,
  owner: (ref) => `/vehicles?owner=${ref}`,
  listing: (ref) => `/vehicles/${ref}`,
};

export default function Search() {
  const { q, hits } = useLoaderData<typeof loader>();
  return (
    <>
      <h1>Търсене</h1>
      {q && (
        <p className="muted">
          {hits.length} резултата за „{q}“
        </p>
      )}
      <ul>
        {hits.map((h) => (
          <li key={`${h.kind}:${h.ref}`}>
            <Link to={(HREF[h.kind] ?? ((r: string) => `/vehicles/${r}`))(h.ref)}>{h.title}</Link>
            {h.subtitle && <span className="muted"> — {h.subtitle}</span>}
          </li>
        ))}
      </ul>
      {q && hits.length === 0 && <p className="muted">Няма съвпадения.</p>}
    </>
  );
}
