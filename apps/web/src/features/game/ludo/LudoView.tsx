import { useTranslation } from "react-i18next";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { Die } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene } from "../scene/SceneShell";
import "./ludo.css";

interface LudoState {
  progress: number[][]; // [seat][token]: -1 base .. 44 finished
  turn: number;
  seats: number;
  die: number | null;
  rolledSix: boolean;
}
type LudoAction = { type: "ROLL" } | { type: "MOVE"; token: number } | { type: "PASS" };

const SEAT_COLORS = ["#c2362f", "#4ea96b", "#d9b25f", "#5a8fc2"];
const MAIN = 40;
const FINISH = 44;

/** A 0..1 progress fraction for the track bar. */
function frac(p: number): number {
  if (p < 0) return 0;
  return Math.min(p / FINISH, 1);
}

export function LudoView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<LudoState, LudoAction>("LUDO");
  const { state, legal, seat, phase, result, players } = m;

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const rollAction = legal.find((a) => a.type === "ROLL");
  const passAction = legal.find((a) => a.type === "PASS");
  const movableTokens = new Set(
    legal.filter((a): a is Extract<LudoAction, { type: "MOVE" }> => a.type === "MOVE").map((a) => a.token),
  );

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;
  const tokenLabel = (p: number) =>
    p < 0 ? t("ludo.base") : p >= FINISH ? t("ludo.home") : p >= MAIN ? `🏠${p - MAIN + 1}` : `${p}`;

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="ludo-layout">
          {state.progress.map((tokens, s) => (
            <div key={s} className={cn("ludo-lane", s === state.turn && "ludo-lane--active")}>
              <div className="ludo-lane-head">
                <span className="ludo-dot" style={{ background: SEAT_COLORS[s % 4] }} />
                <span>{nameFor(s)}</span>
                {s === seat ? <span className="ludo-you">({t("game.you")})</span> : null}
              </div>
              <div className="ludo-tokens">
                {tokens.map((p, tk) => {
                  const canMove = s === seat && myTurn && movableTokens.has(tk);
                  return (
                    <button
                      key={tk}
                      type="button"
                      disabled={!canMove}
                      onClick={() => { playCue("flip"); m.send({ type: "MOVE", token: tk }); }}
                      className={cn("ludo-token", canMove && "ludo-token--movable", p >= FINISH && "ludo-token--home")}
                      style={{ ["--seat-color" as string]: SEAT_COLORS[s % 4] }}
                    >
                      <span className="ludo-track">
                        <span className="ludo-fill" style={{ width: `${frac(p) * 100}%`, background: SEAT_COLORS[s % 4] }} />
                        <span className="ludo-pawn" style={{ left: `calc(${frac(p) * 100}% - 8px)`, background: SEAT_COLORS[s % 4] }} />
                      </span>
                      <span className="ludo-token-label">{tokenLabel(p)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="ludo-controls">
            {state.die ? <Die value={state.die} /> : null}
            {rollAction ? <Button onClick={() => { playCue("flip"); m.send(rollAction); }}>{t("backgammon.roll")}</Button> : null}
            {passAction ? <Button variant="ghost" onClick={() => m.send(passAction)}>{t("backgammon.pass")}</Button> : null}
            {myTurn && movableTokens.size > 0 ? <span className="text-sm text-ink-muted">{t("ludo.pickToken")}</span> : null}
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
