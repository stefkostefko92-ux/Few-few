import { useSyncExternalStore } from "react";

/** Phones (portrait): the felt is ~330px wide, so 4-handed tables compact the
 *  side fans and the trick, and Сантасе moves its talon out of the trick. */
const QUERY = "(max-width: 640px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const snapshot = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;

/** True on a narrow (phone) viewport; re-renders when the device rotates or the
 *  window crosses the breakpoint — which also re-fits the hand overlap. */
export function useNarrowTable(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
