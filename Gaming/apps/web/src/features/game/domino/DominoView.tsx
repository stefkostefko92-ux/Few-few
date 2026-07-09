import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { useGameEvents } from "../useGameEvents";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
import { DominoTile } from "./DominoTile";
import "./domino.css";

interface DominoState {
  hands: string[][];
  boneyard: string[];
  line: string[];
  ends: [number, number] | null;
  turn: number;
  seats: number;
  matchScore: number[];
  roundNo: number;
  lastRound: { seat: number | null; reason: "out" | "blocked"; points: number } | null;
}
type DominoAction =
  | { type: "PLAY"; tile: string; side: "L" | "R" }
  | { type: "DRAW" }
  | { type: "PASS" };

/** How long the finished table stays on screen before the next deal renders. */
const ROUND_END_HOLD_MS = 2500;

const pipsOf = (tile: string): [number, number] =>
  tile.split("-").map(Number) as [number, number];

/** The pip value joining two adjacent line tiles (unique for distinct tiles). */
const joinPip = (x: [number, number], y: [number, number]): number =>
  x[0] === y[0] || x[0] === y[1] ? x[0] : x[1];

/**
 * Display orientation for the line: [leftPip, rightPip] per tile, so touching
 * halves always show matching pips (the engine stores tiles canonically as
 * "a-b" with a<=b, without orientation).
 */
function orientLine(line: string[]): Array<[number, number]> {
  const ps = line.map(pipsOf);
  if (ps.length === 0) return [];
  // The left end of the first tile is the pip NOT joining it to the second.
  let cur =
    ps.length === 1 ? ps[0]![0] : ps[0]![0] === joinPip(ps[0]!, ps[1]!) ? ps[0]![1] : ps[0]![0];
  return ps.map(([a, b]) => {
    if (a === cur) {
      cur = b;
      return [a, b] as [number, number];
    }
    cur = a;
    return [b, a] as [number, number];
  });
}

/**
 * Apply a PLAY event onto the pre-round snapshot so the frozen round-end table
 * shows the winning tile (the authoritative state has already been redealt).
 */
function withPlay(
  st: DominoState,
  ev: { seat: number; tile: string; side: "L" | "R" },
): DominoState {
  const line =
    st.line.length > 0 && ev.side === "L" ? [ev.tile, ...st.line] : [...st.line, ev.tile];
  const hands = st.hands.map((h, s) => {
    if (s !== ev.seat) return h;
    const i = h.indexOf(ev.tile);
    const j = i >= 0 ? i : h.indexOf("?");
    return j >= 0 ? [...h.slice(0, j), ...h.slice(j + 1)] : h;
  });
  return { ...st, line, hands, turn: -1 };
}

export function DominoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<DominoState, DominoAction>("DOMINO");
  const { state, legal, seat, phase, result, players } = m;

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "PASS" && typeof ev.seat === "number" && ev.seat !== seat) {
        return { text: t("fx.passBy", { name: nameFor(ev.seat) }), tone: "brass" };
      }
      if (ev.type === "WIN" && ev.reason === "blocked") {
        return { text: t("fx.blocked"), tone: "brass" };
      }
      if (ev.type === "WIN" && ev.reason === "out" && typeof ev.seat === "number") {
        return {
          text: t("fx.wentOut", { name: nameFor(ev.seat) }),
          tone: ev.seat === seat ? "win" : "loss",
        };
      }
      if (ev.type === "ROUND") {
        // No seat = blocked pip tie: a null round nobody scored.
        if (typeof ev.seat !== "number") return { text: t("fx.roundTie"), tone: "brass" };
        return {
          text: t("fx.roundPoints", { name: nameFor(ev.seat), points: ev.points }),
          tone: "brass",
        };
      }
      return null;
    },
  });
  const [side, setSide] = useState<"L" | "R">("R");

  // Round-end pause: GAME_EVENTS arrive before the redealt state, so on ROUND
  // we snapshot the finished table (plus the winning tile) and keep showing it
  // for a beat while the banners explain what happened.
  const [held, setHeld] = useState<DominoState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const holdTimer = useRef<number | null>(null);
  useGameEvents(m.matchId, (events) => {
    const evs = events as Array<Record<string, unknown>>;
    // Opponent tiles land audibly (own moves already cue on click).
    if (evs.some((e) => (e.type === "PLAY" || e.type === "DRAW") && e.seat !== seat)) {
      playCue("flip");
    }
    const round = evs.some((e) => e.type === "ROUND");
    const matchOver = evs.some((e) => e.type === "MATCH");
    if (!round || matchOver || !stateRef.current) return;
    const play = evs.find((e) => e.type === "PLAY");
    const snap = play
      ? withPlay(stateRef.current, play as { seat: number; tile: string; side: "L" | "R" })
      : stateRef.current;
    setHeld(snap);
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setHeld(null);
    }, ROUND_END_HOLD_MS);
  });
  useEffect(() => {
    setHeld(null);
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    };
  }, [m.matchId]);

  const frozen = held !== null;
  const view = held ?? state;

  const myTurn = !frozen && !!state && state.turn === seat && legal.length > 0;
  const drawAction = legal.find((a) => a.type === "DRAW");
  const passAction = legal.find((a) => a.type === "PASS");

  // For each tile in hand, which sides can it be played on?
  const playsByTile = useMemo(() => {
    const map = new Map<string, Set<"L" | "R">>();
    for (const a of legal) {
      if (a.type !== "PLAY") continue;
      const set = map.get(a.tile) ?? new Set();
      set.add(a.side);
      map.set(a.tile, set);
    }
    return map;
  }, [legal]);

  // Orientation of the played line ([left,right] pips per tile).
  const oriented = useMemo(() => orientLine(view?.line ?? []), [view?.line]);

  function playTile(tile: string) {
    const sides = playsByTile.get(tile);
    if (!sides) return;
    const chosen = sides.has(side) ? side : [...sides][0]!;
    playCue("flip");
    m.send({ type: "PLAY", tile, side: chosen });
  }

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {view ? (
        <FeltTable crest="🁫" feltColor="#1f5a3e" feltDark="#0c2c1f">
        <div className="dom-layout">
          {/* Opponents (tile counts). */}
          <div className="flex flex-wrap justify-center gap-3">
            {[0, 1, 2, 3]
              .filter((s) => s < view.seats && s !== seat)
              .map((s) => (
                <ScorePill
                  key={s}
                  label={nameFor(s)}
                  value={`${view.hands[s]?.length ?? 0} 🀫`}
                  highlight={view.turn === s}
                />
              ))}
          </div>

          {/* The played line, oriented so touching halves match (doubles sit
              crosswise, as on a real table). */}
          <div className="dom-line">
            {view.line.length === 0 ? (
              <span className="text-sm text-ink-muted">{t("domino.empty")}</span>
            ) : (
              // key by the tile itself (dominoes are unique) — an index key made a
              // left-end play shift every key and re-animate the whole line
              view.line.map((tile, i) => {
                const [l, r] = oriented[i] ?? pipsOf(tile);
                return (
                  <DominoTile
                    key={tile}
                    tile={tile}
                    flip={l !== pipsOf(tile)[0]}
                    vertical={l === r}
                  />
                );
              })
            )}
          </div>

          {/* Side selector + draw/pass (hidden while the round-end table is frozen). */}
          <div className="dom-controls">
            {view.ends && !frozen ? (
              <div className="dom-side-toggle" role="group" aria-label={t("domino.side")}>
                <button
                  type="button"
                  className={cn("dom-side-btn", side === "L" && "dom-side-btn--on")}
                  onClick={() => setSide("L")}
                >
                  ◀ {view.ends[0]}
                </button>
                <button
                  type="button"
                  className={cn("dom-side-btn", side === "R" && "dom-side-btn--on")}
                  onClick={() => setSide("R")}
                >
                  {view.ends[1]} ▶
                </button>
              </div>
            ) : null}
            {drawAction && !frozen ? (
              <Button variant="felt" disabled={!myTurn} onClick={() => { playCue("flip"); m.send(drawAction); }}>
                {t("domino.draw")} ({view.boneyard.length})
              </Button>
            ) : null}
            {passAction && !frozen ? (
              <Button variant="ghost" disabled={!myTurn} onClick={() => m.send(passAction)}>
                {t("domino.pass")}
              </Button>
            ) : null}
          </div>

          {/* My hand. */}
          <div className="dom-hand">
            {(view.hands[seat] ?? []).map((tile) => (
              <DominoTile
                key={tile}
                tile={tile}
                vertical
                playable={myTurn && playsByTile.has(tile)}
                onClick={myTurn && playsByTile.has(tile) ? () => playTile(tile) : undefined}
              />
            ))}
          </div>
          <ScorePill
            label={user?.displayName ?? t("game.you")}
            value={myTurn ? t("game.yourTurn") : ""}
            highlight={myTurn}
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-ink-muted">
              {t("domino.round")} {view.roundNo ?? 1} · {t("domino.target")} 100 ·{" "}
              {t("domino.boneyard")}: {view.boneyard.length}
            </span>
            {(view.matchScore ?? []).map((pts, s) => (
              <span
                key={s}
                className="rounded-full border border-brass-400/25 bg-felt-900/60 px-2.5 py-1"
                style={{ color: s === seat ? "var(--brass-100)" : "var(--ink-300)" }}
              >
                {nameFor(s)}: {pts}
              </span>
            ))}
          </div>
          {view.lastRound ? (
            <p className="mt-1 text-center text-xs text-ink-muted">
              {t("domino.lastRound")}:{" "}
              {view.lastRound.seat === null
                ? t("domino.tie")
                : `${nameFor(view.lastRound.seat)} +${view.lastRound.points}`}{" "}
              ({t(`domino.${view.lastRound.reason}`)})
            </p>
          ) : null}
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
