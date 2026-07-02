import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button, cn } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { useMatch } from "../useMatch";
import { useGameEvents } from "../useGameEvents";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
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
type WrongReason = "dict" | "letter" | "used";

const STARTING_LIVES = 3;

export function WordsView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<WordsState, WordsAction>("WORDS");
  const { state, legal, seat, phase, result, players } = m;

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const letter = (state?.lastLetter ?? "").toUpperCase();

  // The player TYPES the word — answers are never served (§4.18). The server
  // is the only validator; a wrong word costs a life (WRONG event → shake).
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nameOf = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;
  const reasonText = (reason: WrongReason, w: string): string => {
    if (reason === "dict") return t("words.notInDict", { word: w });
    if (reason === "used") return t("words.alreadyUsed", { word: w });
    return t("words.wrongLetter", { letter });
  };

  const { banners, announce } = useGameAnnouncements({ matchId: m.matchId });
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; word?: string; reason?: WrongReason };
      if (ev.type === "PLAY" && ev.seat !== seat) {
        playCue("flip"); // every client hears the chain grow, not just the actor
      } else if (ev.type === "PASS" && typeof ev.seat === "number") {
        announce(t("words.passBanner", { name: nameOf(ev.seat) }), "brass", ev.seat === seat ? undefined : "alert");
      } else if (ev.type === "RESEED" && typeof ev.word === "string") {
        announce(t("words.reseed", { word: ev.word }), "brass");
      } else if (ev.type === "WRONG" && typeof ev.seat === "number") {
        if (ev.seat === seat) {
          setError(reasonText(ev.reason ?? "dict", ev.word ?? ""));
          setShakeKey((k) => k + 1);
          playCue("error");
        } else {
          announce(t("words.wrongBanner", { name: nameOf(ev.seat) }), "brass", "alert");
        }
      }
    }
  });

  // A fresh turn starts clean; keep the error visible while retrying.
  useEffect(() => {
    if (!myTurn) setError(null);
  }, [myTurn]);
  // Refocus after the shake wrapper remounts (retry stays frictionless).
  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
  }, [myTurn, shakeKey]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const w = word.trim().toLowerCase();
    if (!w || !myTurn) return;
    setError(null);
    playCue("flip");
    m.send({ type: "PLAY", word: w });
    setWord("");
  }

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <FeltTable crest="Я" feltColor="#5a3d22" feltDark="#241509">
        <div className="words-layout">
          {/* Players + lives. */}
          <div className="words-players">
            {state.lives.map((lives, s) => {
              const out = lives <= 0;
              return (
                <div
                  key={s}
                  className={cn(
                    "words-player",
                    s === state.turn && !out && "words-player--active",
                    out && "words-player--out",
                  )}
                >
                  <span>{nameOf(s)}</span>
                  {out ? (
                    <span className="words-out">{t("words.out")}</span>
                  ) : (
                    /* keyed by count: losing a life replays the shake */
                    <span key={lives} className={cn("words-lives", lives < STARTING_LIVES && "aso-shake")}>
                      {"♥".repeat(Math.max(0, lives))}
                    </span>
                  )}
                </div>
              );
            })}
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
            <span className="words-letter">{letter || "—"}</span>
          </div>

          {/* My move: type the word yourself. */}
          {myTurn ? (
            <form className="words-form" onSubmit={submit}>
              <div key={shakeKey} className={cn("words-input-wrap", shakeKey > 0 && "aso-shake")}>
                <input
                  ref={inputRef}
                  className={cn("words-input", error && "words-input--error")}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder={t("words.inputPlaceholder", { letter })}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={32}
                  aria-invalid={error ? true : undefined}
                />
                <Button type="submit" disabled={!word.trim()}>{t("words.submit")}</Button>
              </div>
              {error ? (
                <p className="words-error" aria-live="polite">{error}</p>
              ) : null}
              <div className="words-pass">
                <Button type="button" variant="ghost" onClick={() => m.send({ type: "PASS" })}>
                  {t("words.pass")}
                </Button>
                <span className="words-pass-hint">{t("words.passHint")}</span>
              </div>
            </form>
          ) : (
            <ScorePill label={t("game.opponentTurn")} value="" />
          )}

          <div className="mt-2">
            <ScorePill
              label={user?.displayName ?? t("game.you")}
              value={"♥".repeat(Math.max(0, state.lives[seat] ?? 0)) || t("words.out")}
              highlight={myTurn}
            />
          </div>
        </div>
        </FeltTable>
      ) : null}
    </Scene>
  );
}
