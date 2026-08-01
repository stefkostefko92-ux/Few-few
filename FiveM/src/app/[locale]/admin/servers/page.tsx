import { redirect } from 'next/navigation';

import { editServerAction, setFeaturedAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { isAdmin } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import type { FrameworkId } from '@/lib/fivem';
import { FRAMEWORK_ICON, STATUS_ICON } from '@/lib/icons';
import { isFeatured } from '@/lib/rating';

export const dynamic = 'force-dynamic';

const FRAMEWORKS: FrameworkId[] = ['ESX', 'QBCORE', 'QBOX', 'OX_CORE', 'STANDALONE', 'UNKNOWN'];
const input = 'w-full rounded border border-white/15 bg-ink-900 px-2 py-1 text-sm text-silver-100';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> };

export default async function AdminServers({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  if (!(await isAdmin())) redirect(`/${locale}/admin/login`);

  const t = getDictionary(locale);
  const { q } = await searchParams;

  const servers = await prisma.server.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
    orderBy: [{ featuredUntil: 'desc' }, { players: 'desc' }, { name: 'asc' }],
    take: 60,
  });

  return (
    <div>
      <form className="flex max-w-sm gap-2">
        <input name="q" defaultValue={q} placeholder="Търси по име" className={input} />
        <button className="rounded border border-white/15 px-3 text-sm hover:border-cyan-500">
          Търси
        </button>
      </form>
      <p className="mt-2 text-sm text-silver-500">
        Показани {servers.length}. Етикетите се задават САМО оттук — те са единственият им писач.
      </p>

      <ul className="mt-6 space-y-4">
        {servers.map((server) => (
          <li key={server.id} className="rounded-xl border border-white/10 bg-ink-900/70 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge name={FRAMEWORK_ICON[server.framework as FrameworkId]} size={28} />
              <Badge name={STATUS_ICON[server.lastProbe]} size={24} />
              <strong className="text-silver-100">{server.name}</strong>
              <code className="text-xs text-silver-500">{server.slug}</code>
              {isFeatured(server) && (
                <span className="flex items-center gap-1 rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200">
                  <Badge name="vip" size={24} />
                  до {server.featuredUntil?.toLocaleDateString('bg-BG')}
                </span>
              )}
              {server.source === 'DISCOVERED' && (
                <span className="rounded border border-white/15 px-2 py-0.5 text-xs text-silver-500">
                  открит автоматично
                </span>
              )}
            </div>

            <form action={setFeaturedAction} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="id" value={server.id} />
              <label className="flex flex-col gap-1">
                <span className="text-silver-500">Промоция (дни)</span>
                <input name="days" type="number" min={0} max={365} defaultValue={0} className={input} />
              </label>
              <button className="rounded bg-cyan-500 px-3 py-1 font-medium text-ink-950 hover:bg-cyan-400">
                Приложи
              </button>
              <span className="text-silver-500">0 спира промоцията</span>
            </form>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-cyan-300">Редакция</summary>
              <form action={editServerAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={server.id} />
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-silver-500">Кратко описание</span>
                  <input name="tagline" defaultValue={server.tagline ?? ''} maxLength={160} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-silver-500">Описание</span>
                  <textarea name="description" defaultValue={server.description ?? ''} rows={3} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-silver-500">Етикети (със запетая)</span>
                  <input name="tags" defaultValue={server.tags.join(', ')} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-silver-500">Discord</span>
                  <input name="discordUrl" defaultValue={server.discordUrl ?? ''} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-silver-500">Сайт</span>
                  <input name="websiteUrl" defaultValue={server.websiteUrl ?? ''} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-silver-500">Рамка</span>
                  <select name="framework" defaultValue={server.framework} className={input}>
                    {FRAMEWORKS.map((id) => (
                      <option key={id} value={id}>
                        {t.frameworks[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-silver-500">Статус</span>
                  <select name="status" defaultValue={server.status} className={input}>
                    <option value="APPROVED">публичен</option>
                    <option value="PENDING">чака</option>
                    <option value="REJECTED">свален</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="whitelist" defaultChecked={server.whitelist} />
                  whitelist
                </label>
                <div className="sm:col-span-2">
                  <button className="rounded border border-white/15 px-3 py-1 text-sm hover:border-cyan-500">
                    Запази
                  </button>
                </div>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
