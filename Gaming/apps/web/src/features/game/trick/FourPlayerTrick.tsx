import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useTableFx, Announcements, type BannerTone } from "../anim/useTableFx";
import { useTrickDisplay, TrickCardSlot } from "../anim/useTrickDisplay";
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
  /** Match id + event→banner mapper to drive trick flights & announce banners. */
  matchId?: string | null;
  toBanner?: (event: Record<string, unknown>) => { text: string; tone?: BannerTone } | null;
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
  matchId,
  toBanner,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn } = useCardAnimations(tableRef);
  const { banners } = useTableFx({ matchId: matchId ?? null, seat, scopeRef: tableRef, toBanner });
  // Event-buffered centre: played cards fly in, the full trick flies to its winner.
  const { displayTrick, registerHandOrigin, originFor, flight } = useTrickDisplay({
    matchId: matchId ?? null,
    seat,
    scopeRef: tableRef,
    stateTrick: state.trick,
    posOf: relativePos4,
  });

  const myTurn = state.turn === seat && playable.size > 0;
  const others = useMemo(() => [0, 1, 2, 3].filter((s) => s !== seat), [seat]);

  // A "deal" is any refill from empty — covers rubber deals 2..N, not just the first.
  const prevCountRef = useRef(0);
  useEffect(() => {
    const count = state.hands[seat]?.length ?? 0;
    if (count > 0 && prevCountRef.current === 0) {
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
    prevCountRef.current = count;
  }, [state, seat, dealIn]);

  function handlePlay(card: string, node: HTMLElement | null) {
    if (!playable.has(card)) return;
    registerHandOrigin(card, node);
    playCue("flip");
    onPlay(card);
  }

  return (
    <div ref={tableRef} style={{ position: "relative" }}>
      <Announcements banners={banners} />
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
              {/* Face-down fan, capped so 13 cards never hit the centre trick.
                  If redact left this hand OPEN (bridge dummy after the lead),
                  show the real cards — uncapped, tighter overlap. */}
              {(() => {
                const cards = state.hands[s] ?? [];
                const revealed = cards.some((c) => c !== "?");
                const shown = revealed ? cards : cards.slice(0, 8);
                return shown.map((card, i) => (
                  <PlayingCard
                    key={i}
                    card={revealed ? card : "?"}
                    size="sm"
                    style={{ marginLeft: i ? (revealed ? -44 : -40) : 0 }}
                  />
                ));
              })()}
            </div>
          </Seat>
        ))}

        <TableCenter>
          {displayTrick.length === 0 ? (
            <span className="text-sm text-ink-muted">{emptyTrickLabel}</span>
          ) : (
            displayTrick.map((p) => (
              <TrickCardSlot key={`${p.seat}-${p.card}`} play={p} originFor={originFor} flight={flight} />
            ))
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
