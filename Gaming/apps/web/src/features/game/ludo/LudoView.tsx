import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { BoardFrame, Die } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene } from "../scene/SceneShell";
import { CENTER, HOME, N, SEAT_COLORS, TRACK, houseSeat, tokenCoord } from "./board";
import type { LudoScene, LudoToken } from "./ludoScene";
import "./ludo.css";

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

interface LudoState {
  progress: number[][]; // [seat][token]: -1 base .. 44 finished
  turn: number;
  seats: number;
  die: number | null; // stays set on a dead roll so everyone sees what fell
  rolledSix: boolean;
  attempts: number; // rolls taken this turn ("three throws for a six")
}
type LudoAction = { type: "ROLL" } | { type: "MOVE"; token: number } | { type: "PASS" };

const key = (c: number, r: number) => `${c},${r}`;

/** Absolute main-loop cells that are safe from capture (starts + star squares),
 *  mirroring the engine's SAFE_CELLS. Two own tokens on one cell = a blockade. */
const SAFE_ABS = [0, 10, 20, 30, 8, 18, 28, 38] as const;

/** Cells that belong to the playable track / home columns (everything else is filler). */
function buildCellTypes(): Map<string, { kind: "track" | "home" | "center"; seat?: number }> {
  const map = new Map<string, { kind: "track" | "home" | "center"; seat?: number }>();
  for (const [c, r] of TRACK) map.set(key(c, r), { kind: "track" });
  for (const s of [0, 1, 2, 3]) for (const [c, r] of HOME[s]!) map.set(key(c, r), { kind: "home", seat: s });
  map.set(key(CENTER[0], CENTER[1]), { kind: "center" });
  return map;
}

export function LudoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<LudoState, LudoAction>("LUDO");
  const { state, legal, seat, phase, result, players } = m;

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "CAPTURE") {
        if (ev.seat === seat) return { text: t("fx.capture"), tone: "win" };
        if (ev.victim === seat) return { text: t("fx.captured"), tone: "loss" };
        return { text: t("fx.capture"), tone: "brass" };
      }
      if (ev.type === "ROLL" && ev.die === 6) return { text: t("fx.six"), tone: "brass" };
      // A roll with no legal move: the die stays on the board, and the banner
      // says whether the turn is skipped or a re-throw was granted.
      if (ev.type === "NO_MOVE") {
        if (ev.seat !== seat) {
          return {
            text: t("ludo.noMoveOther", { name: nameFor(ev.seat as number), defaultValue: "{{name}} няма ход" }),
            tone: "brass",
          };
        }
        return ev.retry
          ? { text: t("ludo.noMoveRetry", { defaultValue: "Няма ход — хвърли отново" }), tone: "brass" }
          : { text: t("ludo.noMove", { defaultValue: "Няма ход — пропускаш" }), tone: "brass" };
      }
      return null;
    },
  });

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const rollAction = legal.find((a) => a.type === "ROLL");
  const passAction = legal.find((a) => a.type === "PASS");
  const movable = new Set(
    legal.filter((a): a is Extract<LudoAction, { type: "MOVE" }> => a.type === "MOVE").map((a) => a.token),
  );

  const cellTypes = useMemo(buildCellTypes, []);
  const safeCells = useMemo(() => new Set(SAFE_ABS.map((a) => key(TRACK[a]![0], TRACK[a]![1]))), []);

  // Map every token onto a board cell so we can render pawns (and stack offsets).
  const pawns = useMemo(() => {
    if (!state) return new Map<string, Array<{ seat: number; token: number; movable: boolean }>>();
    const at = new Map<string, Array<{ seat: number; token: number; movable: boolean }>>();
    for (let s = 0; s < state.seats; s++) {
      for (let tk = 0; tk < 4; tk++) {
        const [c, r] = tokenCoord(s, state.progress[s]![tk]!, tk);
        const k = key(c, r);
        const arr = at.get(k) ?? [];
        arr.push({ seat: s, token: tk, movable: s === seat && myTurn && movable.has(tk) });
        at.set(k, arr);
      }
    }
    return at;
  }, [state, seat, myTurn, movable]);

  // The 2D fallback die tumbles briefly whenever a new roll lands (keyed on
  // attempts + turn so a re-throw of the same face still animates).
  const [dieRolling, setDieRolling] = useState(false);
  const prevRoll = useRef("");
  useEffect(() => {
    if (!state) return;
    const rollKey = state.die === null ? "" : `${state.die}|${state.attempts ?? 0}|${state.turn}`;
    const changed = rollKey !== "" && rollKey !== prevRoll.current;
    prevRoll.current = rollKey;
    if (!changed) return;
    setDieRolling(true);
    const timer = setTimeout(() => setDieRolling(false), 600);
    return () => clearTimeout(timer);
  }, [state]);

  function moveToken(token: number) {
    if (!movable.has(token)) return;
    playCue("flip");
    m.send({ type: "MOVE", token });
  }

  /* ── 3D scene (hybrid; the 2D grid is the fallback) ─────────────────── */
  const useGL = useMemo(webglSupported, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LudoScene | null>(null);
  const moveRef = useRef(moveToken);
  moveRef.current = moveToken;
  const viewRef = useRef({ state, seat, movable });
  viewRef.current = { state, seat, movable };

  // Canvas mounts only once state arrives — re-run the GL init on that flip.
  const glReady = !!state;
  useEffect(() => {
    if (!useGL || !glReady) return;
    let scene: LudoScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(300, wrap.clientWidth);
    void import("./ludoScene")
      .then(({ LudoScene }) => {
        if (cancelled) return;
        scene = new LudoScene(canvas, width());
        sceneRef.current = scene;
        const v = viewRef.current;
        if (v.state) scene.setState(v.state.progress, v.state.seats, v.seat, v.movable, v.state.die);
        ro = new ResizeObserver(() => scene?.resize(width()));
        ro.observe(wrap);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ro?.disconnect();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [useGL, glReady]);

  useEffect(() => {
    if (sceneRef.current && state) {
      sceneRef.current.setState(state.progress, state.seats, seat, movable, state.die);
    }
  }, [state, seat, movable]);

  function onCanvasClick(e: React.PointerEvent) {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const hit: LudoToken | null = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
    if (hit && hit.seat === seat) moveRef.current(hit.token);
  }

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <div className="flex flex-col items-center gap-4">
          {/* Player legend. */}
          <div className="flex flex-wrap justify-center gap-3">
            {Array.from({ length: state.seats }).map((_, s) => (
              <span key={s} className={cn("ludo-legend", s === state.turn && "ludo-legend--active")}>
                <span className="ludo-dot" style={{ background: SEAT_COLORS[s] }} />
                {nameFor(s)}
                {s === seat ? ` (${t("game.you")})` : ""}
              </span>
            ))}
          </div>

          {useGL ? (
            <div
              ref={wrapRef}
              style={{
                width: "min(90vw, 74vh, 800px)",
                borderRadius: 16,
                overflow: "hidden",
                lineHeight: 0,
                boxShadow: "0 16px 40px -16px rgba(0,0,0,.7)",
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerUp={onCanvasClick}
                style={{ width: "100%", height: "auto", display: "block", cursor: myTurn ? "pointer" : "default" }}
              />
            </div>
          ) : (
          <BoardFrame>
            <div className="ludo-grid" style={{ width: "min(90vw, 74vh, 760px)" }}>
              {Array.from({ length: N * N }).map((_, i) => {
                const c = i % N;
                const r = Math.floor(i / N);
                const k = key(c, r);
                const type = cellTypes.get(k);
                const house = houseSeat(c, r);
                const here = pawns.get(k) ?? [];
                const isSafe = safeCells.has(k);
                // A blockade: two or more tokens of the same seat share this cell.
                const counts = new Map<number, number>();
                for (const p of here) counts.set(p.seat, (counts.get(p.seat) ?? 0) + 1);
                const blockade = [...counts.values()].some((n) => n >= 2);
                return (
                  <div
                    key={k}
                    className={cn(
                      "ludo-cell",
                      type?.kind === "track" && "ludo-cell--track",
                      type?.kind === "home" && "ludo-cell--home",
                      type?.kind === "center" && "ludo-cell--center",
                    )}
                    title={isSafe ? t("ludo.safeSquare", "Защитено поле") : blockade ? t("ludo.blockade", "Блокада") : undefined}
                    style={{
                      ...(type?.kind === "home" && type.seat !== undefined
                        ? { background: tint(SEAT_COLORS[type.seat]!) }
                        : {}),
                      ...(house !== null && !type ? { background: tint(SEAT_COLORS[house]!) } : {}),
                      // A blockade gets a bright ring so it reads as impassable.
                      ...(blockade ? { boxShadow: "inset 0 0 0 2px #ffd54a, 0 0 6px 1px rgba(255,213,74,.55)" } : {}),
                    }}
                  >
                    {type?.kind === "center" ? <span className="ludo-goal">★</span> : null}
                    {isSafe ? (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          fontSize: "0.85em",
                          color: "rgba(255,255,255,.4)",
                          pointerEvents: "none",
                        }}
                      >
                        ✦
                      </span>
                    ) : null}
                    {here.map((p, idx) => (
                      <button
                        key={`${p.seat}-${p.token}`}
                        type="button"
                        disabled={!p.movable}
                        onClick={() => p.seat === seat && moveToken(p.token)}
                        aria-label={t("a11y.token", { seat: p.seat, token: p.token })}
                        className={cn("ludo-pawn", p.movable && "ludo-pawn--movable")}
                        style={{
                          background: SEAT_COLORS[p.seat],
                          // fan-stack multiple pawns on one cell
                          transform: here.length > 1 ? `translate(${(idx % 2) * 6 - 3}px, ${Math.floor(idx / 2) * 6 - 3}px)` : undefined,
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </BoardFrame>
          )}

          <div className="ludo-controls">
            {state.die && !useGL ? <Die value={state.die} rolling={dieRolling} /> : null}
            {rollAction ? (
              <Button onClick={() => { playCue("flip"); m.send(rollAction); }}>{t("backgammon.roll")}</Button>
            ) : null}
            {passAction ? (
              <Button variant="ghost" onClick={() => m.send(passAction)}>{t("backgammon.pass")}</Button>
            ) : null}
            {myTurn && movable.size > 0 ? <span className="text-sm text-ink-muted">{t("ludo.pickToken")}</span> : null}
          </div>
        </div>
      ) : null}
    </Scene>
  );
}

/** Translucent tint of a seat color for the house/home areas. */
function tint(hex: string): string {
  return `${hex}33`;
}
