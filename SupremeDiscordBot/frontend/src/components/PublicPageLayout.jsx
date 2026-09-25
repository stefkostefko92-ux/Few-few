// frontend/src/components/PublicPageLayout.jsx
// Обвивката на публичните страници със съдържание: /features/*, /compare/*,
// /guides/*, /commands, /status и 404. От редизайна (25.09.2026) — същият хедър
// и футър като лендинга (site/SiteChrome.jsx), така че сайтът е един, не две
// визии. Вътрешните cs-* класове на тези страници се пребоядисват в рамките на
// .site (site/site.css) — таблото, което ги ползва, остава непокътнато.
import { SiteHeader, SiteFooter, BOT_INVITE_URL } from "../site/SiteChrome";
import { SITE_STRINGS } from "../i18n/siteStrings";

export default function PublicPageLayout({ crumb, children, maxWidth = "max-w-4xl" }) {
  return (
    <div className="site min-h-screen flex flex-col">
      <SiteHeader nav={SITE_STRINGS.en.nav} home="/" />
      <main id="main" className="site-main flex-1">
        <div className={`${maxWidth} mx-auto px-4 sm:px-6 pt-6 pb-20 w-full`}>
          {crumb && (
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-site-steel">
              <a href="/" className="hover:text-site-chrome">Supreme Bot</a>
              <span aria-hidden="true" className="mx-2">/</span>
              <span className="text-site-chrome">{crumb}</span>
            </nav>
          )}
          {children}
        </div>
      </main>
      <SiteFooter locale="en" />
    </div>
  );
}

export { BOT_INVITE_URL };
