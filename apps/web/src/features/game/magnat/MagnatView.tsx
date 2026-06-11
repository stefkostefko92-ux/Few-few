import { useEffect, useMemo, useRef } from "react";
import { BOARD, GROUP_COLORS, isOwnable, type MagnatAction, type MagnatState } from "@aso/shared";
import type { MagnatScene } from "./magnatScene";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { useMatch } from "../useMatch";
import { Scene } from "../scene/SceneShell";
import "./magnat.css";

const PLAYER_COLORS = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0", "#e07a1f"];

/** WebGL availability — МАГНАТ's board needs it; otherwise we degrade to the HUD. */
function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function MagnatView({ title }: { title: string }) {
  const m = useMatch<MagnatState, MagnatAction>("MAGNAT");
  const { state, seat, phase, result, legal, players } = m;
  const felt = useEquippedCosmetic("MAGNAT", "ESTATE");
  const useGL = useMemo(() => webglSupported(), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MagnatScene | null>(null);
  const stateRef = useRef<MagnatState | null>(state);
  stateRef.current = state;
  const feltRef = useRef(felt);
  feltRef.current = felt;

  // The canvas exists only once the match state arrives (it renders behind
  // `{state ? ...}`), so the GL effect must re-run on that flip — otherwise it
  // bails on the missing canvas at mount and the board stays blank forever.
  const glReady = !!state;
  useEffect(() => {
    if (!useGL || !glReady) return;
    let scene: MagnatScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(280, wrap.clientWidth);

    void import("./magnatScene")
      .then(({ MagnatScene }) => {
        if (cancelled) return;
        scene = new MagnatScene(canvas, width());
        sceneRef.current = scene;
        const f = feltRef.current?.colors;
        if (f) scene.setFelt(f.a, f.b);
        if (stateRef.current) scene.setState(stateRef.current);
        ro = new ResizeObserver(() => scene?.resize(width()));
        ro.observe(wrap);
      })
      .catch(() => {
        /* WebGL init failed despite the support check — HUD still works. */
      });
    return () => {
      cancelled = true;
      ro?.disconnect();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [useGL, glReady]);

  useEffect(() => {
    if (sceneRef.current && state) sceneRef.current.setState(state);
  }, [state]);

  useEffect(() => {
    const f = felt?.colors;
    if (sceneRef.current && f) sceneRef.current.setFelt(f.a, f.b);
  }, [felt]);

  const has = (type: MagnatAction["type"]) => legal.some((a) => a.type === type);
  const tileHas = (type: "BUILD" | "MORTGAGE" | "UNMORTGAGE" | "SELL", t: number) =>
    legal.some((a) => a.type === type && "tile" in a && a.tile === t);
  const send = (a: MagnatAction) => {
    playCue("flip");
    m.send(a);
  };

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const pending = state?.pendingBuy ?? null;
  const myProps = state ? BOARD.map((_, i) => i).filter((i) => isOwnable(i) && state.owner[i] === seat) : [];

  const name = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `Играч ${s + 1}`;

  const boardSummary =
    state &&
    `Дъска Магнат. ${state.cash
      .map((c, s) => `${name(s)}: ${state.bankrupt[s] ? "банкрут" : `${c} в брой`}, на поле ${BOARD[state.pos[s]!]!.name}`)
      .join("; ")}.`;
  const liveLine = state ? (state.done ? "Край на играта." : `Ред: ${name(state.turn)}. ${state.log.at(-1) ?? ""}`) : "";

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="mag-layout">
          <div ref={wrapRef} className="mag-board">
            {useGL ? (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={boardSummary ?? "Дъска Магнат"}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <p className="mag-nogl">
                3D дъската изисква WebGL, който не е наличен в този браузър. Можеш да играеш чрез таблото вдясно.
              </p>
            )}
          </div>

          <aside className="mag-side">
            <p className="sr-only" aria-live="polite">
              {liveLine}
            </p>
            {/* players */}
            <div className="mag-players">
              {state.cash.map((cash, s) => (
                <div key={s} className={`mag-player ${s === state.turn ? "is-turn" : ""} ${state.bankrupt[s] ? "is-out" : ""}`}>
                  <span className="mag-dot" style={{ background: PLAYER_COLORS[s % PLAYER_COLORS.length] }} />
                  <span className="mag-name">
                    {name(s)}
                    {s === seat ? " (ти)" : ""}
                  </span>
                  <span className="mag-cash">{state.bankrupt[s] ? "банкрут" : `${cash}`}</span>
                </div>
              ))}
            </div>

            {/* actions */}
            <div className="mag-actions">
              {!myTurn ? (
                <p className="mag-hint">{state.done ? "Край на играта" : `Ред е на ${name(state.turn)}…`}</p>
              ) : state.phase === "ROLL" ? (
                <div className="mag-btns">
                  {has("JAIL_CARD") ? <Button onClick={() => send({ type: "JAIL_CARD" })}>Карта за затвора</Button> : null}
                  {has("JAIL_PAY") ? <Button variant="felt" onClick={() => send({ type: "JAIL_PAY" })}>Плати гаранция (50)</Button> : null}
                  {has("ROLL") ? <Button onClick={() => send({ type: "ROLL" })}>Хвърли заровете</Button> : null}
                </div>
              ) : state.phase === "BUY" && pending !== null ? (
                <div className="mag-btns">
                  {has("BUY") ? (
                    <Button onClick={() => send({ type: "BUY" })}>
                      Купи {BOARD[pending]!.name} ({BOARD[pending]!.price})
                    </Button>
                  ) : null}
                  <Button variant="felt" onClick={() => send({ type: "DECLINE" })}>Откажи</Button>
                </div>
              ) : state.phase === "MANAGE" ? (
                <div className="mag-btns">
                  <Button onClick={() => send({ type: "END" })}>Приключи хода</Button>
                </div>
              ) : null}
              {state.dice ? <p className="mag-dice">🎲 {state.dice[0]} + {state.dice[1]}</p> : null}
            </div>

            {/* my properties */}
            {myProps.length > 0 ? (
              <div className="mag-props">
                <h4>Моите имоти</h4>
                {myProps.map((i) => {
                  const tl = BOARD[i]!;
                  return (
                    <div key={i} className="mag-prop">
                      <span className="mag-prop-band" style={{ background: tl.type === "prop" ? GROUP_COLORS[tl.group] : "#888" }} />
                      <span className="mag-prop-name">
                        {tl.name}
                        {state.houses[i]! > 0 ? ` · ${state.houses[i] === 5 ? "хотел" : `${state.houses[i]}🏠`}` : ""}
                        {state.mortgaged[i] ? " · ипотека" : ""}
                      </span>
                      <span className="mag-prop-acts">
                        {tileHas("BUILD", i) ? <button type="button" onClick={() => send({ type: "BUILD", tile: i })}>+🏠</button> : null}
                        {tileHas("SELL", i) ? <button type="button" onClick={() => send({ type: "SELL", tile: i })}>−</button> : null}
                        {tileHas("MORTGAGE", i) ? <button type="button" onClick={() => send({ type: "MORTGAGE", tile: i })}>ипотека</button> : null}
                        {tileHas("UNMORTGAGE", i) ? <button type="button" onClick={() => send({ type: "UNMORTGAGE", tile: i })}>откупи</button> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* log */}
            {state.log.length > 0 ? (
              <div className="mag-log">
                {state.log.slice(-5).map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </Scene>
  );
}
