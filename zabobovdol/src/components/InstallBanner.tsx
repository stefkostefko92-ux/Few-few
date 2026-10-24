"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/events";

// „Сложи на телефона“ — иконата на началния екран е най-простият начин
// възрастният човек да се върне в сайта. Тук е общата логика:
//  • InstallButton — бутонът, който Chrome на Android позволява
//    (beforeinstallprompt); на iPhone такъв няма → стъпки на /instaliraj;
//  • InstallBanner — малка затваряема лента (поставя се в оформлението).
// Без бисквитки и без идентификатор: броим само натискането (install_click).

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

// Събитието идва веднъж и понякога преди React да е готов — затова го хващаме
// още при зареждането на модула, а компонентите само се абонират.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Спираме неразбираемата лента на браузъра — показваме наш ясен бутон.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Отворено като приложение (от иконата) — PWA, TWA (Google Play) или iPhone.
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {
    /* стар браузър */
  }
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return document.referrer.startsWith("android-app://");
}

function isMobileBrowser(): boolean {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPad с iPadOS се представя като Mac, но има тъч екран.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** unknown — още на сървъра; installed — вече е приложение; promptable — има бутон; manual — само стъпки. */
export type InstallState = "unknown" | "installed" | "promptable" | "manual";

function snapshot(): InstallState {
  if (installedNow || isStandalone()) return "installed";
  return deferred ? "promptable" : "manual";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "unknown");
}

// Показва системния прозорец „Инсталиране“. Може само веднъж на събитие.
async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = deferred;
  if (!ev) return "unavailable";
  deferred = null;
  emit();
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

export function InstallButton({ label = "Сложете сайта на телефона" }: { label?: string }) {
  const state = useInstallState();
  const [done, setDone] = useState(false);

  if (state === "installed" || done) {
    return (
      <p className="rounded-xl bg-green-50 p-4 text-lg font-semibold text-green-700" role="status">
        ✓ „За Бобов дол“ вече е на този телефон. Търсете иконата на началния екран.
      </p>
    );
  }
  if (state !== "promptable") return null;

  return (
    <button
      type="button"
      className="btn-primary text-lg"
      onClick={async () => {
        track("install_click");
        if ((await promptInstall()) === "accepted") setDone(true);
      }}
    >
      <PhoneIcon />
      {label}
    </button>
  );
}

const HIDE_KEY = "zbd_install_banner_hidden_until";
const HIDE_MS = 30 * 24 * 60 * 60 * 1000;
// Страници, на които лентата само би пречила.
const SKIP = ["/instaliraj", "/za-blizkite", "/admin", "/pechat"];

export function InstallBanner() {
  const state = useInstallState();
  const pathname = usePathname() || "/";
  const [eligible, setEligible] = useState(false);

  // Решаваме едва в браузъра (никакво премигване при зареждане): само мобилен
  // браузър и само ако човекът не е натиснал „Не сега“ през последните 30 дни.
  // Паметта е удобство — ако браузърът я забранява, лентата просто се показва.
  useEffect(() => {
    if (!isMobileBrowser()) return;
    let until = 0;
    try {
      until = Number(window.localStorage.getItem(HIDE_KEY) || 0);
    } catch {
      until = 0;
    }
    if (!(until > Date.now())) setEligible(true);
  }, []);

  if (!eligible || state === "unknown" || state === "installed") return null;
  if (SKIP.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const hide = () => {
    try {
      window.localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS));
    } catch {
      /* без памет — скриваме само за сега */
    }
    setEligible(false);
  };

  // Едноредово известие (~60px) под хедъра: иконата на сайта, кратък текст,
  // „Как?“ / „Сложете“ и X „Не сега“ (30 дни). Без голям син бутон — не се
  // бори със заглавието и главното действие на страницата.
  return (
    <aside
      aria-label="Сложете сайта на телефона"
      className="no-print border-b border-slate-200 bg-white"
    >
      <div className="container-content flex items-center gap-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-slate-900">
          Сложете сайта на телефона
        </p>
        {state === "promptable" ? (
          <button
            type="button"
            className="btn-secondary shrink-0 px-4 py-2"
            onClick={async () => {
              track("install_click");
              await promptInstall();
            }}
          >
            Сложете
          </button>
        ) : (
          <Link
            href="/instaliraj"
            className="btn-secondary shrink-0 px-4 py-2"
            onClick={() => track("install_click")}
          >
            Как?
            <span className="sr-only"> — стъпките за вашия телефон</span>
          </Link>
        )}
        <button
          type="button"
          onClick={hide}
          aria-label="Не сега"
          title="Не сега"
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
