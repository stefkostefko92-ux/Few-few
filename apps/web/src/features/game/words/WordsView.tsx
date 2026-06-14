import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FeltTable } from "../table/FeltTable";
import "./words.css";

interface WordsState {
  used: string[];
  lastLetter: string;
  lives: number[];
  turn: number;
  seats: number;
}
type WordsAction = { type: "PLAY"; word: string } | { type: "PASS" };

export function WordsView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<WordsState, WordsAction>("WORDS");
  const { state, legal, seat, phase, result, players } = m;

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const words = useMemo(
    () => legal.filter((a): a is Extract<WordsAction, { type: "PLAY" }> => a.type === "PLAY").map((a) => a.word),
    [legal],
  );
  const passAction = legal.find((a) => a.type === "PASS");

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <FeltTable crest="Я" feltColor="#5a3d22" feltDark="#241509">
        <div className="words-layout">
          {/* Players + lives. */}
          <div className="words-players">
            {state.lives.map((lives, s) => (
              <div key={s} className={cn("words-player", s === state.turn && "words-player--active")}>
                <span>{players.find((p) => p.seat === s)?.displayName ?? `#${s}`}</span>
                <span className="words-lives">{"♥".repeat(Math.max(0, lives))}</span>
              </div>
            ))}
          </div>

          {/* The chain — a typographic atelier (§4.18). */}
          <div className="words-chain">
            {state.used.map((w, i) => (
              <span key={i} className={cn("words-tile", i === state.used.length - 1 && "words-tile--last")}>
                {w}
              </span>
            ))}
          </div>

          <div className="words-prompt">
            {t("words.nextLetter")}:{" "}
            <span className="words-letter">{(state.lastLetter || "—").toUpperCase()}</span>
          </div>

          {/* My options. */}
          {myTurn ? (
            words.length > 0 ? (
              <div className="words-options">
                {words.slice(0, 24).map((w) => (
                  <button key={w} type="button" className="words-opt" onClick={() => { playCue("flip"); m.send({ type: "PLAY", word: w }); }}>
                    {w}
                  </button>
                ))}
              </div>
            ) : passAction ? (
              <Button variant="ghost" onClick={() => m.send(passAction)}>{t("words.pass")}</Button>
            ) : null
          ) : (
            <ScorePill label={t("game.opponentTurn")} value="" />
          )}

          <div className="mt-2">
            <ScorePill label={user?.displayName ?? t("game.you")} value={"♥".repeat(Math.max(0, state.lives[seat] ?? 0))} highlight={myTurn} />
          </div>
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
