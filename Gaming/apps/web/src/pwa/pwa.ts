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

/** Activate the waiting SW; controllerchange then reloads to the new version. */
export function applyUpdate(): void {
  if (waitingWorker) waitingWorker.postMessage("SKIP_WAITING");
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

    // Reload only when a NEW worker replaces one that already controlled the
    // page (an update). On the first visit there is no controller yet, and the
    // worker's clients.claim() fires controllerchange as well: that reload hit
    // every new player 1–2 s after the page appeared — typing lost, the match
    // queue left and re-joined, the first-visit rules dialog marked "seen"
    // and then gone.
    const hadController = navigator.serviceWorker.controller !== null;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
