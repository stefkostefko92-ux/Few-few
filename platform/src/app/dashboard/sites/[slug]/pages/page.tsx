import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { CreatePageForm } from "@/components/blocks/CreatePageForm";
import { createPageAction } from "./actions";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PagesList({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "read");
  if (!found) notFound();
  const canManage = found.role === "MANAGER";

  const pages = await prisma.page.findMany({
    where: { siteId: found.site.id },
    orderBy: [{ isHome: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/sites/${slug}`} className="text-xs text-ink-500 hover:text-ink-300">
          ← {found.site.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Страници (конструктор)</h1>
        <p className="text-sm text-ink-400">
          Изграждайте и публикувайте страници с плъзгане на блокове. Публичен адрес:{" "}
          <code className="text-ink-300">/site/{found.site.slug}</code>
        </p>
      </div>

      {pages.length === 0 ? (
        <div className="card text-sm text-ink-400">Още няма страници.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/sites/${slug}/pages/${p.id}`}
              className="card transition hover:border-brand-600"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-white">{p.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "PUBLISHED" ? "bg-green-500/15 text-green-400" : "bg-ink-500/15 text-ink-400"}`}>
                  {p.status === "PUBLISHED" ? "публикувана" : "чернова"}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                /{p.slug || "(начална)"} · обновена {formatRelative(p.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {canManage && (
        <section className="card">
          <h2 className="mb-3 font-medium text-white">Нова страница</h2>
          <CreatePageForm action={createPageAction.bind(null, slug)} />
        </section>
      )}
    </div>
  );
}
