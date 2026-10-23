import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { videoEmbedSrc } from '@/lib/blocks';
import { VideoFacade } from '@/components/VideoFacade';
import { getBuyerEmail, hasActiveEntitlement } from '@/lib/buyer-auth';
import { requestAccessAction, buyerLogoutAction } from '@/app/actions/buyer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Кратки низове (функционален UI, не правен) — bg/en/it/es/de/fr + fallback en.
const S: Record<string, Record<string, string>> = {
  bg: {
    access: 'Достъп до съдържанието',
    hint: 'Въведи имейла, с който плати — ще ти пратим линк за вход.',
    email: 'Имейл',
    request: 'Прати линк за достъп',
    sent: 'Проверѝ пощата си за линк за достъп.',
    error: 'Невалиден имейл.',
    afterPay: 'Плащането е прието! Въведи имейла си, за да отвориш съдържанието.',
    logout: 'Изход',
    buy: 'Купи достъп',
    locked: 'Това съдържание е заключено.',
  },
  en: {
    access: 'Access your content',
    hint: 'Enter the email you paid with — we’ll send you a login link.',
    email: 'Email',
    request: 'Send access link',
    sent: 'Check your inbox for an access link.',
    error: 'Invalid email.',
    afterPay: 'Payment received! Enter your email to open the content.',
    logout: 'Log out',
    buy: 'Buy access',
    locked: 'This content is locked.',
  },
  it: {
    access: 'Accedi al contenuto',
    hint: "Inserisci l'email con cui hai pagato — ti invieremo un link di accesso.",
    email: 'Email',
    request: 'Invia link di accesso',
    sent: 'Controlla la tua email per il link di accesso.',
    error: 'Email non valida.',
    afterPay: 'Pagamento ricevuto! Inserisci la tua email per aprire il contenuto.',
    logout: 'Esci',
    buy: "Acquista l'accesso",
    locked: 'Questo contenuto è bloccato.',
  },
  es: {
    access: 'Accede a tu contenido',
    hint: 'Introduce el correo con el que pagaste — te enviaremos un enlace de acceso.',
    email: 'Correo',
    request: 'Enviar enlace de acceso',
    sent: 'Revisa tu correo para el enlace de acceso.',
    error: 'Correo no válido.',
    afterPay: 'Pago recibido. Introduce tu correo para abrir el contenido.',
    logout: 'Salir',
    buy: 'Comprar acceso',
    locked: 'Este contenido está bloqueado.',
  },
  de: {
    access: 'Zugang zu deinen Inhalten',
    hint: 'Gib die E-Mail ein, mit der du bezahlt hast — wir senden dir einen Zugangslink.',
    email: 'E-Mail',
    request: 'Zugangslink senden',
    sent: 'Prüfe deine E-Mails auf den Zugangslink.',
    error: 'Ungültige E-Mail.',
    afterPay: 'Zahlung erhalten! Gib deine E-Mail ein, um den Inhalt zu öffnen.',
    logout: 'Abmelden',
    buy: 'Zugang kaufen',
    locked: 'Dieser Inhalt ist gesperrt.',
  },
  fr: {
    access: 'Accédez à votre contenu',
    hint: "Saisissez l'e-mail utilisé pour payer — nous vous enverrons un lien d'accès.",
    email: 'E-mail',
    request: "Envoyer le lien d'accès",
    sent: "Vérifiez votre e-mail pour le lien d'accès.",
    error: 'E-mail invalide.',
    afterPay: 'Paiement reçu ! Saisissez votre e-mail pour ouvrir le contenu.',
    logout: 'Se déconnecter',
    buy: "Acheter l'accès",
    locked: 'Ce contenu est verrouillé.',
  },
};

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{
    hl?: string;
    sent?: string;
    accessError?: string;
    session_id?: string;
  }>;
}) {
  const { slug, productId } = await params;
  const { hl, sent, accessError, session_id } = await searchParams;

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      type: { in: ['COURSE', 'MEMBERSHIP'] },
      profile: { slug, published: true, bannedAt: null },
    },
    include: {
      translations: true,
      lessons: { orderBy: { position: 'asc' } },
      profile: { include: { translations: true } },
    },
  });
  if (!product) notFound();

  const locale = hl && isLocale(hl) ? hl : product.profile.defaultLocale;
  const s = S[locale] ?? S.en;
  const tr =
    product.translations.find((t) => t.locale === locale) ??
    product.translations.find((t) => t.locale === product.profile.defaultLocale) ??
    product.translations[0];
  const title = tr?.title ?? 'Linketto';
  const tp = await getTranslations({ locale, namespace: 'profile' });

  const email = await getBuyerEmail();
  const access = email ? await hasActiveEntitlement(email, productId) : false;
  // Архивиран/скрит продукт е недостъпен за случайни посетители, но
  // платилите купувачи пазят достъпа си (продуктът не се трие при продажби).
  if (!product.active && !access) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 font-ui text-slate-900 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.2)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {product.type === 'MEMBERSHIP' ? tp('shopMembership') : tp('shopCourse')} ·{' '}
          <Link href={`/u/${slug}`} className="hover:underline">
            @{slug}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        {tr?.description && (
          <p className="mt-2 text-slate-600">{tr.description}</p>
        )}

        {access ? (
          <>
            <div className="mt-6 space-y-6">
              {product.lessons.length === 0 && (
                <p className="text-sm text-slate-500">—</p>
              )}
              {product.lessons.map((lesson, i) => {
                const embed = lesson.videoUrl
                  ? videoEmbedSrc(lesson.videoUrl)
                  : null;
                return (
                  <section
                    key={lesson.id}
                    className="rounded-xl border border-slate-100 p-5"
                  >
                    <h2 className="font-semibold text-slate-800">
                      {i + 1}. {lesson.title}
                    </h2>
                    {embed && (
                      <div className="mt-3 overflow-hidden rounded-lg">
                        <VideoFacade
                          src={embed}
                          title={lesson.title}
                          playLabel={tp('videoPlay')}
                          accent={product.profile.accent ?? '#3b82c4'}
                        />
                      </div>
                    )}
                    {lesson.body && (
                      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {lesson.body}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
            <form action={buyerLogoutAction} className="mt-6">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="productId" value={productId} />
              <button
                type="submit"
                className="text-sm font-medium text-slate-500 hover:underline"
              >
                {s.logout} ({email})
              </button>
            </form>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-5">
            <h2 className="font-semibold text-slate-800">{s.access}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {session_id ? s.afterPay : s.hint}
            </p>
            {sent && (
              <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-700">
                {s.sent}
              </p>
            )}
            <form
              action={requestAccessAction}
              className="mt-3 flex flex-wrap gap-2"
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="hl" value={locale} />
              <input type="hidden" name="productId" value={productId} />
              <input
                type="email"
                name="email"
                required
                placeholder={s.email}
                aria-label={s.email}
                autoComplete="email"
                className="auth-field !mt-0 min-w-0 flex-1"
              />
              <button
                type="submit"
                className="rounded-full bg-linketto-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-linketto-700"
              >
                {s.request}
              </button>
            </form>
            {accessError && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">{s.error}</p>
            )}
            <p className="mt-4 text-sm">
              <Link
                href={`/u/${slug}`}
                className="font-semibold text-linketto-700 hover:underline"
              >
                {s.buy} →
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
