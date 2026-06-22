import { prisma } from "@/lib/prisma";
import { markContacted, deleteAd } from "./actions";

export const dynamic = "force-dynamic";

async function getAds() {
  try {
    return await prisma.adRequest.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  } catch {
    return [];
  }
}

export default async function AdminReklamaPage() {
  const items = await getAds();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Заявки за реклама ({items.length})
      </h1>
      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма заявки.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((a) => (
            <li key={a.id} className="card">
              <span className="badge">{a.status}</span>
              <h2 className="mt-2 font-bold text-slate-900">{a.fullName}</h2>
              <p className="text-sm text-slate-500">
                {[a.phone, a.email].filter(Boolean).join(" · ")}
              </p>
              {a.message && <p className="mt-2 text-base text-slate-700">{a.message}</p>}
              <div className="mt-3 flex gap-2">
                {a.status === "NEW" && (
                  <form action={markContacted}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn-secondary" type="submit">Свързах се</button>
                  </form>
                )}
                <form action={deleteAd}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-secondary text-red-700" type="submit">Изтрий</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
