import { prisma } from "@/lib/prisma";
import { BusinessForm } from "./BusinessForm";
import { deleteBusiness } from "./actions";

export const dynamic = "force-dynamic";

async function getBusinesses() {
  try {
    return await prisma.business.findMany({ orderBy: { name: "asc" }, take: 300 });
  } catch {
    return [];
  }
}

export default async function AdminBiznesPage() {
  const items = await getBusinesses();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Местен бизнес
      </h1>

      <div className="mt-6">
        <h2 className="section-title mb-4">Добави нов</h2>
        <BusinessForm />
      </div>

      <div className="mt-10">
        <h2 className="section-title mb-4">Съществуващи ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-base text-slate-600">Няма добавени фирми.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((b) => (
              <li key={b.id} className="card flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">
                    {b.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {[b.category, b.address, b.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <form action={deleteBusiness}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn-secondary text-red-700" type="submit">
                    Изтрий
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
