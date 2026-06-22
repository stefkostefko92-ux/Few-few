import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logout } from "./actions";

export const dynamic = "force-dynamic";

const ADMIN_NAV = [
  { href: "/admin", label: "Табло" },
  { href: "/admin/signali", label: "Сигнали" },
  { href: "/admin/smetishta", label: "Сметища" },
  { href: "/admin/obyavi", label: "Обяви" },
  { href: "/admin/kontakti", label: "Съобщения" },
  { href: "/admin/sabitiya", label: "Събития" },
  { href: "/admin/novini", label: "Новини" },
  { href: "/admin/biznes", label: "Бизнес" },
  { href: "/admin/obshtnost", label: "Общност" },
  { href: "/admin/spodeleno-patuvane", label: "Пътувания" },
  { href: "/admin/izmami", label: "Измами" },
  { href: "/admin/reklama", label: "Реклама" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="container-content py-8">
      {session && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <nav aria-label="Администрация">
            <ul className="flex flex-wrap gap-1">
              {ADMIN_NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <form action={logout}>
            <span className="mr-3 text-sm text-slate-500">{session.sub}</span>
            <button type="submit" className="btn-secondary">
              Изход
            </button>
          </form>
        </div>
      )}
      {children}
    </div>
  );
}
