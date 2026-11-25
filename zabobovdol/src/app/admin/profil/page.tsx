import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/categories";
import { AccountForm } from "@/components/admin/AccountForm";

export const dynamic = "force-dynamic";

// „Моят профил“ — всеки влязъл сменя тук своя имейл и парола.
export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const me = await requireUser();
  const { saved } = await searchParams;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Моят профил</h1>
        <p className="text-slate-600">
          {me.name} · {ROLE_LABELS[me.role]}. Тук сменяте имейла, с който влизате, и паролата си.
        </p>
      </div>

      {saved && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
          {saved === "pw"
            ? "Запазено. Паролата е сменена — другите влизания са прекратени, тук оставате влезли."
            : "Запазено."}
        </p>
      )}

      <AccountForm email={me.email} />
    </div>
  );
}
