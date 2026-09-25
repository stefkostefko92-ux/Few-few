// frontend/src/site/LegalShell.jsx
// Обвивката на правните страници (Terms, Privacy, Cookies, EULA, Accessibility).
// Преди всяка страница носеше собствено копие на LegalPage/S/Th/Td/Tr (4 почти
// еднакви); редизайнът (25.09.2026) ги събира тук, в стила на сайта: общият
// хедър и футър, текст 16 px (беше 14 px — дълъг правен текст трябва да се
// чете), ред под 80 знака, таблиците с ясни граници.
import { SiteHeader, SiteFooter } from "./SiteChrome";
import { SITE_STRINGS } from "../i18n/siteStrings";

export function LegalPage({ title, updated, children, wide = false }) {
  return (
    <div className="site min-h-screen">
      <SiteHeader nav={SITE_STRINGS.en.nav} home="/" />
      <main id="main" className="site-main">
        <article className={`${wide ? "max-w-4xl" : "max-w-3xl"} mx-auto px-4 sm:px-6 pt-8 pb-20`}>
          <h1 className="site-h font-bold text-site-chrome text-[2.2rem] sm:text-5xl">{title}</h1>
          {updated && <p className="mt-3 text-site-steel">Last updated: {updated}</p>}
          <div className="mt-12">{children}</div>
        </article>
      </main>
      <SiteFooter locale="en" />
    </div>
  );
}

export function S({ title, children }) {
  return (
    <section className="mb-12">
      <h2 className="site-h font-bold text-site-chrome text-xl sm:text-[1.4rem] mb-4">{title}</h2>
      <div className="text-base text-[#c3c9d3] leading-[1.7] space-y-4 max-w-[70ch] [&_strong]:text-site-chrome [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-site-chrome [&_a]:underline [&_a]:decoration-site-steel [&_a]:underline-offset-2 [&_code]:text-site-chrome">
        {children}
      </div>
    </section>
  );
}

export function Th({ children }) {
  return <th scope="col" className="text-left py-3 px-3 text-site-steel font-semibold border-b border-site-line align-bottom">{children}</th>;
}
export function Td({ children }) {
  return <td className="py-3 px-3 border-b border-site-line/70 align-top text-[#c3c9d3]">{children}</td>;
}
export function Tr({ children }) {
  return <tr>{children}</tr>;
}
