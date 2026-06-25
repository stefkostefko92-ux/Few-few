import Link from "next/link";
import { Phone, Mail, MapPin } from "@/components/icons";
import { Crest } from "@/components/Crest";
import { SITE, PRIMARY_NAV, FOOTER_NAV } from "@/lib/site";
import { getFacebookUrl } from "@/lib/settings";

// Вградена иконка на Facebook.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const facebookUrl = await getFacebookUrl();
  const phoneHref = SITE.contact.phone.replace(/\s/g, "");

  return (
    <footer className="mt-16 border-t-4 border-gold-400 bg-brand-900 text-slate-300">
      <div className="container-content py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Crest className="h-12 w-auto" />
              <span className="text-lg font-bold text-white">{SITE.shortName}</span>
            </div>
            <p className="mt-3 text-sm text-slate-400">{SITE.description}</p>
            <p className="mt-3 text-sm text-slate-400">
              Прякор: <span className="font-semibold text-gold-400">„{SITE.nickname}“</span>
              {" · "}Цветове: {SITE.colors}.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Раздели
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PRIMARY_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-slate-300 hover:text-gold-400">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Информация
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {FOOTER_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="text-slate-300 hover:text-gold-400">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Контакти
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li className="flex items-start gap-2 text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden />
                <span>
                  {SITE.stadium.name}
                  <br />
                  {SITE.contact.address}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
                <a href={`tel:${phoneHref}`} className="font-semibold text-slate-200 hover:text-gold-400">
                  {SITE.contact.phone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
                <a href={`mailto:${SITE.contact.email}`} className="break-all text-slate-200 hover:text-gold-400">
                  {SITE.contact.email}
                </a>
              </li>
            </ul>
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <FacebookIcon className="h-4 w-4" />
                Последвайте ни във Facebook
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center">
          <p>
            © {year} {SITE.name}. Всички права запазени.
          </p>
          <p>
            Изработка и дарение:{" "}
            <a
              href="https://carbonstealth.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-200 underline decoration-gold-400 decoration-2 underline-offset-2 hover:text-gold-400"
            >
              Carbon Stealth VCC
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
