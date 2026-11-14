import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getLiveSession();
  if (!session) redirect("/login");

  return <AppShell session={session}>{children}</AppShell>;
}
