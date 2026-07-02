import { useCallback, useEffect, useRef, useState, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { PlayingCard } from "../cards/PlayingCard";
import type { SeatPos } from "../table/FeltTable";
import { useGameEvents } from "../useGameEvents";
import { useCardFlight, type CardFlight } from "./useCardFlight";

export interface TrickPlay {
  seat: number;
  card: string;
}

/**
 * Presentation buffer for trick-taking centres (Белот/Сантасе/Бридж/Кент).
 *
 * The engines resolve a trick in the SAME reduce that plays its closing card,
 * so `state.trick` never contains the full trick and re-rendering it directly
 * makes the last card invisible and the collection un-animatable. This hook
 * rebuilds the centre from the authoritative EVENT stream instead:
 *
 *   PLAY(seat, card)  → card appears in `displayTrick` (its slot flies in from
 *                       the player's seat, or from the exact hand node I clicked)
 *   TRICK(winner)     → the FULL trick holds ~450ms so it can be read, then
 *                       flies to the winner's seat and the centre clears.
 *
 * Fast bot play: a PLAY arriving mid-hold fast-forwards the pending clear so
 * steps never pile up. Resyncs fall back to mirroring `state.trick`.
 */
export function useTrickDisplay({
  matchId,
  seat,
  scopeRef,
  stateTrick,
  posOf,
}: {
  matchId: string | null;
  seat: number;
  scopeRef: RefObject<HTMLElement | null>;
  stateTrick: TrickPlay[] | null;
  posOf: (playerSeat: number, mySeat: number) => SeatPos;
}): {
  displayTrick: TrickPlay[];
  registerHandOrigin: (card: string, el: HTMLElement | null) => void;
  originFor: (p: TrickPlay) => SeatPos | HTMLElement;
  flight: CardFlight;
} {
  const flight = useCardFlight(scopeRef);
  const [displayTrick, setDisplayTrick] = useState<TrickPlay[]>([]);
  const origins = useRef(new Map<string, HTMLElement>());
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef(posOf);
  posRef.current = posOf;
  const seatRef = useRef(seat);
  seatRef.current = seat;

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useGameEvents(matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; card?: string };
      if (ev.type === "PLAY" && typeof ev.seat === "number" && typeof ev.card === "string") {
        if (holdTimer.current) {
          // a new trick started before the hold elapsed — fast-forward the clear
          clearHold();
          setDisplayTrick([{ seat: ev.seat, card: ev.card }]);
        } else {
          const play = { seat: ev.seat, card: ev.card };
          setDisplayTrick((d) => [...d.filter((p) => p.seat !== play.seat), play]);
        }
      }
      if (ev.type === "TRICK" && typeof ev.seat === "number") {
        const winner = ev.seat;
        clearHold();
        const hold = flight.reduced ? 60 : 450;
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          const nodes = scopeRef.current?.querySelectorAll<HTMLElement>(".aso-trick-card") ?? [];
          flight.collect(nodes, posRef.current(winner, seatRef.current));
          setDisplayTrick([]);
        }, hold);
      }
    }
  });

  // Resync fallback: with no animation pending, mirror the authoritative trick
  // (covers mid-match joins and any missed event packet).
  const stateKey = (stateTrick ?? []).map((p) => `${p.seat}:${p.card}`).join(",");
  useEffect(() => {
    if (holdTimer.current) return;
    const st = stateTrick ?? [];
    if (st.length > 0) {
      setDisplayTrick((d) => {
        const dk = d.map((p) => `${p.seat}:${p.card}`).join(",");
        return dk === stateKey ? d : st;
      });
    }
    // an empty state trick is NOT mirrored: right after TRICK the display
    // intentionally holds the full trick while state is already empty
  }, [stateKey]);

  useEffect(() => () => clearHold(), [clearHold]);

  const registerHandOrigin = useCallback((card: string, el: HTMLElement | null) => {
    if (el) origins.current.set(card, el);
  }, []);

  const originFor = useCallback(
    (p: TrickPlay): SeatPos | HTMLElement => {
      if (p.seat === seatRef.current) {
        const el = origins.current.get(p.card);
        if (el && el.isConnected) return el;
      }
      return posRef.current(p.seat, seatRef.current);
    },
    [],
  );

  return { displayTrick, registerHandOrigin, originFor, flight };
}

/** A card slot in the trick centre that flies in from its origin on mount. */
export function TrickCardSlot({
  play,
  originFor,
  flight,
  size = "md",
}: {
  play: TrickPlay;
  originFor: (p: TrickPlay) => SeatPos | HTMLElement;
  flight: CardFlight;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const flownRef = useRef(false);
  useLayoutEffect(() => {
    if (flownRef.current) return;
    flownRef.current = true;
    flight.flyIn(ref.current, originFor(play));
  }, []);
  return (
    <span ref={ref} className="aso-trick-card" style={{ display: "inline-block" }}>
      <PlayingCard card={play.card} size={size} />
    </span>
  );
}
