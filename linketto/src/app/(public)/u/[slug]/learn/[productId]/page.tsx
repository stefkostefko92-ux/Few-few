import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { videoEmbedSrc } from '@/lib/blocks';
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
      active: true,
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

  const email = await getBuyerEmail();
  const access = email ? await hasActiveEntitlement(email, productId) : false;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          {product.type === 'MEMBERSHIP' ? 'Membership' : 'Course'} ·{' '}
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
                <p className="text-sm text-slate-400">—</p>
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
                      <div className="mt-3 aspect-video overflow-hidden rounded-lg">
                        <iframe
                          src={embed}
                          title={lesson.title}
                          allowFullScreen
                          className="h-full w-full"
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
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
              >
                {s.request}
              </button>
            </form>
            {accessError && (
              <p className="mt-2 text-xs text-red-600">{s.error}</p>
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
