import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  UPPER_BONUS,
  UPPER_BONUS_TARGET,
  scoreFor,
  totalOf,
  upperTotal,
} from "@aso/game-core";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { Die } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameEvents } from "../useGameEvents";
import { Scene } from "../scene/SceneShell";
import { DecisionPrompt } from "../scene/DecisionPrompt";
import { FeltTable } from "../table/FeltTable";
import { GLDice, webglSupported } from "./GLDice";
import "./dice.css";

type Category =
  | "ones" | "twos" | "threes" | "fours" | "fives" | "sixes"
  | "threeKind" | "fourKind" | "fullHouse" | "smallStraight" | "largeStraight" | "chance" | "yahtzee";

interface DiceState {
  dice: number[];
  held: boolean[];
  rerollsLeft: number;
  scores: Array<Partial<Record<Category, number>>>;
  bonusYahtzee?: number[];
  turn: number;
  seats: number;
  rolledThisTurn: boolean;
}
type DiceAction = { type: "ROLL"; hold?: boolean[] } | { type: "SCORE"; category: Category };

const CATS: Category[] = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "chance", "yahtzee",
];
const NONE_HELD = [false, false, false, false, false];

export function DiceView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<DiceState, DiceAction>("DICE");
  const { state, legal, seat, phase, result, players } = m;
  const [hold, setHold] = useState<boolean[]>(NONE_HELD);
  const useGL = useMemo(() => webglSupported(), []);
  const [rollNonce, setRollNonce] = useState(0);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const canRoll = legal.some((a) => a.type === "ROLL");
  const canHold = myTurn && !!state && state.rolledThisTurn && state.rerollsLeft > 0;
  const scoreCats = new Set(
    legal.filter((a): a is Extract<DiceAction, { type: "SCORE" }> => a.type === "SCORE").map((a) => a.category),
  );
  // Без презахвърляния остава само записът → задължително решение в прозорец.
  // Докато има презахвърляния, ранният запис е по желание — с клик в таблицата.
  const mustScore = phase === "playing" && myTurn && !!state && state.rolledThisTurn && !canRoll && scoreCats.size > 0;
  const options = mustScore && state ? CATS.filter((c) => scoreCats.has(c)).map((c) => ({ cat: c, pts: scoreFor(state, seat, c) })) : [];
  const bestPts = options.reduce((b, o) => Math.max(b, o.pts), 0);

  // Reset holds when a new turn begins.
  useEffect(() => {
    if (state && !state.rolledThisTurn) setHold(NONE_HELD);
  }, [state]);

  // Trigger the dice roll animation whenever a roll lands (covers our rolls and
  // the opponent's, so spectators see the tumble too). rerollsLeft is part of
  // the key: a re-roll that lands on identical faces must still tumble.
  const prevDice = useRef("");
  useEffect(() => {
    if (!state) return;
    const key = `${state.dice.join(",")}|${state.rerollsLeft}|${state.rolledThisTurn}`;
    if (state.rolledThisTurn && key !== prevDice.current) setRollNonce((n) => n + 1);
    prevDice.current = key;
  }, [state]);

  // Opponent rolls get the same audio cue we give our own.
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number };
      if (ev.type === "ROLL" && ev.seat !== seat) playCue("flip");
    }
  });

  function roll() {
    playCue("flip");
    m.send({ type: "ROLL", hold });
  }
  const toggleHold = (i: number) => setHold((h) => h.map((v, j) => (j === i ? !v : v)));
  // My holds are the local toggles; the roller's holds come from state so
  // opponents and spectators can follow which dice were kept.
  const effHeld = myTurn ? hold : (state?.held ?? NONE_HELD);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <FeltTable crest="⚄" feltColor="#1f5a3e" feltDark="#0c2c1f">
        <div className="dice-layout">
          {/* Dice tray. */}
          <div className="dice-tray">
            {useGL ? (
              <GLDice
                values={state.dice}
                held={effHeld}
                canToggle={canHold}
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
                    className={cn("dice-slot", effHeld[i] && "dice-slot--held")}
                    onClick={() => canHold && toggleHold(i)}
                    aria-pressed={effHeld[i]}
                    data-die-index={i}
                    data-value={d}
                    data-held={effHeld[i] ? "true" : undefined}
                  >
                    {d > 0 ? <Die value={d} /> : <span className="dice-empty" />}
                    {effHeld[i] ? <span className="dice-held-tag">{t("dice.held")}</span> : null}
                  </button>
                ))}
              </div>
            )}
            {canRoll ? (
              <Button data-action="roll" onClick={roll} disabled={!myTurn} className="mt-3">
                {state.rolledThisTurn ? t("dice.reroll", { n: state.rerollsLeft }) : t("dice.roll")}
              </Button>
            ) : null}
            {canHold ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("dice.holdHint")} · {t("dice.earlyScoreHint")}
              </p>
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
                      {players.find((p) => p.seat === s)?.displayName ?? `#${s}`}
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
                      // При задължителен запис изборът е в прозореца — едно място.
                      const selectable = s === seat && myTurn && !mustScore && scoreCats.has(cat);
                      return (
                        <td
                          key={s}
                          className={cn("dice-score", selectable && "dice-score--pick", s === seat && "dice-me")}
                          onClick={() => selectable && m.send({ type: "SCORE", category: cat })}
                          data-category={cat}
                          data-seat={s}
                          data-filled={filled ? sc[cat] : undefined}
                          data-selectable={selectable ? "true" : undefined}
                        >
                          {filled ? (
                            sc[cat]
                          ) : selectable || (mustScore && s === seat && scoreCats.has(cat)) ? (
                            // Preview what this category would bank right now (вкл. правилото „Жокер“).
                            <span style={{ opacity: 0.55 }}>{scoreFor(state, seat, cat)}</span>
                          ) : (
                            ""
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Upper-section progress toward the +35 bonus. */}
                <tr>
                  <td>{t("dice.upper", { defaultValue: "Сбор 1–6" })}</td>
                  {state.scores.map((sc, s) => (
                    <td key={s} className={cn(s === seat && "dice-me")}>
                      <span style={{ opacity: 0.8 }}>
                        {upperTotal(sc)} / {UPPER_BONUS_TARGET}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{t("dice.bonus", { defaultValue: "Бонус (63+)" })}</td>
                  {state.scores.map((sc, s) => {
                    const earned = upperTotal(sc) >= UPPER_BONUS_TARGET;
                    return (
                      <td key={s} className={cn(s === seat && "dice-me")}>
                        {earned ? `+${UPPER_BONUS}` : <span style={{ opacity: 0.5 }}>0</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr className="dice-total">
                  <td>{t("dice.total")}</td>
                  {state.scores.map((sc, s) => (
                    <td key={s} className={cn(s === seat && "dice-me")} data-total-seat={s}>
                      {totalOf(sc, state.bonusYahtzee?.[s] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </FeltTable>
      ) : null}

      {/* Последното хвърляне е направено — остава записът в категория. */}
      <DecisionPrompt
        open={mustScore}
        promptKey={`score-${state?.scores[seat] ? Object.keys(state.scores[seat]!).length : 0}-${state?.dice.join("") ?? ""}`}
        title={t("dice.scoreTitle")}
        hint={
          state ? (
            <span className="dice-decide-hint">
              <span className="dice-faces">
                {state.dice.map((d, i) => (
                  <Die key={i} value={d} />
                ))}
              </span>
              <span>{t("dice.scoreHint")}</span>
            </span>
          ) : null
        }
        // Горе: на лаптоп тавата със заровете остава видима под прозореца.
        placement="top"
        testId="dice-score"
      >
        <div className="dice-pick" data-zone="score">
          {options.map((o) => (
            <button
              key={o.cat}
              type="button"
              data-action="score"
              data-category={o.cat}
              data-points={o.pts}
              className={cn("dice-pick__opt", o.pts === bestPts && bestPts > 0 && "is-best", o.pts === 0 && "is-zero")}
              onClick={() => m.send({ type: "SCORE", category: o.cat })}
            >
              <span>{t(`dice.cat.${o.cat}`)}</span>
              <b className="tnum">{o.pts}</b>
            </button>
          ))}
        </div>
      </DecisionPrompt>
    </Scene>
  );
}
