import Link from "next/link";
import type { SessionUser } from "@/lib/auth";

// Обща рамка за защитените страници: горна лента с навигация и изход.
export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800 bg-ink-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold text-white">
              Платформа
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-ink-300 hover:text-white">
                Табло
              </Link>
              {user.role === "OWNER" && (
                <Link href="/admin" className="text-ink-300 hover:text-white">
                  Администрация
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-400 sm:inline">
              {user.name}
              {user.role === "OWNER" && (
                <span className="ml-2 rounded bg-brand-600/20 px-1.5 py-0.5 text-xs text-brand-300">
                  собственик
                </span>
              )}
            </span>
            <form action="/api/logout" method="post">
              <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                Изход
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
