import { prisma } from "@/lib/prisma";
import { markHandled, deleteContact } from "./actions";

export const dynamic = "force-dynamic";

async function getMessages() {
  try {
    return await prisma.contactMessage.findMany({
      orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
  } catch {
    return [];
  }
}

export default async function AdminKontaktiPage() {
  const items = await getMessages();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Съобщения ({items.length})
      </h1>

      {items.length === 0 ? (
        <p className="mt-4 text-base text-slate-600">Няма съобщения.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((m) => (
            <li key={m.id} className="card">
              <span className="badge">
                {m.handled ? "Обработено" : "Ново"}
              </span>
              {m.subject && (
                <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                  {m.subject}
                </h2>
              )}
              <p className="mt-2 whitespace-pre-line text-base text-slate-700">
                {m.message}
              </p>
              {(m.name || m.phone || m.email) && (
                <p className="mt-2 text-sm text-slate-500">
                  {[m.name, m.phone, m.email].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {!m.handled && (
                  <form action={markHandled}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn-secondary" type="submit">
                      Отбележи като обработено
                    </button>
                  </form>
                )}
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={m.id} />
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
