import Link from "next/link";

// Малък бутон-връзка към билинг страницата на сайта. Отделен компонент, за да
// не пипаме конструктора/таблото директно.
export function BillingLink({ slug, premium }: { slug: string; premium: boolean }) {
  return (
    <Link
      href={`/dashboard/sites/${slug}/billing`}
      className="btn-ghost px-3 py-1.5 text-xs"
      title={premium ? "Управление на премиум абонамента" : "Направете сайта премиум"}
    >
      {premium ? "💳 Абонамент" : "⭐ Направи премиум"}
    </Link>
  );
}
