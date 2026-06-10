import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { HandCard } from "../scene/SceneShell";

interface Play {
  seat: number;
  card: string;
}
interface TrickState {
  hands: string[][];
  trick: Play[];
  turn: number;
}

/** Map an absolute seat to a table position relative to my seat (4-handed). */
export function relativePos4(seat: number, mySeat: number): SeatPos {
  const d = (seat - mySeat + 4) % 4;
  return d === 0 ? "bottom" : d === 1 ? "left" : d === 2 ? "top" : "right";
}

interface Props {
  state: TrickState;
  seat: number;
  /** Playable cards in my hand -> the action to send. */
  playable: Map<string, unknown>;
  names: (seat: number) => string;
  /** Brass announce banner content (e.g. trump), if any. */
  announce?: ReactNode;
  emptyTrickLabel: string;
  crest: string;
  feltColor?: string;
  feltDark?: string;
  onPlay: (card: string) => void;
  /** Extra seat badge (e.g. team dot). */
  seatBadge?: (seat: number) => ReactNode;
}

/** Reusable felt-table trick scene for 4-player games (Kent, Bridge play). */
export function FourPlayerTrick({
  state,
  seat,
  playable,
  names,
  announce,
  emptyTrickLabel,
  crest,
  feltColor,
  feltDark,
  onPlay,
  seatBadge,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn, playCard } = useCardAnimations(tableRef);

  const myTurn = state.turn === seat && playable.size > 0;
  const others = useMemo(() => [0, 1, 2, 3].filter((s) => s !== seat), [seat]);

  const dealtRef = useRef(false);
  useEffect(() => {
    if (!dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  function handlePlay(card: string, node: HTMLElement | null) {
    if (!playable.has(card)) return;
    playCard(node);
    playCue("flip");
    onPlay(card);
  }

  return (
    <div ref={tableRef}>
      <FeltTable crest={crest} feltColor={feltColor} feltDark={feltDark}>
        {others.map((s) => (
          <Seat
            key={s}
            pos={relativePos4(s, seat)}
            name={names(s)}
            active={state.turn === s}
            badge={seatBadge?.(s)}
          >
            <div style={{ display: "flex" }}>
              {/* compact face-down fan (cap the shown count so a 13-card hand
                  never runs into the centre trick on small screens) */}
              {Array.from({ length: Math.min(state.hands[s]?.length ?? 0, 8) }).map((_, i) => (
                <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -40 : 0 }} />
              ))}
            </div>
          </Seat>
        ))}

        <TableCenter>
          {state.trick.length === 0 ? (
            <span className="text-sm text-ink-muted">{emptyTrickLabel}</span>
          ) : (
            state.trick.map((p) => <PlayingCard key={p.seat} card={p.card} size="md" />)
          )}
        </TableCenter>

        <Seat
          pos="bottom"
          name={user?.displayName ?? t("game.you")}
          active={myTurn}
          badge={seatBadge?.(seat)}
        >
          <div className="aso-myhand" style={{ display: "flex" }}>
            {(state.hands[seat] ?? []).map((card, i) => (
              <HandCard
                key={`${card}-${i}`}
                card={card}
                index={i}
                count={(state.hands[seat] ?? []).length}
                playable={myTurn && playable.has(card)}
                onPlay={handlePlay}
              />
            ))}
          </div>
        </Seat>

        {/* Caller supplies a positioned node (e.g. top-left TrumpIndicator). */}
        {announce}
      </FeltTable>
    </div>
  );
}
