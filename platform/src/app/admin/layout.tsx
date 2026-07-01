import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

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
  const user = await requireOwner();
  return <AppShell user={user}>{children}</AppShell>;
}
