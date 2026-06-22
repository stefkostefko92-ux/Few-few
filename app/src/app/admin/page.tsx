import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function safeCount(fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export default async function AdminDashboard() {
  const [newSignals, newDumps, pendingListings, newContacts] = await Promise.all([
    safeCount(() => prisma.complaint.count({ where: { status: "NEW" } })),
    safeCount(() => prisma.dumpReport.count({ where: { published: false } })),
    safeCount(() => prisma.listing.count({ where: { published: false } })),
    safeCount(() => prisma.contactMessage.count({ where: { handled: false } })),
  ]);

  const dbDown = newSignals === null;

  const cards = [
    { href: "/admin/signali", label: "Нови сигнали", value: newSignals },
    { href: "/admin/smetishta", label: "Сигнали за сметища", value: newDumps },
    { href: "/admin/obyavi", label: "Обяви за преглед", value: pendingListings },
    { href: "/admin/kontakti", label: "Нови съобщения", value: newContacts },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-slate-900">
        Табло
      </h1>

      {dbDown ? (
        <p className="mt-4 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-slate-700">
          Няма връзка с базата данни. Задайте DATABASE_URL и изпълнете миграциите,
          за да работи администрацията.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="card block">
              <p className="text-base text-slate-600">{c.label}</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-brand-700">
                {c.value ?? 0}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
