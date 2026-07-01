import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageSettingsForm } from "@/components/blocks/PageSettingsForm";
import { ActionButton } from "@/components/ActionButton";
import { formatDateTime } from "@/lib/format";
import { updatePageSettingsAction, restoreVersionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PageSettings({
  params,
}: {
  params: Promise<{ slug: string; pageId: string }>;
}) {
  const { slug, pageId } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) notFound();
  const page = await prisma.page.findFirst({
    where: { id: pageId, siteId: found.site.id },
  });
  if (!page) notFound();

  const versions = await prisma.pageVersion.findMany({
    where: { pageId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href={`/dashboard/sites/${slug}/pages/${pageId}`}
          className="text-xs text-ink-500 hover:text-ink-300"
        >
          ← Обратно към конструктора
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Настройки на страницата</h1>
        <p className="text-sm text-ink-400">{page.title}</p>
      </div>

      <div className="card">
        <PageSettingsForm
          action={updatePageSettingsAction.bind(null, slug, pageId)}
          init={{
            showInNav: page.isHome ? true : page.showInNav,
            navOrder: page.navOrder,
            seoTitle: page.seoTitle ?? "",
            seoDescription: page.seoDescription ?? "",
            // datetime-local очаква „YYYY-MM-DDTHH:mm"
            publishAt: page.publishAt ? page.publishAt.toISOString().slice(0, 16) : "",
          }}
        />
      </div>

      <div className="card">
        <h2 className="mb-1 font-medium text-white">История на версиите</h2>
        <p className="mb-3 text-xs text-ink-500">
          Снимка се пази при всяко публикуване (последните 20). Възстановяването
          зарежда съдържанието в черновата — прегледайте и публикувайте.
        </p>
        {versions.length === 0 ? (
          <p className="text-sm text-ink-500">Още няма версии — публикувайте страницата.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded border border-ink-800 px-3 py-2">
                <span className="text-sm text-ink-300">
                  {i === 0 ? "Текуща · " : ""}
                  {formatDateTime(v.createdAt)}
                </span>
                {i > 0 && (
                  <ActionButton
                    action={restoreVersionAction.bind(null, slug, pageId, v.id)}
                    label="Възстанови"
                    confirm="Да заредя тази версия в черновата?"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
