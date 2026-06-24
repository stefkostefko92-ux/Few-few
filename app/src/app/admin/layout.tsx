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

// Брой чакащи за одобрение по секции — за мигащия червен индикатор в менюто.
async function computePending(isAdmin: boolean): Promise<Record<string, number>> {
  const pending: Record<string, number> = {};
  try {
    // Модерирани ресурси: чакащи = непубликувани.
    await Promise.all(
      RESOURCES.filter((r) => r.moderated).map(async (r) => {
        const delegate = (prisma as unknown as Record<string, Counter>)[r.model];
        pending[r.key] = await delegate.count({ where: { published: false } });
      }),
    );
    // Контактни съобщения: чакащи = необработени.
    pending["saobshteniya"] = await prisma.contactMessage.count({ where: { handled: false } });
    // Системни (само за администратор).
    if (isAdmin) {
      pending["signali"] = await prisma.complaint.count({ where: { status: "NEW" } });
      pending["reklami"] = await prisma.adRequest.count({ where: { status: "NEW" } });
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
  // Когато няма сесия (вкл. страницата за вход), показваме съдържанието без
  // административната рамка. Защитените страници сами пренасочват към входа.
  if (!user) return <>{children}</>;
  const pending = await computePending(user.role === "ADMIN");
  return (
    <AdminShell user={user} pending={pending}>
      {children}
    </AdminShell>
  );
}
