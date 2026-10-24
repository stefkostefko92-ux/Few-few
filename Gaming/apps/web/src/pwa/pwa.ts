/*
 * Minimal PWA runtime — service-worker registration, update detection, and the
 * "install app" prompt — with no external dependency. A tiny pub/sub lets React
 * components react to update-ready / installable state.
 */
type Listener = () => void;

let updateReady = false;
let waitingWorker: ServiceWorker | null = null;
// The captured beforeinstallprompt event (Chromium); typed loosely as it's non-standard.
let deferredPrompt: (Event & { prompt: () => void; userChoice: Promise<unknown> }) | null = null;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export function subscribePwa(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const isUpdateReady = (): boolean => updateReady;
export const canInstall = (): boolean => deferredPrompt !== null;

/**
 * Презарежда страницата САМО по желание на играча („Обнови“), никога само
 * защото нов service worker е поел страницата. sw.js поема веднага
 * (skipWaiting + clients.claim), а при ПЪРВО посещение claim() също дава
 * `controllerchange` — безусловното презареждане там рестартираше всяка нова
 * страница ~0,5 s след зареждането: прозорецът с правилата изчезваше (вече
 * отбелязан като видян), а мачът губеше сокета насред опашката.
 */
export function createReloadGate(reload: () => void): {
  request: (alreadyActive: boolean) => void;
  controllerChanged: () => void;
} {
  let requested = false;
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    reload();
  };
  return {
    /** Играчът поиска новата версия; `alreadyActive` — тя вече управлява страницата. */
    request(alreadyActive) {
      requested = true;
      if (alreadyActive) fire();
    },
    /** Нов service worker пое страницата (първо посещение или обновяване). */
    controllerChanged() {
      if (requested) fire();
    },
  };
}

const reloadGate = createReloadGate(() => window.location.reload());

/** Минимален интервал между две презареждания заради липсващ chunk (без цикъл). */
const STALE_RELOAD_MS = 60_000;

/**
 * След деплой отворената страница е на старата версия, а старите chunk-ове на
 * игрите вече ги няма на сървъра: lazy зареждането пада. Тогава — едно
 * презареждане към новата версия (най-много веднъж в минута). Преди това го
 * „решаваше“ безусловното презареждане при всяка смяна на service worker-а.
 */
export function shouldReloadForStaleChunk(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > STALE_RELOAD_MS;
}

/** „Обнови“: активира чакащия SW (controllerchange презарежда), а ако новата
 *  версия вече е поела страницата — презарежда направо. */
export function applyUpdate(): void {
  const w = waitingWorker;
  const stillWaiting = w !== null && w.state === "installed";
  if (stillWaiting) w.postMessage("SKIP_WAITING");
  reloadGate.request(!stillWaiting);
}

/** Show the native install prompt (once captured). */
export async function promptInstall(): Promise<void> {
  const p = deferredPrompt;
  if (!p) return;
  deferredPrompt = null;
  emit();
  p.prompt();
  try {
    await p.userChoice;
  } catch {
    /* dismissed */
  }
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined") return;

  window.addEventListener("vite:preloadError", (e) => {
    const KEY = "aso_stale_reload_at";
    let last: number | null = null;
    try {
      const v = sessionStorage.getItem(KEY);
      last = v === null ? null : Number(v);
      if (!shouldReloadForStaleChunk(last, Date.now())) return; // вече опитахме — нека грешката се покаже
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return; // без sessionStorage няма защита от цикъл — не презареждай
    }
    e.preventDefault();
    window.location.reload();
  });

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });

  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          updateReady = true;
          emit();
        }
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorker = nw;
              updateReady = true;
              emit();
            }
          });
        });
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener("controllerchange", () => reloadGate.controllerChanged());
  });
}
