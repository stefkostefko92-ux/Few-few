import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Администрация",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  // Когато няма сесия (вкл. страницата за вход), показваме съдържанието без
  // административната рамка. Защитените страници сами пренасочват към входа.
  if (!user) return <>{children}</>;
  return <AdminShell user={user}>{children}</AdminShell>;
}
