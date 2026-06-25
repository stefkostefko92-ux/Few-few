import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/prisma";
import { RESOURCES } from "@/lib/admin/resources";

export const metadata: Metadata = {
  title: "Администрация",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Counter = { count: (a?: unknown) => Promise<number> };

// Брой чакащи по секции — за червения индикатор в менюто.
async function computePending(isAdmin: boolean): Promise<Record<string, number>> {
  const pending: Record<string, number> = {};
  try {
    await Promise.all(
      RESOURCES.filter((r) => r.moderated).map(async (r) => {
        const delegate = (prisma as unknown as Record<string, Counter>)[r.model];
        pending[r.key] = await delegate.count({ where: { published: false } });
      }),
    );
    if (isAdmin) {
      pending["saobshteniya"] = await prisma.contactMessage.count({
        where: { handled: false },
      });
    }
  } catch {
    /* при празна/недостъпна база — без индикатори */
  }
  return pending;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  // Без сесия (вкл. страницата за вход) показваме съдържанието без рамката.
  if (!user) return <>{children}</>;
  const pending = await computePending(user.role === "ADMIN");
  return (
    <AdminShell user={user} pending={pending}>
      {children}
    </AdminShell>
  );
}
