import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { stripeConfigured } from "@/lib/stripe";
import { billingStatusLabel, type BillingStatus } from "@/lib/billing";
import { formatDateTime } from "@/lib/format";
import { BillingPanel } from "@/components/BillingPanel";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  // Скоуп MANAGER — билингът е управляващо действие.
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) notFound();
  const s = found.site;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/sites/${slug}`}
          className="text-xs text-ink-500 hover:text-ink-300"
        >
          ← {s.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Билинг и абонамент</h1>
        <p className="text-sm text-ink-400">
          Премиум план за този сайт — маха водния знак „Carbon Stealth“.
        </p>
      </div>

      <BillingPanel
        init={{
          slug,
          premium: s.premium,
          statusLabel: billingStatusLabel(s.billingStatus as BillingStatus),
          renewsAt: s.planRenewsAt ? formatDateTime(s.planRenewsAt) : null,
          hasCustomer: !!s.stripeCustomerId,
          configured: stripeConfigured(),
          priceLabel: "10 €/месец",
        }}
      />

      {/* Правна бележка (ЕС) */}
      <section className="card space-y-2 text-xs text-ink-500">
        <h2 className="text-sm font-medium text-ink-300">Правна информация</h2>
        <p>
          Абонаментът е дигитална услуга. Крайната цена включва ДДС според вашата
          държава (изчислява се от Stripe Tax). Фактури и разписки получавате по
          имейл и в портала за управление.
        </p>
        <p>
          <b>Право на отказ:</b> при дигитални услуги 14-дневното право на отказ
          отпада, ако изрично се съгласите изпълнението да започне веднага и
          потвърдите, че губите това право (чл. 16, б. „м“ от Дир. 2011/83/ЕС;
          чл. 57 ЗЗП). Иначе можете да се откажете в 14 дни. Прекратяване по
          всяко време през портала — премиумът остава до края на платения период.
        </p>
        <p className="text-ink-600">Това не е правен съвет.</p>
      </section>
    </div>
  );
}
