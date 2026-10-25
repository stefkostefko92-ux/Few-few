"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { usePathname } from "next/navigation";
import { SITE, NAV_GROUPS, QUICK_NAV, TOP_NAV, type NavGroup, type NavItem } from "@/lib/site";
import { SearchBar } from "@/components/SearchBar";
import { ChevronDown } from "@/components/icons";
import { isDangerNav, navIcon } from "@/components/nav-icons";
import { SECTION } from "@/lib/section-names";

// „Още полезно“ — страниците, които иначе са само във футъра; в мобилното
// меню и в „Всички раздели“ стоят след разделите.
const MORE: NavGroup = { title: SECTION.more, items: QUICK_NAV };
const ALL_GROUPS: NavGroup[] = [...NAV_GROUPS, MORE];

// Ред на скриване, когато основното меню не се събира на един ред: от
// последния по важност към първия („Данъци и срокове“, „Пенсии и помощи“…).
// „Пазете се от измами“ (безопасността) се скрива последна, а текущият раздел —
// само ако нищо друго не остава.
const SAFETY_HREF = "/izmami";
const HIDE_ORDER: string[] = [
  ...TOP_NAV.map((i) => i.href)
    .filter((h) => h !== SAFETY_HREF)
    .reverse(),
  SAFETY_HREF,
];

function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Ред в списък от раздели: иконно квадратче + име (+ описание за „Най-търсени“). */
function SectionLink({
  item,
  current,
  rich,
  onNavigate,
}: {
  item: NavItem;
  current: boolean;
  /** С описание и по-голямо квадратче (групата „Най-търсени“). */
  rich: boolean;
  onNavigate: () => void;
}) {
  const Icon = navIcon(item.href);
  const chip = isDangerNav(item.href) ? "icon-chip-sm icon-chip-danger" : "icon-chip-sm";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={
        "group flex items-center gap-3 rounded-lg px-2 text-slate-900 hover:bg-slate-100 aria-[current=page]:bg-brand-50 " +
        (rich ? "min-h-[3.75rem] py-2" : "min-h-[3.25rem] py-1.5")
      }
    >
      <span className={chip}>
        <Icon aria-hidden />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="nav-label block font-semibold leading-snug">{item.label}</span>
        {rich && item.description && (
          <span className="block text-base leading-snug text-slate-600">{item.description}</span>
        )}
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  // Мобилното меню (под lg) и панелът „Всички раздели“ (от lg).
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  // Долният ръб на хедъра в момента на отваряне — оттам почва слоят на
  // мобилното меню (над хедъра може да има лента за четене с различна височина).
  const [menuTop, setMenuTop] = useState(0);
  const [panelMax, setPanelMax] = useState<number | undefined>(undefined);
  const headerRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const allBtnRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);

  // Смяна на страницата затваря и двете менюта (Link в App Router не
  // демонтира хедъра). Сравнението е при рендер — без допълнителен ефект.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setAllOpen(false);
  }

  const headerBottom = useCallback(
    () => Math.max(0, Math.round(headerRef.current?.getBoundingClientRect().bottom ?? 0)),
    [],
  );

  // Мобилното меню е фиксиран слой под хедъра: страницата отдолу не се
  // превърта, Escape затваря и връща фокуса на бутона, чатът се скрива
  // (html.menu-open .chat-fab в globals.css). На lg+ менюто изчезва само.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.classList.add("menu-open");
    html.style.overflow = "hidden";
    mobileRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuBtnRef.current?.focus();
    };
    const onResize = () => setMenuTop(headerBottom());
    // Лентата за четене над хедъра може да се разгъне, докато менюто е
    // отворено (в iOS Safari докосването не фокусира бутона и onBlur не
    // затваря менюто) — хедърът слиза и слоят трябва да тръгне от новия ръб,
    // иначе покрива бутона „Меню“.
    const ro = new ResizeObserver(onResize);
    const bar = document.querySelector(".a11y-bar");
    if (bar) ro.observe(bar);
    if (headerRef.current) ro.observe(headerRef.current);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => {
      if (mq.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    mq.addEventListener("change", onMq);
    return () => {
      html.classList.remove("menu-open");
      html.style.overflow = prevOverflow;
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", onMq);
    };
  }, [open, headerBottom]);

  // „Всички раздели“: Escape затваря и връща фокуса; щракване извън хедъра
  // затваря; плаващият бутон на чата се скрива (html.menu-open), за да не
  // покрива последните връзки на панела.
  useEffect(() => {
    if (!allOpen) return;
    const html = document.documentElement;
    html.classList.add("menu-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAllOpen(false);
      allBtnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setAllOpen(false);
    };
    const onResize = () => setPanelMax(window.innerHeight - headerBottom());
    // Панелът е само от lg — под lg се затваря (иначе чатът остава скрит).
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => {
      if (!mq.matches) setAllOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    mq.addEventListener("change", onMq);
    return () => {
      html.classList.remove("menu-open");
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", onMq);
    };
  }, [allOpen, headerBottom]);

  // Вторият ред е висок един ред: показва толкова раздели, колкото се
  // събират според ширината и размера на текста (125% на 1280px). Излишните
  // се скриват по HIDE_ORDER — първо най-малко важните, никога преди тях
  // „Пазете се от измами“ и текущия раздел. Скритите отиват в края на реда
  // (order) и на скрития втори ред (overflow-hidden); скриват се и за
  // клавиатурата и четеца (visibility) — те са в „Всички раздели“.
  useEffect(() => {
    const ul = navListRef.current;
    if (!ul) return;
    const update = () => {
      const items = Array.from(ul.children) as HTMLElement[];
      const avail = ul.getBoundingClientRect().width + 0.01;
      // order и visibility не менят размера на елементите — затова
      // ResizeObserver отдолу не се зацикля.
      const width = new Map<HTMLElement, number>();
      for (const li of items) width.set(li, li.getBoundingClientRect().width);
      const byHref = new Map(items.map((li) => [li.dataset.href ?? "", li]));
      const current = items.find((li) => li.querySelector('[aria-current="page"]'));
      const order = HIDE_ORDER.map((h) => byHref.get(h)).filter(
        (li): li is HTMLElement => !!li && li !== current,
      );
      if (current) order.push(current);
      const hidden = new Set<HTMLElement>();
      let total = items.reduce((s, li) => s + (width.get(li) ?? 0), 0);
      for (const li of order) {
        if (total <= avail) break;
        hidden.add(li);
        total -= width.get(li) ?? 0;
      }
      // Скрит по-широк раздел може да е освободил място за по-тесен —
      // връщаме обратно, от най-важния към най-малко важния.
      for (const li of [...order].reverse()) {
        if (!hidden.has(li)) continue;
        const w = width.get(li) ?? 0;
        if (total + w <= avail) {
          hidden.delete(li);
          total += w;
        }
      }
      for (const li of items) {
        li.style.order = hidden.has(li) ? "1" : "";
      }
      // Предпазител: каквото все пак е паднало на втория ред, не се фокусира.
      const top = Math.min(...items.filter((li) => !hidden.has(li)).map((li) => li.offsetTop));
      for (const li of items) {
        li.style.visibility = hidden.has(li) || li.offsetTop > top ? "hidden" : "";
      }
    };
    update();
    // Редът и всяка връзка поотделно: шрифтът (Inter) идва след първото
    // рисуване и мени ширината на връзките, без редът да мени своята.
    const ro = new ResizeObserver(update);
    ro.observe(ul);
    for (const li of Array.from(ul.children)) ro.observe(li);
    return () => ro.disconnect();
  }, [pathname]);

  // Фокусът излезе от хедъра (Tab след последната връзка) → менютата се
  // затварят, иначе фокусът би бил върху съдържание под слоя.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || headerRef.current?.contains(next)) return;
    setOpen(false);
    setAllOpen(false);
  };

  // Скрий публичния хедър в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  // На началната търсачката е в героя — втора в хедъра би била повторение.
  const showSearch = pathname !== "/";
  const close = () => {
    setOpen(false);
    setAllOpen(false);
  };

  return (
    <header
      ref={headerRef}
      onBlur={onBlur}
      className={
        "site-header sticky top-0 z-40 border-b border-slate-200 " +
        // backdrop-filter прави хедъра „контейнер“ за fixed наследниците —
        // докато мобилното меню е отворено, фонът е плътен и без него.
        (open ? "bg-white" : "bg-white/95 backdrop-blur")
      }
    >
      {/* Цветовете на герба с твърди граници: синьото води, златото и
          червеното са акцент. */}
      <div
        aria-hidden
        className="header-tricolor h-1 w-full bg-[linear-gradient(90deg,#212f8a_0_70%,#f3b01f_70%_85%,#d11f1f_85%)]"
      />
      <div className="container-content">
        <div className="flex h-16 items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/bobov-dol-grb-mark.png"
              alt=""
              width={34}
              height={49}
              className="h-11 w-auto shrink-0"
            />
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-lg font-bold text-slate-900 sm:text-xl">
                {SITE.name}
              </span>
              <span className="hidden text-sm font-normal text-slate-600 sm:block">
                {SITE.tagline}
              </span>
            </span>
          </Link>

          {showSearch && (
            <div className="ml-auto hidden w-full min-w-[16rem] max-w-md lg:block">
              <SearchBar compact />
            </div>
          )}

          <button
            ref={menuBtnRef}
            type="button"
            className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 hover:bg-slate-100 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => {
              if (!open) setMenuTop(headerBottom());
              setOpen((v) => !v);
            }}
          >
            <MenuIcon open={open} />
            {/* Под 360px (особено с уголемен текст) остава само иконката;
                името „Меню“ остава за екранния четец. */}
            <span className="max-[359px]:sr-only">Меню</span>
          </button>
        </div>

        {/* Основното меню на компютър — втори ред. */}
        <div className="hidden border-t border-slate-200 lg:block">
          <nav aria-label="Основно меню" className="-mx-2.5 flex items-stretch gap-1">
            <ul ref={navListRef} className="flex h-12 min-w-0 flex-1 flex-wrap items-stretch overflow-hidden">
              {TOP_NAV.map((item) => (
                <li key={item.href} data-href={item.href} className="flex">
                  {/* Фокусът е навътре (offset −3px): редът реже всичко извън себе си. */}
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                    className="inline-flex h-12 items-center whitespace-nowrap px-2.5 text-base font-semibold text-slate-800 hover:bg-slate-50 hover:text-brand-700 focus-visible:[outline-offset:-3px] aria-[current=page]:text-brand-700 aria-[current=page]:shadow-[inset_0_-3px_0_#212f8a]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              ref={allBtnRef}
              type="button"
              aria-expanded={allOpen}
              aria-controls="all-sections"
              onClick={() => {
                if (!allOpen) setPanelMax(window.innerHeight - headerBottom());
                setAllOpen((v) => !v);
              }}
              className="inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-base font-semibold text-brand-700 hover:bg-slate-50 focus-visible:[outline-offset:-3px] aria-expanded:bg-brand-50"
            >
              Всички раздели
              <ChevronDown
                className={"h-5 w-5 transition-transform " + (allOpen ? "rotate-180" : "")}
                aria-hidden
              />
            </button>
          </nav>
        </div>
      </div>

      {/* Панелът „Всички раздели“ (lg+): всички раздели по групи, с иконите
          от плочките на началната. */}
      {allOpen && (
        <div
          id="all-sections"
          className="animate-fade-in absolute inset-x-0 top-full hidden overflow-y-auto border-b border-slate-200 bg-white shadow-lg lg:block"
          style={{ maxHeight: panelMax }}
        >
          <div className="container-content py-6">
            <div className="gap-x-8 lg:columns-3 xl:columns-4">
              {ALL_GROUPS.map((g, gi) => (
                <section
                  key={g.title}
                  aria-labelledby={`all-g${gi}`}
                  className="mb-6 break-inside-avoid"
                >
                  <h2 id={`all-g${gi}`} className="label-caps mb-1.5 px-2">
                    {g.title}
                  </h2>
                  <ul className="space-y-0.5">
                    {g.items.map((item) => (
                      <li key={item.href}>
                        <SectionLink
                          item={item}
                          current={isCurrent(pathname, item.href)}
                          rich={gi === 0}
                          onNavigate={close}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Мобилното меню — фиксиран слой от долния ръб на хедъра до края на
          екрана; превърта се само в себе си. */}
      {open && (
        <div
          id="mobile-nav"
          ref={mobileRef}
          tabIndex={-1}
          className="animate-fade-in fixed inset-x-0 bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-slate-200 bg-white focus:outline-none lg:hidden"
          style={{ top: menuTop }}
        >
          <div className="container-content pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
            <SearchBar />
            <nav aria-label="Всички раздели" className="mt-5 space-y-5">
              {ALL_GROUPS.map((g, gi) => (
                <section key={g.title} aria-labelledby={`mob-g${gi}`}>
                  <h2 id={`mob-g${gi}`} className="label-caps px-2">
                    {g.title}
                  </h2>
                  <ul
                    className={
                      "mt-1.5 grid grid-cols-1 gap-x-4 sm:grid-cols-2 " +
                      (gi === 0 ? "gap-y-1" : "divide-y divide-slate-200 sm:divide-y-0")
                    }
                  >
                    {g.items.map((item) => (
                      <li key={item.href}>
                        <SectionLink
                          item={item}
                          current={isCurrent(pathname, item.href)}
                          rich={gi === 0}
                          onNavigate={close}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
