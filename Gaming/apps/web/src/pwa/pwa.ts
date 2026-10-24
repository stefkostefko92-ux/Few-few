/*
 * Minimal PWA runtime — service-worker registration, update detection, and the
 * "install app" prompt — with no external dependency. A tiny pub/sub lets React
 * components react to update-ready / installable state.
 */
type Listener = () => void;

let updateReady = false;
let waitingWorker: ServiceWorker | null = null;
/** Set by the update toast: only an update the player asked for reloads the page. */
let updateRequested = false;
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

/** Activate the waiting SW; controllerchange then reloads to the new version.
 *  The SW skips waiting on install, so the new worker may already control the
 *  page — then the reload itself is all that is left. */
export function applyUpdate(): void {
  updateRequested = true;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!waitingWorker || waitingWorker.state === "activated" || waitingWorker === sw?.controller) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage("SKIP_WAITING");
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

    // Reload ONLY for an update the player asked for (the toast). The very
    // first install also fires controllerchange — the SW claims the open page —
    // and the old unconditional reload threw a first-time visitor's page away a
    // moment after it loaded: in a game the reload re-queued the player, which
    // forfeits the match just started, and the auto-opened rules (already
    // marked as seen) never came back.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!updateRequested || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
