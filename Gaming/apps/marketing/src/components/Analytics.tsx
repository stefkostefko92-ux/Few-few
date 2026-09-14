import Script from "next/script";

/**
 * Privacy-first, env-gated web analytics. Nothing is emitted unless the
 * operator opts in by setting the env var at build time (static export inlines
 * NEXT_PUBLIC_* at build) — so the default production build ships zero trackers
 * and needs no cookie-consent banner.
 *
 *  • NEXT_PUBLIC_PLAUSIBLE_DOMAIN — cookieless, GDPR-clean (recommended).
 *      optional NEXT_PUBLIC_PLAUSIBLE_SRC to self-host the script.
 *  • NEXT_PUBLIC_GA_ID ("G-XXXX") — Google Analytics 4. NOTE: GA sets cookies;
 *      enable a consent mechanism before turning this on in the EU.
 */
export function Analytics() {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const plausibleSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <>
      {plausibleDomain ? (
        <Script defer data-domain={plausibleDomain} src={plausibleSrc} strategy="afterInteractive" />
      ) : null}

      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}
