import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../ui";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { type SuitChar } from "../cards/suits";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { GameOverPanel } from "../scene/SceneShell";
import "../cards/cards.css";

interface Play {
  seat: number;
  card: string;
}
interface BeloteState {
  phase: "BID" | "PLAY";
  hands: string[][];
  trump: string | null;
  declarer: number | null;
  turn: number;
  trick: Play[];
  teamPoints: [number, number];
}
type BeloteAction =
  | { type: "PASS" }
  | { type: "CALL"; suit: string }
  | { type: "PLAY"; card: string };

const SUITS = ["S", "H", "D", "C"] as const;
const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** Map an absolute seat to a table position relative to my seat. */
function relativePos(seat: number, mySeat: number): SeatPos {
  const d = (seat - mySeat + 4) % 4;
  return d === 0 ? "bottom" : d === 1 ? "left" : d === 2 ? "top" : "right";
}

export function BeloteView({ title }: { title: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BeloteState, BeloteAction>("BELOTE");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn, playCard } = useCardAnimations(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const playMap = useMemo(
    () =>
      new Map(
        legal.filter((a) => a.type === "PLAY").map((a) => [(a as { card: string }).card, a]),
      ),
    [legal],
  );
  const callBySuit = (suit: string) =>
    legal.find((a): a is Extract<BeloteAction, { type: "CALL" }> => a.type === "CALL" && a.suit === suit);
  const passAction = legal.find((a) => a.type === "PASS");

  // Deal animation once the player's hand first appears.
  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  if (!state) {
    return <SearchingOrOver title={title} phase={phase} seat={seat} result={result} />;
  }

  const myTeam = seat % 2;
  const seats = [0, 1, 2, 3];

  function onPlay(card: string, node: HTMLElement | null) {
    const action = playMap.get(card);
    if (!action) return;
    playCard(node);
    playCue("flip");
    m.send(action);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl text-brass-300">{title}</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {t("game.leave")}
        </Button>
      </div>

      <div ref={tableRef}>
        <FeltTable crest={state.trump ? SUIT_GLYPH[state.trump] : "A"}>
          {seats
            .filter((s) => s !== seat)
            .map((s) => {
              const pos = relativePos(s, seat);
              const count = state.hands[s]?.length ?? 0;
              return (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={<TeamDot team={s % 2} myTeam={myTeam} />}
                >
                  <div style={{ display: "flex" }}>
                    {Array.from({ length: count }).map((_, i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -24 : 0 }} />
                    ))}
                  </div>
                </Seat>
              );
            })}

          <TableCenter>
            {state.trick.length === 0 ? (
              <span className="text-sm text-ink-muted">
                {state.phase === "BID" ? t("belote.auction") : t("belote.emptyTrick")}
              </span>
            ) : (
              state.trick.map((p) => <PlayingCard key={p.seat} card={p.card} size="md" />)
            )}
          </TableCenter>

          <Seat
            pos="bottom"
            name={user?.displayName ?? t("game.you")}
            active={myTurn}
            badge={<TeamDot team={myTeam} myTeam={myTeam} />}
          >
            <div className="aso-myhand" style={{ display: "flex" }}>
              {(state.hands[seat] ?? []).map((card, i) => {
                const playable = myTurn && state.phase === "PLAY" && playMap.has(card);
                return (
                  <CardSlot key={`${card}-${i}`} index={i} card={card} playable={playable} onPlay={onPlay} />
                );
              })}
            </div>
          </Seat>

          {state.trump ? <TrumpIndicator suit={state.trump as SuitChar} label={t("belote.contract")} /> : null}
        </FeltTable>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <ScorePill label={t("belote.yourTeam")} value={state.teamPoints[myTeam] ?? 0} highlight />
        <ScorePill label={t("belote.theirTeam")} value={state.teamPoints[myTeam === 0 ? 1 : 0] ?? 0} />
      </div>

      {state.phase === "BID" && myTurn ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SUITS.map((suit) => {
            const call = callBySuit(suit);
            return (
              <button
                key={suit}
                type="button"
                disabled={!call}
                onClick={() => call && m.send(call)}
                className="aso-bid"
                style={{ color: suit === "H" || suit === "D" ? "var(--suit-red)" : "var(--ink-100)" }}
              >
                {SUIT_GLYPH[suit]}
              </button>
            );
          })}
          {passAction ? (
            <Button variant="ghost" onClick={() => m.send(passAction)}>
              {t("belote.pass")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : null}
    </div>
  );
}

function CardSlot({
  index,
  card,
  playable,
  onPlay,
}: {
  index: number;
  card: string;
  playable: boolean;
  onPlay: (card: string, node: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ marginLeft: index ? -28 : 0 }}>
      <PlayingCard
        card={card}
        size="md"
        dimmed={!playable}
        onClick={playable ? () => onPlay(card, ref.current) : undefined}
      />
    </div>
  );
}

function TeamDot({ team, myTeam }: { team: number; myTeam: number }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: team === myTeam ? "var(--win)" : "var(--loss)",
        display: "inline-block",
      }}
    />
  );
}


function ScorePill({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-full border px-4 py-1.5 text-sm"
      style={{
        borderColor: highlight ? "var(--brass-300)" : "rgba(217,178,95,.2)",
        background: "rgba(11,14,13,.5)",
        color: highlight ? "var(--brass-100)" : "var(--ink-300)",
      }}
    >
      {label}: <span className="tnum font-bold">{value}</span>
    </div>
  );
}

function SearchingOrOver({
  title,
  phase,
  seat,
  result,
}: {
  title: string;
  phase: string;
  seat: number;
  result: ReturnType<typeof useMatch>["result"];
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="mb-6 text-3xl text-brass-300">{title}</h1>
      {phase === "over" && result ? (
        <GameOverPanel seat={seat} result={result} />
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-brass-400/15 bg-felt-800/80 px-10 py-12">
          <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
          <p className="text-ink-300">{t("game.searching")}</p>
        </div>
      )}
    </div>
  );
}

