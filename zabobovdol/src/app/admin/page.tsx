import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FORBIDDEN_MSG =
  "Нямате достъп до тази част. Тя е достъпна само за администратори.";

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md " +
        (accent ? "border-amber-300" : "border-slate-200")
      }
    >
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </Link>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { error } = await searchParams;

  const [
    faq,
    services,
    business,
    events,
    listings,
    pendingListings,
    posts,
    misses,
    complaints,
    pendingComplaints,
    helpCauses,
    pendingHelp,
    memories,
    pendingMemories,
    volunteers,
    pendingVolunteers,
    rideshares,
    pendingRides,
    dumps,
    pendingDumps,
    photos,
    pendingPhotos,
    outages,
    contactMessages,
    pendingContact,
    adRequests,
    pendingAds,
    recentAudit,
  ] = await Promise.all([
    prisma.faq.count(),
    prisma.service.count(),
    prisma.business.count(),
    prisma.event.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { published: false } }),
    prisma.post.count(),
    prisma.searchMiss.count({ where: { resolved: false } }),
    prisma.complaint.count(),
    prisma.complaint.count({ where: { status: "NEW" } }),
    prisma.helpCause.count(),
    prisma.helpCause.count({ where: { published: false } }),
    prisma.memory.count(),
    prisma.memory.count({ where: { published: false } }),
    prisma.volunteer.count(),
    prisma.volunteer.count({ where: { published: false } }),
    prisma.rideshare.count(),
    prisma.rideshare.count({ where: { published: false } }),
    prisma.dumpReport.count(),
    prisma.dumpReport.count({ where: { published: false } }),
    prisma.galleryPhoto.count(),
    prisma.galleryPhoto.count({ where: { published: false } }),
    prisma.outage.count(),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { handled: false } }),
    prisma.adRequest.count(),
    prisma.adRequest.count({ where: { status: "NEW" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  // Подавания за одобрение (виждат ги и редакторите).
  const moderationPending =
    pendingListings +
    pendingHelp +
    pendingMemories +
    pendingVolunteers +
    pendingRides +
    pendingDumps +
    pendingPhotos;
  // Само за администратори (лични данни на граждани/реклама).
  const adminPending = pendingComplaints + pendingAds + pendingContact;
  const pendingTotal = moderationPending + (isAdmin ? adminPending : 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Табло</h1>
        <p className="text-slate-600">Преглед на съдържанието и последна активност.</p>
      </div>

      {error === "forbidden" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {FORBIDDEN_MSG}
        </div>
      )}

      {pendingTotal > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          Имате <strong>{pendingTotal}</strong>{" "}
          {pendingTotal === 1 ? "нова заявка, която чака" : "нови заявки, които чакат"}{" "}
          вашето одобрение. Вижте подчертаните карти по-долу.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Въпроси „Как да…“" value={faq} href="/admin/faq" />
        <StatCard label="Услуги и телефони" value={services} href="/admin/services" />
        <StatCard label="Местен бизнес" value={business} href="/admin/business" />
        <StatCard label="Събития" value={events} href="/admin/events" />
        <StatCard
          label={pendingListings > 0 ? `Обяви (чакащи: ${pendingListings})` : "Обяви"}
          value={listings}
          href="/admin/listings"
          accent={pendingListings > 0}
        />
        <StatCard label="Новини" value={posts} href="/admin/posts" />
        {isAdmin && (
          <StatCard
            label={pendingComplaints > 0 ? `Сигнали (нови: ${pendingComplaints})` : "Сигнали"}
            value={complaints}
            href="/admin/signali"
            accent={pendingComplaints > 0}
          />
        )}
        {isAdmin && (
          <StatCard
            label={pendingAds > 0 ? `Заявки за реклама (нови: ${pendingAds})` : "Заявки за реклама"}
            value={adRequests}
            href="/admin/reklami"
            accent={pendingAds > 0}
          />
        )}
        <StatCard
          label={pendingHelp > 0 ? `Зов за помощ (чакащи: ${pendingHelp})` : "Зов за помощ"}
          value={helpCauses}
          href="/admin/help"
          accent={pendingHelp > 0}
        />
        <StatCard
          label={pendingMemories > 0 ? `Спомени (чакащи: ${pendingMemories})` : "Спомени"}
          value={memories}
          href="/admin/spomeni"
          accent={pendingMemories > 0}
        />
        <StatCard
          label={pendingVolunteers > 0 ? `Доброволци (чакащи: ${pendingVolunteers})` : "Доброволци"}
          value={volunteers}
          href="/admin/dobrovolci"
          accent={pendingVolunteers > 0}
        />
        <StatCard
          label={pendingRides > 0 ? `Споделено пътуване (чакащи: ${pendingRides})` : "Споделено пътуване"}
          value={rideshares}
          href="/admin/patuvane"
          accent={pendingRides > 0}
        />
        <StatCard
          label={pendingDumps > 0 ? `Сметища (чакащи: ${pendingDumps})` : "Нерегламентирани сметища"}
          value={dumps}
          href="/admin/smetishta"
          accent={pendingDumps > 0}
        />
        <StatCard
          label={pendingPhotos > 0 ? `Галерия (чакащи: ${pendingPhotos})` : "Галерия (снимки)"}
          value={photos}
          href="/admin/galeriya"
          accent={pendingPhotos > 0}
        />
        <StatCard
          label="Прекъсвания на ток и вода"
          value={outages}
          href="/admin/prekysvaniya"
        />
        {isAdmin && (
          <StatCard
            label={pendingContact > 0 ? `Контактни съобщения (нови: ${pendingContact})` : "Контактни съобщения"}
            value={contactMessages}
            href="/admin/saobshteniya"
            accent={pendingContact > 0}
          />
        )}
        <StatCard
          label="Търсения без резултат"
          value={misses}
          href="/admin/search-misses"
          accent={misses > 0}
        />
      </div>

      {isAdmin && (
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Последна активност
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {recentAudit.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-500">Все още няма активност.</td>
                </tr>
              ) : (
                recentAudit.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap p-3 text-slate-500">
                      {new Intl.DateTimeFormat("bg-BG", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(a.createdAt)}
                    </td>
                    <td className="p-3 text-slate-700">{a.summary}</td>
                    <td className="p-3 text-right text-slate-400">{a.userEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-right">
          <Link href="/admin/audit" className="text-sm text-brand-700 hover:underline">
            Целият одит лог →
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}
