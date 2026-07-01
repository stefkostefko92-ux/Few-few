import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { themeVars } from "@/lib/theme";

export type NavItem = { href: string; label: string; active: boolean };

// Обвивка на публикувания сайт: хедър (лого + меню + език) и футър (импресум).
// Прилага темата (цвят/шрифт) като CSS променливи върху цялото съдържание.
export function SiteChrome({
  siteName,
  siteSlug,
  currentPath,
  logoUrl,
  brandColor,
  fontFamily,
  navEnabled,
  nav,
  locale,
  showEn,
  footerText,
  privacyUrl,
  children,
}: {
  siteName: string;
  siteSlug: string;
  currentPath: string; // напр. /site/slug или /site/slug/page — за езиковия превключвател
  logoUrl?: string | null;
  brandColor?: string | null;
  fontFamily?: string | null;
  navEnabled: boolean;
  nav: NavItem[];
  locale: Locale;
  showEn: boolean;
  footerText?: string | null;
  privacyUrl?: string | null;
  children: React.ReactNode;
}) {
  const vars = themeVars(brandColor, fontFamily) as React.CSSProperties;
  const homeBase = `/site/${siteSlug}`;
  const homeHref = locale === "en" ? `${homeBase}?lang=en` : homeBase;

  return (
    <div
      style={vars}
      className="flex min-h-screen flex-col bg-white [font-family:var(--pub-font)]"
    >
      {navEnabled && (
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
            <Link href={homeHref} className="flex items-center gap-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
              ) : (
                <span className="text-lg font-semibold text-slate-900">{siteName}</span>
              )}
            </Link>

            <div className="flex items-center gap-4">
              {nav.length > 0 && (
                <nav aria-label="Основно меню" className="hidden gap-4 text-sm sm:flex">
                  {nav.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={n.active ? "page" : undefined}
                      className={`transition-colors hover:text-[color:var(--pub-accent)] ${
                        n.active ? "font-semibold text-[color:var(--pub-accent)]" : "text-slate-600"
                      }`}
                    >
                      {n.label}
                    </Link>
                  ))}
                </nav>
              )}
              {showEn && (
                <div className="flex items-center gap-1 text-sm">
                  <Link
                    href={currentPath}
                    hrefLang="bg"
                    className={locale === "bg" ? "font-semibold text-slate-900" : "text-slate-400 hover:text-slate-700"}
                  >
                    BG
                  </Link>
                  <span className="text-slate-300">/</span>
                  <Link
                    href={`${currentPath}?lang=en`}
                    hrefLang="en"
                    className={locale === "en" ? "font-semibold text-slate-900" : "text-slate-400 hover:text-slate-700"}
                  >
                    EN
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Мобилно меню: хоризонтален скрол под хедъра */}
          {nav.length > 0 && (
            <nav
              aria-label="Меню (мобилно)"
              className="flex gap-4 overflow-x-auto border-t border-slate-100 px-5 py-2 text-sm sm:hidden"
            >
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap ${n.active ? "font-semibold text-[color:var(--pub-accent)]" : "text-slate-600"}`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
        </header>
      )}

      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-5 py-8 text-sm text-slate-500">
          {footerText && <p className="whitespace-pre-wrap">{footerText}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {privacyUrl && (
              <a href={privacyUrl} target="_blank" rel="noreferrer" className="hover:text-slate-800">
                {locale === "en" ? "Privacy policy" : "Политика за поверителност"}
              </a>
            )}
            <span className="text-slate-400">© {siteName}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
