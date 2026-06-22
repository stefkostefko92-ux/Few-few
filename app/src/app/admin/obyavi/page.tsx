import { prisma } from "@/lib/prisma";
import { publishListing, deleteListing } from "./actions";

export const dynamic = "force-dynamic";

async function getListings() {
  try {
    return await prisma.listing.findMany({
      orderBy: [{ published: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
  } catch {
    return [];
  }
}

export default async function AdminObyaviPage() {
  const items = await getListings();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Обяви ({items.length})
      </h1>

      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма обяви.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((l) => (
            <li key={l.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge">
                  {l.published ? "Публикувана" : "Чака преглед"}
                </span>
                <span className="text-sm text-slate-500">{l.type}</span>
              </div>
              <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                {l.title}
              </h2>
              {l.price && <p className="text-brand-700">{l.price}</p>}
              <p className="mt-2 whitespace-pre-line text-base text-slate-700">
                {l.description}
              </p>
              {(l.contactName || l.contactPhone || l.contactEmail) && (
                <p className="mt-2 text-sm text-slate-500">
                  {[l.contactName, l.contactPhone, l.contactEmail]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {!l.published && (
                  <form action={publishListing}>
                    <input type="hidden" name="id" value={l.id} />
                    <button className="btn-primary" type="submit">
                      Публикувай
                    </button>
                  </form>
                )}
                <form action={deleteListing}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="btn-secondary text-red-700" type="submit">
                    Изтрий
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
