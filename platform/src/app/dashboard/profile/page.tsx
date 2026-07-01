import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/ProfileForm";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpEnabled: true },
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs text-ink-500 hover:text-ink-300">← Табло</Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Профил</h1>
        <p className="text-sm text-ink-400">{user.name} · {user.email}</p>
      </div>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Смяна на парола</h2>
        <ProfileForm />
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Двуфакторна автентикация (2FA)</h2>
        <TwoFactorSetup enabled={dbUser?.totpEnabled ?? false} />
      </section>
    </div>
  );
}
