import { loginAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { isAdmin } from '@/lib/admin/auth';
import { isLocale } from '@/i18n/config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  bad: 'Грешна парола.',
  rate: 'Твърде много опити. Опитай пак след 15 минути.',
  missing: 'Панелът не е конфигуриран: липсва ADMIN_PASSWORD_HASH на сървъра.',
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const { error } = await searchParams;
  if (await isAdmin()) redirect(`/${locale}/admin`);

  const configured = Boolean(process.env.ADMIN_PASSWORD_HASH);
  const message = ERRORS[configured ? (error ?? '') : 'missing'];

  return (
    <div className="max-w-sm">
      <div className="flex items-center gap-3">
        <Badge name="profile" size={40} />
        <h2 className="text-xl font-semibold">Вход</h2>
      </div>

      {message && (
        <p role="alert" className="mt-5 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
          {message}
        </p>
      )}

      <form action={loginAction} className="mt-6 space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <div>
          <label htmlFor="password">Парола</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100"
          />
        </div>
        <button
          type="submit"
          disabled={!configured}
          className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-ink-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          Влез
        </button>
      </form>

      <p className="mt-6 text-sm text-silver-500">
        Паролата не се пази никъде — в env стои само scrypt хеш. Генерира се с{' '}
        <code>npm run admin:hash</code> и се слага в <code>.env</code> на сървъра.
      </p>
    </div>
  );
}
