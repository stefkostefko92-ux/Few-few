import { useCallback, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { useSettings } from "../../../lib/settings";
import { playCue } from "../../../lib/sound";
import { useGameEvents } from "../useGameEvents";
import { relativePos4 } from "../trick/FourPlayerTrick";
import type { SeatPos } from "../table/FeltTable";

export type BannerTone = "brass" | "win" | "loss";
export interface Banner {
  id: number;
  text: string;
  tone: BannerTone;
}

let bannerSeq = 1;

/** Centre of a DOMRect in viewport coords. */
function centre(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * The trick just won by `winnerSeat` flies off the centre toward that seat.
 * Reads the live `.aso-trick-card` nodes (still present because GAME_EVENTS
 * arrives before the new state) and animates CLONES in a fixed full-screen
 * layer, so the table's `overflow:hidden` never clips the flight.
 */
function flyTrick(
  scope: HTMLElement | null,
  winnerSeat: number,
  mySeat: number,
  posOf: (winner: number, mine: number) => SeatPos,
): void {
  if (!scope) return;
  const cards = scope.querySelectorAll<HTMLElement>(".aso-trick-card");
  if (cards.length === 0) return;
  const pos = posOf(winnerSeat, mySeat);
  const seatEl = scope.querySelector<HTMLElement>(`.aso-seat[data-pos="${pos}"]`);
  const targetRect = seatEl?.getBoundingClientRect();
  const target = targetRect ? centre(targetRect) : null;

  const layer = document.createElement("div");
  layer.style.cssText =
    "position:fixed;inset:0;z-index:60;pointer-events:none;overflow:visible;";
  document.body.appendChild(layer);

  const clones: HTMLElement[] = [];
  cards.forEach((card) => {
    const r = card.getBoundingClientRect();
    const clone = card.cloneNode(true) as HTMLElement;
    clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;`;
    const dest = target ?? { x: window.innerWidth / 2, y: window.innerHeight + 80 };
    const c = centre(r);
    clone.dataset.dx = String(dest.x - c.x);
    clone.dataset.dy = String(dest.y - c.y);
    layer.appendChild(clone);
    clones.push(clone);
  });

  gsap.to(clones, {
    x: (_i, el: HTMLElement) => Number(el.dataset.dx),
    y: (_i, el: HTMLElement) => Number(el.dataset.dy),
    rotate: () => gsap.utils.random(-16, 16),
    scale: 0.6,
    opacity: 0,
    duration: 0.46,
    ease: "power2.in",
    stagger: 0.05,
    onComplete: () => layer.remove(),
  });
}

type BannerSpec = { text: string; tone?: BannerTone };
interface FxOpts {
  matchId: string | null;
  seat: number;
  scopeRef: RefObject<HTMLElement | null>;
  /** Map an engine event to one or more banners (declarations, contra…). */
  toBanner?: (event: Record<string, unknown>) => BannerSpec | BannerSpec[] | null;
  /** Where the trick winner sits relative to me (default: 4-handed layout). */
  posOf?: (winner: number, mine: number) => SeatPos;
}

/**
 * Event-driven table juice: trick flights + announce banners, fed by the
 * authoritative GAME_EVENTS stream. Returns the live banners to render via
 * <Announcements/>. Honours reduced-motion (flight skipped; banners stay,
 * their CSS entrance is already disabled under the media query).
 */
export function useTableFx({ matchId, seat, scopeRef, toBanner, posOf }: FxOpts): { banners: Banner[] } {
  const reduced = useSettings((s) => s.reducedMotion);
  const [banners, setBanners] = useState<Banner[]>([]);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const pos = posOf ?? relativePos4;

  const push = useCallback((text: string, tone: BannerTone) => {
    const id = bannerSeq++;
    setBanners((b) => [...b.slice(-3), { id, text, tone }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 1900);
  }, []);

  useGameEvents(matchId, (events) => {
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      if (ev.type === "TRICK" && typeof ev.seat === "number") {
        playCue("flip");
        if (!reducedRef.current) {
          // Defer one frame so any just-played card has painted into the trick.
          requestAnimationFrame(() => flyTrick(scopeRef.current, ev.seat as number, seat, pos));
        }
      }
      const made = toBanner?.(ev);
      if (made) for (const b of Array.isArray(made) ? made : [made]) push(b.text, b.tone ?? "brass");
    }
  });

  return { banners };
}

/** Stacked brass announce banners over the table (declarations, contra, valat). */
export function Announcements({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;
  return (
    <div className="aso-fx-layer" aria-live="polite">
      {banners.map((b) => (
        <span key={b.id} className="aso-announce" data-tone={b.tone}>
          {b.text}
        </span>
      ))}
    </div>
  );
}
