// frontend/src/site/heroClasses.js
// Класовете на хедъра и hero-то — ЕДИН източник за React (site/Landing.jsx,
// site/SiteChrome.jsx) и за статичния HTML (scripts/prerender.mjs).
//
// Защо (измерено 25.09.2026, телефон 4× CPU + бавен 4G): статичният HTML беше
// обикновен сив текст със системен шрифт; първото рисуване не приличаше на
// сайта и LCP чакаше JS (2.4 s на „/“, 2.9 s на /bg). Сега prerender рисува
// СЪЩОТО hero със същите класове — дизайнът се вижда преди JS, а React го
// подменя с идентичен елемент (без скок). Файлът е .js, за да го чете и Node.
export const HEADER = {
  bar: "max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4",
  brand: "flex items-center gap-2.5 min-w-0",
  name: "site-h font-bold text-lg text-site-chrome whitespace-nowrap",
  nav: "hidden md:flex items-center gap-7 text-[15px] text-site-steel",
  mobileNav: "md:hidden max-w-6xl mx-auto px-4 pb-2 flex gap-5 overflow-x-auto text-[15px] text-site-steel",
  actions: "flex items-center gap-3 sm:gap-5",
  signIn: "text-[15px] font-medium text-site-chrome hover:text-white whitespace-nowrap",
  invite: "hidden sm:inline-flex items-center h-10 px-4 rounded-lg border border-site-line text-[15px] font-medium text-site-chrome hover:border-site-steel whitespace-nowrap",
};

export const HERO = {
  section: "max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-20 sm:pb-28 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-14 items-start",
  col: "lg:pt-8",
  h1: "site-h font-bold text-site-chrome text-[2.6rem] leading-[1.02] sm:text-6xl xl:text-[4.4rem]",
  sub: "mt-6 text-lg sm:text-xl text-site-steel leading-relaxed max-w-[34rem]",
  ctaRow: "mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-x-6",
  notes: "mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-site-steel",
};
