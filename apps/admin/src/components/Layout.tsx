import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { Admin } from '@/api/types';
import { useLogout } from '@/auth/useAuth';
import { Button } from '@/components/Button';

export function Layout({ admin, children }: { admin: Admin; children: ReactNode }) {
  const logout = useLogout();

  return (
    <div className="min-h-full">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex flex-col leading-tight">
            <span className="text-lg font-bold text-primary">Помагам Бобов дол</span>
            <span className="text-sm text-ink-muted">Модерация на сигнали</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">{admin.email}</span>
            <Button
              variant="secondary"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              Изход
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
