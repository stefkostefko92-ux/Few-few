import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { Die } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene } from "../scene/SceneShell";
import { GLDice, webglSupported } from "./GLDice";
import "./dice.css";

type Category =
  | "ones" | "twos" | "threes" | "fours" | "fives" | "sixes"
  | "threeKind" | "fourKind" | "fullHouse" | "smallStraight" | "largeStraight" | "chance" | "yahtzee";

interface DiceState {
  dice: number[];
  rerollsLeft: number;
  scores: Array<Partial<Record<Category, number>>>;
  turn: number;
  seats: number;
  rolledThisTurn: boolean;
}
type DiceAction = { type: "ROLL"; hold?: boolean[] } | { type: "SCORE"; category: Category };

const CATS: Category[] = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "chance", "yahtzee",
];

export function DiceView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<DiceState, DiceAction>("DICE");
  const { state, legal, seat, phase, result, players } = m;
  const [hold, setHold] = useState<boolean[]>([false, false, false, false, false]);
  const useGL = useMemo(() => webglSupported(), []);
  const [rollNonce, setRollNonce] = useState(0);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const canRoll = legal.some((a) => a.type === "ROLL");
  const scoreCats = new Set(
    legal.filter((a): a is Extract<DiceAction, { type: "SCORE" }> => a.type === "SCORE").map((a) => a.category),
  );

  // Reset holds when a new turn begins.
  useEffect(() => {
    if (state && !state.rolledThisTurn) setHold([false, false, false, false, false]);
  }, [state]);

  // Trigger the dice roll animation whenever the dice change to a rolled state
  // (covers our rolls and the opponent's, so spectators see the tumble too).
  const prevDice = useRef("");
  useEffect(() => {
    if (!state) return;
    const key = state.dice.join(",");
    if (state.rolledThisTurn && key !== prevDice.current) setRollNonce((n) => n + 1);
    prevDice.current = key;
  }, [state]);

  function roll() {
    playCue("flip");
    m.send({ type: "ROLL", hold });
  }
  const toggleHold = (i: number) => setHold((h) => h.map((v, j) => (j === i ? !v : v)));
  const effHeld = myTurn ? hold : [false, false, false, false, false];
  const total = (s: Partial<Record<Category, number>>) => CATS.reduce((a, c) => a + (s[c] ?? 0), 0);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="dice-layout">
          {/* Dice tray. */}
          <div className="dice-tray">
            {useGL ? (
              <GLDice
                values={state.dice}
                held={effHeld}
                canToggle={myTurn && state.rolledThisTurn}
                onToggle={toggleHold}
                rollNonce={rollNonce}
                heldLabel={t("dice.held")}
              />
            ) : (
              <div className="dice-row">
                {state.dice.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    className={cn("dice-slot", hold[i] && "dice-slot--held")}
                    onClick={() => myTurn && state.rolledThisTurn && toggleHold(i)}
                    aria-pressed={hold[i]}
                  >
                    {d > 0 ? <Die value={d} /> : <span className="dice-empty" />}
                    {hold[i] ? <span className="dice-held-tag">{t("dice.held")}</span> : null}
                  </button>
                ))}
              </div>
            )}
            {canRoll ? (
              <Button onClick={roll} disabled={!myTurn} className="mt-3">
                {state.rolledThisTurn ? t("dice.reroll", { n: state.rerollsLeft }) : t("dice.roll")}
              </Button>
            ) : null}
            {myTurn && state.rolledThisTurn ? (
              <p className="mt-2 text-xs text-ink-muted">{t("dice.holdHint")}</p>
            ) : null}
          </div>

          {/* Scoreboard. */}
          <div className="dice-card">
            <table className="dice-table">
              <thead>
                <tr>
                  <th>{t("dice.category")}</th>
                  {state.scores.map((_, s) => (
                    <th key={s} className={cn(s === seat && "dice-me")}>
                      {players.find((p) => p.seat === s)?.displayName?.slice(0, 6) ?? `#${s}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATS.map((cat) => (
                  <tr key={cat}>
                    <td>{t(`dice.cat.${cat}`)}</td>
                    {state.scores.map((sc, s) => {
                      const filled = sc[cat] !== undefined;
                      const selectable = s === seat && myTurn && scoreCats.has(cat);
                      return (
                        <td
                          key={s}
                          className={cn("dice-score", selectable && "dice-score--pick", s === seat && "dice-me")}
                          onClick={() => selectable && m.send({ type: "SCORE", category: cat })}
                        >
                          {filled ? sc[cat] : selectable ? "—" : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="dice-total">
                  <td>{t("dice.total")}</td>
                  {state.scores.map((sc, s) => (
                    <td key={s} className={cn(s === seat && "dice-me")}>{total(sc)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
