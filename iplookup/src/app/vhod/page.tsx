import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/components/LoginForm";
import { isInvestigationMode } from "@/lib/mode";
import { hasUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Страницата за вход съществува САМО в следствения режим. В публичния тя няма
 * смисъл и връща 404 — иначе публичният сайт би обявявал, че някъде има
 * заключена част.
 */
export default function LoginPage() {
  if (!isInvestigationMode()) redirect("/");

  const ready = Boolean(process.env.IPLOOKUP_SESSION_SECRET?.trim()) && hasUsers();

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-text">Следствено издание</h1>
        <p className="mt-2 text-sm text-text-muted">
          Достъпът е поименен. Всяко действие се записва в одиторски дневник — кой, кога, какъв адрес и
          по коя преписка.
        </p>
      </div>

      {ready ? (
        <LoginForm />
      ) : (
        <div className="rounded-lg border border-danger p-4">
          <p className="text-sm font-semibold text-danger">Инсталацията не е довършена.</p>
          <p className="mt-2 text-sm text-text-muted">
            Липсва <span className="value-mono">IPLOOKUP_SESSION_SECRET</span> или няма нито един заведен
            служител. Виж <span className="value-mono">SECURITY.md</span> → „Следствено издание“.
          </p>
        </div>
      )}
    </div>
  );
}
