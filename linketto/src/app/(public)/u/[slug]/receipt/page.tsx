import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { receiptDate, receiptStrings } from '@/lib/receipt';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

// Разписките не се индексират (частни, съдържат имейл на купувача).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session?: string; hl?: string }>;
}) {
  const { slug } = await params;
  const { session, hl } = await searchParams;

  const purchase = session
    ? await prisma.purchase.findUnique({
        where: { stripeSessionId: session },
        include: {
          product: { include: { translations: true } },
          // profileId е на Purchase; вземаме профила отделно за продавача.
        },
      })
    : null;

  const profile =
    purchase &&
    (await prisma.profile.findFirst({
      where: { id: purchase.profileId, slug },
      include: { translations: true, user: { select: { isTrader: true } } },
    }));

  // Език: изричен ?hl, иначе езикът на купувача от покупката.
  const locale =
    hl && isLocale(hl) ? hl : (purchase?.locale ?? undefined);
  const s = receiptStrings(locale);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        {children}
      </div>
    </main>
  );

  if (!purchase || !profile) {
    return (
      <Shell>
        <h1 className="text-lg font-bold">Linketto</h1>
        <p className="mt-4 text-sm text-slate-600">
          {session ? s.processing : s.notFound}
        </p>
      </Shell>
    );
  }

  const sellerName =
    profile.translations.find((t) => t.locale === profile.defaultLocale)
      ?.displayName ??
    profile.translations[0]?.displayName ??
    slug;
  const productTitle =
    (locale &&
      purchase.product.translations.find((t) => t.locale === locale)?.title) ||
    purchase.product.translations.find(
      (t) => t.locale === profile.defaultLocale,
    )?.title ||
    purchase.product.translations[0]?.title ||
    'Product';
  const price = `€${(purchase.amountCents / 100).toFixed(2)}`;

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Linketto</h1>
        <span className="text-xs uppercase tracking-widest text-slate-400">
          {s.title}
        </span>
      </div>
      <h2 className="mt-6 text-xl font-bold text-slate-900">{s.title}</h2>

      <div className="mt-4">
        <Row label={s.seller} value={sellerName} />
        <Row label={s.platform} value="Linketto · Carbon Stealth VCC" />
        {purchase.buyerEmail && (
          <Row label={s.buyer} value={purchase.buyerEmail} />
        )}
        <Row label={s.date} value={receiptDate(purchase.createdAt)} />
        <Row label={s.orderId} value={purchase.id} />
        <Row label={s.item} value={productTitle} />
        {purchase.couponCode && (
          <Row label={s.discount} value={purchase.couponCode} />
        )}
        <Row label={s.amount} value={price} />
      </div>

      {purchase.refundedAt && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-700">
          {s.refunded}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {profile.user.isTrader ? s.traderYes : s.traderNo} {s.vatNote}
      </p>

      <div className="mt-6 print:hidden">
        <PrintButton label={s.print} />
      </div>
    </Shell>
  );
}
