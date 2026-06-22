import { prisma } from "@/lib/prisma";
import { PostForm } from "./PostForm";
import { deletePost } from "./actions";

export const dynamic = "force-dynamic";

async function getPosts() {
  try {
    return await prisma.post.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  } catch {
    return [];
  }
}

export default async function AdminNoviniPage() {
  const items = await getPosts();
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Новини
      </h1>

      <div className="mt-6">
        <h2 className="section-title mb-4">Добави нова</h2>
        <PostForm />
      </div>

      <div className="mt-10">
        <h2 className="section-title mb-4">Съществуващи ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-base text-slate-600">Няма новини.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((p) => (
              <li key={p.id} className="card flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-bold text-slate-900">
                    {p.title}
                  </p>
                  {p.source && (
                    <p className="text-sm text-slate-500">{p.source}</p>
                  )}
                </div>
                <form action={deletePost}>
                  <input type="hidden" name="id" value={p.id} />
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
