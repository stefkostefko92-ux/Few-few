import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ActionButton } from "@/components/ActionButton";
import { InviteForm } from "@/components/InviteForm";
import { formatRelative } from "@/lib/format";
import {
  inviteMemberAction,
  removeMemberAction,
  changeMemberRoleAction,
  cancelInviteAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function Members({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) notFound();

  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { siteId: found.site.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { siteId: found.site.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/sites/${slug}`} className="text-xs text-ink-500 hover:text-ink-300">
          ← {found.site.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Екип и достъп</h1>
        <p className="text-sm text-ink-400">Поканете колеги да управляват или наблюдават сайта.</p>
      </div>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Покани член</h2>
        <InviteForm action={inviteMemberAction.bind(null, slug)} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Членове ({members.length})</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-ink-800 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{m.user.name}</p>
                <p className="text-xs text-ink-500">{m.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <form action={changeMemberRoleAction.bind(null, slug, m.user.id, m.role === "MANAGER" ? "VIEWER" : "MANAGER")}>
                  <button className="rounded bg-ink-800 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700">
                    {m.role === "MANAGER" ? "мениджър" : "наблюдател"} · смени
                  </button>
                </form>
                {m.user.id !== user.id && (
                  <ActionButton
                    action={removeMemberAction.bind(null, slug, m.user.id)}
                    label="Премахни"
                    variant="danger"
                    confirm={`Премахване на ${m.user.email}?`}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-medium text-white">Чакащи покани ({invites.length})</h2>
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 rounded border border-ink-800 px-3 py-2">
                <div>
                  <p className="text-sm text-ink-200">{inv.email}</p>
                  <p className="text-xs text-ink-500">
                    {inv.role === "MANAGER" ? "мениджър" : "наблюдател"} · поканен {formatRelative(inv.createdAt)}
                  </p>
                </div>
                <ActionButton
                  action={cancelInviteAction.bind(null, slug, inv.id)}
                  label="Отмени"
                  variant="danger"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
