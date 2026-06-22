import { prisma } from "@/lib/prisma";
import {
  publishHelp, deleteHelp,
  publishVolunteer, deleteVolunteer,
  publishMemory, deleteMemory,
  publishPhoto, deletePhoto,
} from "./actions";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function Mod({
  publish,
  remove,
  id,
  published,
}: {
  publish: (fd: FormData) => void;
  remove: (fd: FormData) => void;
  id: string;
  published: boolean;
}) {
  return (
    <div className="mt-3 flex gap-2">
      {!published && (
        <form action={publish}>
          <input type="hidden" name="id" value={id} />
          <button className="btn-primary" type="submit">
            Публикувай
          </button>
        </form>
      )}
      <form action={remove}>
        <input type="hidden" name="id" value={id} />
        <button className="btn-secondary text-red-700" type="submit">
          Изтрий
        </button>
      </form>
    </div>
  );
}

export default async function AdminObshtnostPage() {
  const [help, volunteers, memories, photos] = await Promise.all([
    safe(() => prisma.helpCause.findMany({ orderBy: [{ published: "asc" }, { createdAt: "desc" }], take: 200 })),
    safe(() => prisma.volunteer.findMany({ orderBy: [{ published: "asc" }, { createdAt: "desc" }], take: 200 })),
    safe(() => prisma.memory.findMany({ orderBy: [{ published: "asc" }, { createdAt: "desc" }], take: 200 })),
    safe(() => prisma.galleryPhoto.findMany({ orderBy: [{ published: "asc" }, { createdAt: "desc" }], take: 200 })),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-slate-900">
          Общност
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Модерация на зов за помощ, доброволци, спомени и галерия.
        </p>
      </div>

      <section>
        <h2 className="section-title mb-4">Зов за помощ ({help.length})</h2>
        <ul className="space-y-3">
          {help.map((h) => (
            <li key={h.id} className="card">
              <span className="badge">{h.published ? "Публикуван" : "Чака"}</span>
              <h3 className="mt-2 font-bold text-slate-900">{h.title}</h3>
              <p className="text-base text-slate-700">{h.description}</p>
              <Mod publish={publishHelp} remove={deleteHelp} id={h.id} published={h.published} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title mb-4">Доброволци ({volunteers.length})</h2>
        <ul className="space-y-3">
          {volunteers.map((v) => (
            <li key={v.id} className="card">
              <span className="badge">{v.published ? "Публикуван" : "Чака"}</span>
              <h3 className="mt-2 font-bold text-slate-900">{v.name}</h3>
              <p className="text-sm text-slate-500">
                {[v.area, v.skills, v.phone, v.email].filter(Boolean).join(" · ")}
              </p>
              <Mod publish={publishVolunteer} remove={deleteVolunteer} id={v.id} published={v.published} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title mb-4">Спомени ({memories.length})</h2>
        <ul className="space-y-3">
          {memories.map((m) => (
            <li key={m.id} className="card">
              <span className="badge">{m.published ? "Публикуван" : "Чака"}</span>
              <h3 className="mt-2 font-bold text-slate-900">{m.title}</h3>
              <p className="text-base text-slate-700">{m.content.slice(0, 200)}</p>
              <Mod publish={publishMemory} remove={deleteMemory} id={m.id} published={m.published} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title mb-4">Галерия ({photos.length})</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <li key={p.id} className="card">
              <span className="badge">{p.published ? "Публикуван" : "Чака"}</span>
              <p className="mt-2 break-all text-sm text-slate-600">{p.imageUrl}</p>
              <p className="text-sm text-slate-500">
                {[p.title, p.author].filter(Boolean).join(" · ")}
              </p>
              <Mod publish={publishPhoto} remove={deletePhoto} id={p.id} published={p.published} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
