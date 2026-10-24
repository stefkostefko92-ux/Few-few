/*
 * Minimal PWA runtime — service-worker registration, update detection, and the
 * "install app" prompt — with no external dependency. A tiny pub/sub lets React
 * components react to update-ready / installable state.
 */
type Listener = () => void;

let updateReady = false;
let waitingWorker: ServiceWorker | null = null;
/** Set by applyUpdate(): the only service-worker takeover that reloads. */
let reloadOnTakeover = false;
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

/** The player asked for the new version („Обнови“): activate the waiting SW
 *  (controllerchange then reloads), or — when it already took over, as it
 *  skips waiting on install — reload right away. */
export function applyUpdate(): void {
  reloadOnTakeover = true;
  const w = waitingWorker;
  if (w && w.state === "installed") {
    w.postMessage("SKIP_WAITING");
    return;
  }
  window.location.reload();
}

/**
 * controllerchange handler: reload ONLY for an update the player asked for.
 * The worker also takes control on its very first install (skipWaiting +
 * clients.claim) and whenever it updates itself; reloading then yanked the
 * page from under a first-time visitor a second after it loaded — the game's
 * rules dialog vanished and the match queue was joined twice.
 */
export function takeoverReloader(shouldReload: () => boolean, reload: () => void): () => void {
  let reloaded = false;
  return () => {
    if (reloaded || !shouldReload()) return;
    reloaded = true;
    reload();
  };
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
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

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

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      takeoverReloader(
        () => reloadOnTakeover,
        () => window.location.reload(),
      ),
    );
  });
}
