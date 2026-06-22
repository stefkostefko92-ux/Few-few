import { prisma } from "@/lib/prisma";
import { EventForm } from "./EventForm";
import { deleteEvent } from "./actions";

export const dynamic = "force-dynamic";

async function getEvents() {
  try {
    return await prisma.event.findMany({ orderBy: { startAt: "desc" }, take: 200 });
  } catch {
    return [];
  }
}

export default async function AdminSabitiyaPage() {
  const items = await getEvents();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Събития
      </h1>

      <div className="mt-6">
        <h2 className="section-title mb-4">Добави ново</h2>
        <EventForm />
      </div>

      <div className="mt-10">
        <h2 className="section-title mb-4">Съществуващи ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-base text-slate-600">Няма събития.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((e) => (
              <li key={e.id} className="card flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">
                    {e.title}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Intl.DateTimeFormat("bg-BG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(e.startAt)}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                </div>
                <form action={deleteEvent}>
                  <input type="hidden" name="id" value={e.id} />
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
