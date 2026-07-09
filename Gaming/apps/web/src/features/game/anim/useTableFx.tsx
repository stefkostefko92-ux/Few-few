import { useCallback, useState, type RefObject } from "react";
import { playCue } from "../../../lib/sound";
import { useGameEvents } from "../useGameEvents";
import type { SeatPos } from "../table/FeltTable";

type SoundCue = "deal" | "flip" | "win" | "loss" | "click" | "error" | "alert";

export type BannerTone = "brass" | "win" | "loss";
export interface Banner {
  id: number;
  text: string;
  tone: BannerTone;
}

let bannerSeq = 1;

type BannerSpec = { text: string; tone?: BannerTone };
export type ToBanner = (event: Record<string, unknown>) => BannerSpec | BannerSpec[] | null;

/** Shared transient-banner queue (auto-dismiss, keep last few). Each push
 *  plays a sound: an explicit `cue`, else a default by tone (brass = silent). */
function useBannerQueue(): { banners: Banner[]; push: (text: string, tone: BannerTone, cue?: SoundCue) => void } {
  const [banners, setBanners] = useState<Banner[]>([]);
  const push = useCallback((text: string, tone: BannerTone, cue?: SoundCue) => {
    const id = bannerSeq++;
    setBanners((b) => [...b.slice(-3), { id, text, tone }]);
    const sound = cue ?? (tone === "win" ? "win" : tone === "loss" ? "loss" : null);
    if (sound) playCue(sound);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 1900);
  }, []);
  return { banners, push };
}

interface FxOpts {
  matchId: string | null;
  seat: number;
  scopeRef: RefObject<HTMLElement | null>;
  /** Map an engine event to one or more banners (declarations, contra…). */
  toBanner?: ToBanner;
  /** Where the trick winner sits relative to me (default: 4-handed layout). */
  posOf?: (winner: number, mine: number) => SeatPos;
}

/**
 * Event-driven announce banners for the trick tables, fed by the authoritative
 * GAME_EVENTS stream. The trick FLIGHT itself lives in useTrickDisplay (an
 * event-buffered centre) — the old clone-and-fly here always lost the race
 * with the incoming state and never ran.
 */
export function useTableFx({ matchId, toBanner }: FxOpts): { banners: Banner[] } {
  const { banners, push } = useBannerQueue();

  useGameEvents(matchId, (events) => {
    for (const raw of events) {
      const ev = raw as Record<string, unknown>;
      if (ev.type === "TRICK") playCue("flip");
      const made = toBanner?.(ev);
      if (made) for (const b of Array.isArray(made) ? made : [made]) push(b.text, b.tone ?? "brass");
    }
  });

  return { banners };
}

/**
 * Banner-only announcements for non-card games (chess, board, betting…): no
 * trick flight. Returns `announce` so the view can also raise CLIENT-side
 * banners (e.g. an illegal move the server never sees).
 */
export function useGameAnnouncements({
  matchId,
  toBanner,
}: {
  matchId: string | null;
  toBanner?: ToBanner;
}): { banners: Banner[]; announce: (text: string, tone?: BannerTone, cue?: SoundCue) => void } {
  const { banners, push } = useBannerQueue();
  useGameEvents(matchId, (events) => {
    for (const raw of events) {
      const made = toBanner?.(raw as Record<string, unknown>);
      if (made) for (const b of Array.isArray(made) ? made : [made]) push(b.text, b.tone ?? "brass");
    }
  });
  const announce = useCallback(
    (text: string, tone: BannerTone = "brass", cue?: SoundCue) => push(text, tone, cue),
    [push],
  );
  return { banners, announce };
}

/** Stacked announce banners. `fixed` floats them near the top of the screen
 *  (board games); otherwise they sit over the felt table (absolute parent). */
export function Announcements({ banners, fixed }: { banners: Banner[]; fixed?: boolean }) {
  if (banners.length === 0) return null;
  return (
    <div className={fixed ? "aso-fx-layer aso-fx-layer--fixed" : "aso-fx-layer"} aria-live="polite">
      {banners.map((b) => (
        <span key={b.id} className="aso-announce" data-tone={b.tone}>
          {b.text}
        </span>
      ))}
    </div>
  );
}
