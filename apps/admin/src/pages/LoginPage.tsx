import { useState, type FormEvent } from 'react';

import { useLogin } from '@/auth/useAuth';
import { Button } from '@/components/Button';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    loginMutation.mutate({ email: email.trim(), password });
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-card">
        <h1 className="text-2xl font-bold text-primary">Помагам Бобов дол</h1>
        <p className="mt-1 mb-6 text-ink-muted">Вход за модератори</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Имейл</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-card border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Парола</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-card border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            />
          </label>

          {loginMutation.isError ? (
            <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">
              {loginMutation.error.message}
            </p>
          ) : null}

          <Button type="submit" disabled={loginMutation.isPending} className="w-full">
            {loginMutation.isPending ? 'Влизане…' : 'Вход'}
          </Button>
        </form>
      </div>
    </div>
  );
}
