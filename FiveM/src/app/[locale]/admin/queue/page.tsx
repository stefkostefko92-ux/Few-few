import { redirect } from 'next/navigation';

import {
  approveSubmissionAction,
  handleReportAction,
  moderateReviewAction,
  replyToReviewAction,
  rejectSubmissionAction,
} from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { isAdmin } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

const yes = 'rounded bg-cyan-500 px-3 py-1 text-sm font-medium text-ink-950 hover:bg-cyan-400';
const no = 'rounded border border-white/15 px-3 py-1 text-sm hover:border-red-500';

export default async function AdminQueue({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  if (!(await isAdmin())) redirect(`/${locale}/admin/login`);

  const [reviews, submissions, reports] = await Promise.all([
    prisma.review.findMany({
      where: { status: 'PENDING' },
      include: { server: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.submission.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-12">
      <section>
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          <Badge name="notification" size={32} /> Ревюта ({reviews.length})
        </h2>
        <p className="mt-1 text-sm text-silver-500">
          Дотук нито едно ревю не можеше да се публикува: пишеха се PENDING, а се четат само APPROVED.
        </p>
        {reviews.length === 0 ? (
          <p className="mt-3 text-silver-400">Празно.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-white/10 p-4">
                <p className="text-sm text-silver-500">
                  {review.rating} / 5 · {review.authorAlias ?? 'анонимен'} · {review.server.name} ·{' '}
                  {review.createdAt.toLocaleDateString('bg-BG')}
                </p>
                {/* Съдържанието е недоверено — чист текст, никога HTML. */}
                {review.body && <p className="mt-2 whitespace-pre-line text-silver-200">{review.body}</p>}
                <div className="mt-3 flex gap-2">
                  {(['APPROVED', 'REJECTED'] as const).map((decision) => (
                    <form key={decision} action={moderateReviewAction}>
                      <input type="hidden" name="id" value={review.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button className={decision === 'APPROVED' ? yes : no}>
                        {decision === 'APPROVED' ? 'Публикувай' : 'Откажи'}
                      </button>
                    </form>
                  ))}
                </div>
                {/* Правото на отговор е обещано в Общите условия и е
                    противотежестта, която прави непроверените отзиви
                    защитими. Собственикът пише, ние публикуваме — нямаме
                    акаунти. */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-cyan-300">
                    Отговор от сървъра {review.reply ? '(публикуван)' : ''}
                  </summary>
                  <form action={replyToReviewAction} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={review.id} />
                    <textarea
                      name="reply"
                      rows={3}
                      maxLength={1000}
                      defaultValue={review.reply ?? ''}
                      placeholder="Текстът, който собственикът на сървъра иска да се покаже под ревюто"
                      className="w-full rounded border border-white/15 bg-ink-900 px-2 py-1 text-sm text-silver-100"
                    />
                    <button className="rounded border border-white/15 px-3 py-1 text-sm hover:border-cyan-500">
                      Запази отговора
                    </button>
                    <span className="ms-2 text-xs text-silver-500">празно поле = сваля отговора</span>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          <Badge name="contact" size={32} /> Заявки за листване ({submissions.length})
        </h2>
        <p className="mt-1 text-sm text-silver-500">
          Одобряването създава публичния сървър от заявката.
        </p>
        {submissions.length === 0 ? (
          <p className="mt-3 text-silver-400">Празно.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {submissions.map((submission) => (
              <li key={submission.id} className="rounded-lg border border-white/10 p-4">
                <p className="font-medium text-silver-100">{submission.serverName}</p>
                <p className="mt-1 text-sm text-silver-500">
                  {submission.cfxJoinCode ?? submission.address ?? '—'} · {submission.contactEmail} ·{' '}
                  {submission.createdAt.toLocaleDateString('bg-BG')}
                </p>
                {submission.note && (
                  <p className="mt-2 whitespace-pre-line text-silver-300">{submission.note}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <form action={approveSubmissionAction}>
                    <input type="hidden" name="id" value={submission.id} />
                    <button className={yes}>Одобри и публикувай</button>
                  </form>
                  {/* Мотивът е ЗАДЪЛЖИТЕЛЕН по чл. 17, ал. 3, б. „б“: решението
                      трябва да носи фактите ПО СЛУЧАЯ. Без това поле шаблонът
                      нямаше как да ги съдържа. */}
                  <form action={rejectSubmissionAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={submission.id} />
                    <input
                      name="reason"
                      required
                      maxLength={1000}
                      placeholder="Мотив за отказа (влиза в решението по чл. 17 DSA)"
                      className="min-w-64 flex-1 rounded border border-white/15 bg-ink-900 px-2 py-1 text-sm text-silver-100"
                    />
                    <button className={no}>Откажи</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          <Badge name="warning" size={32} /> Сигнали по чл. 16 DSA ({reports.length})
        </h2>
        <p className="mt-1 text-sm text-silver-500">
          Решението записва и часа — от него тече уведомяването по чл. 16, ал. 5.
        </p>
        {reports.length === 0 ? (
          <p className="mt-3 text-silver-400">Празно.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-lg border border-white/10 p-4">
                <p className="break-all text-sm text-cyan-300">{report.targetUrl}</p>
                <p className="mt-1 text-sm text-silver-500">
                  {report.reporterName} · {report.reporterEmail} ·{' '}
                  {report.createdAt.toLocaleDateString('bg-BG')}
                </p>
                <p className="mt-2 whitespace-pre-line text-silver-200">{report.reason}</p>
                <div className="mt-3 flex gap-2">
                  <form action={handleReportAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                    <button className={yes}>Основателен</button>
                  </form>
                  <form action={handleReportAction}>
                    <input type="hidden" name="id" value={report.id} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <button className={no}>Неоснователен</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
