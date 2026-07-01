import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { toggleSubmissionAction, deleteSubmissionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Submissions({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "read");
  if (!found) notFound();
  const canManage = found.role === "MANAGER";

  const subs = await prisma.formSubmission.findMany({
    where: { siteId: found.site.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const pending = subs.filter((s) => !s.handled).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/sites/${slug}`} className="text-xs text-ink-500 hover:text-ink-300">
          ← {found.site.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Заявки от форми</h1>
        <p className="text-sm text-ink-400">
          {subs.length} общо{pending > 0 && ` · ${pending} нови`}
        </p>
      </div>

      {subs.length === 0 ? (
        <div className="card text-sm text-ink-400">
          Още няма заявки. Добавете блок „Форма за контакт“ в страница и публикувайте.
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <div
              key={s.id}
              className={`card ${s.handled ? "opacity-60" : "border-brand-800/60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-white">
                    {s.name}{" "}
                    <a href={`mailto:${s.email}`} className="text-sm text-brand-400 hover:underline">
                      &lt;{s.email}&gt;
                    </a>
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(s.createdAt)}
                    {s.pagePath && ` · ${s.pagePath}`}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <form action={toggleSubmissionAction.bind(null, slug, s.id)}>
                      <button className="text-xs text-ink-400 hover:text-ink-200">
                        {s.handled ? "Върни като нова" : "Отбележи обработена"}
                      </button>
                    </form>
                    <form action={deleteSubmissionAction.bind(null, slug, s.id)}>
                      <button className="text-xs text-red-400 hover:text-red-300">Изтрий</button>
                    </form>
                  </div>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-200">{s.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
