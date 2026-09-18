import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FourPlayerTrick } from "../trick/FourPlayerTrick";
import { PlayingCard } from "../cards/PlayingCard";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { type SuitChar } from "../cards/suits";
import "./bridge.css";

interface Play {
  seat: number;
  card: string;
}
type Strain = "C" | "D" | "H" | "S" | "NT";
interface BridgeState {
  phase: "AUCTION" | "PLAY";
  hands: string[][];
  trick: Play[];
  turn: number;
  trump: string | null;
  contractLevel: number;
  bidLevel: number;
  bidStrain: Strain | null;
  declarer: number | null;
  doubled: number;
  tricksWon: [number, number];
  matchPoints: [number, number];
  gamesWon: [number, number];
  vulnerable: [boolean, boolean];
  dealNo: number;
  lastDeal: { declarer: number; level: number; strain: Strain; made: boolean; tricks: number; declScore: number; defScore: number } | null;
}
type BridgeAction =
  | { type: "PASS" }
  | { type: "BID"; level: number; strain: Strain }
  | { type: "DOUBLE" }
  | { type: "REDOUBLE" }
  | { type: "PLAY"; card: string };

const STRAIN_GLYPH: Record<Strain, string> = { C: "♣", D: "♦", H: "♥", S: "♠", NT: "NT" };
const STRAINS: Strain[] = ["C", "D", "H", "S", "NT"];

export function BridgeView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<BridgeState, BridgeAction>("BRIDGE");
  const { state, legal, seat, phase, result, players } = m;

  const playable = useMemo(
    () =>
      new Map(
        legal.filter((a) => a.type === "PLAY").map((a) => [(a as { card: string }).card, a]),
      ),
    [legal],
  );
  const bidFor = (level: number, strain: Strain) =>
    legal.find(
      (a): a is Extract<BridgeAction, { type: "BID" }> =>
        a.type === "BID" && a.level === level && a.strain === strain,
    );
  const passAction = legal.find((a) => a.type === "PASS");

  const myTeam = seat % 2;
  const myTurn = !!state && state.turn === seat && legal.length > 0;

  // Dummy = declarer's partner. After the opening lead its hand is turned FACE-UP
  // for EVERYONE (engine redact reveals it to all seats) — a signature bridge
  // moment. We show that revealed hand to every viewer; only the declarer, on
  // the dummy's turn, can click a card to play it (the engine offers the dummy's
  // legal cards under the declarer's seat, so they arrive here in `playable`).
  const dummy = state && state.declarer !== null ? (state.declarer + 2) % 4 : null;
  const isDeclarer = !!state && state.declarer === seat;
  const dummyTurn = !!state && state.phase === "PLAY" && dummy !== null && state.turn === dummy;
  const dummyHand = dummy !== null && state ? state.hands[dummy] ?? [] : [];
  // Revealed once the opening lead is out (redact stops hiding it → no "?").
  const dummyRevealed = !!state && state.phase === "PLAY" && dummy !== null && (dummyHand[0] ?? "?") !== "?";
  const canPlayDummy = isDeclarer && dummyTurn;
  const dummyName = dummy !== null ? players.find((p) => p.seat === dummy)?.displayName ?? `#${dummy}` : "";

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <FourPlayerTrick
            state={state}
            seat={seat}
            playable={playable}
            matchId={m.matchId}
            toBanner={(ev) => {
              if (ev.type === "DOUBLE") return { text: t("belote.contra") + "!", tone: "loss" };
              if (ev.type === "REDOUBLE") return { text: t("belote.recontra") + "!", tone: "win" };
              if (ev.type === "CONTRACT" && typeof ev.level === "number")
                return { text: `${ev.level}${STRAIN_GLYPH[ev.strain as Strain]}`, tone: "brass" };
              if (ev.type === "RESULT")
                return { text: ev.made ? t("bridge.made") + "!" : t("bridge.defeated") + "!", tone: ev.made ? "win" : "loss" };
              return null;
            }}
            names={(s) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`}
            emptyTrickLabel={state.phase === "AUCTION" ? t("bridge.auction") : t("belote.emptyTrick")}
            announce={
              state.phase === "PLAY" && state.bidStrain ? (
                <TrumpIndicator
                  suit={state.bidStrain === "NT" ? null : (state.bidStrain as SuitChar)}
                  label={`${t("bridge.contract")} ${state.bidLevel}`}
                  noTrumpText="NT"
                />
              ) : undefined
            }
            crest={state.trump ? STRAIN_GLYPH[state.trump as Strain] : "♢"}
            feltColor="#13322a"
            feltDark="#081a14"
            onPlay={(card) => {
              const a = playable.get(card);
              if (a) m.send(a);
            }}
            seatBadge={(s) => (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: s % 2 === myTeam ? "var(--win)" : "var(--loss)",
                }}
              />
            )}
          />

          {/* Auction bidding box. */}
          {state.phase === "AUCTION" && myTurn ? (
            <div className="mt-4 rounded-panel border border-brass-400/20 bg-felt-800/70 p-3">
              <div className="mb-2 text-center text-sm text-ink-300">{t("bridge.yourBid")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, maxWidth: 340, margin: "0 auto" }}>
                {[1, 2, 3, 4, 5, 6, 7].map((level) =>
                  STRAINS.map((strain) => {
                    const bid = bidFor(level, strain);
                    return (
                      <button
                        key={`${level}${strain}`}
                        type="button"
                        disabled={!bid}
                        onClick={() => bid && m.send(bid)}
                        className="aso-bridge-bid"
                        style={{
                          color:
                            strain === "H" || strain === "D" ? "var(--suit-red)" : "var(--ink-100)",
                        }}
                      >
                        {level}
                        {STRAIN_GLYPH[strain]}
                      </button>
                    );
                  }),
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                {legal.some((a) => a.type === "DOUBLE") ? (
                  <Button variant="felt" onClick={() => m.send({ type: "DOUBLE" })}>
                    {t("bridge.double")}
                  </Button>
                ) : null}
                {legal.some((a) => a.type === "REDOUBLE") ? (
                  <Button variant="felt" onClick={() => m.send({ type: "REDOUBLE" })}>
                    {t("bridge.redouble")}
                  </Button>
                ) : null}
                {passAction ? (
                  <Button variant="ghost" onClick={() => m.send(passAction)}>
                    {t("belote.pass")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Dummy hand — face-up for everyone once the opening lead is out; the
              declarer clicks a card to play it on the dummy's turn. `key` on the
              wrapper is the reveal trigger: it mounts once, cascading the cards
              in (aso-card-deal) for the face-up flourish. */}
          {dummyRevealed ? (
            <div key={`dummy-${state.dealNo}`} className="bridge-dummy mt-4 rounded-panel border border-brass-400/20 bg-felt-800/70 p-3">
              <div className="mb-1 text-center text-sm text-ink-300">
                {t("bridge.dummyHand")} · {dummyName}
              </div>
              {canPlayDummy ? (
                <div className="mb-2 text-center text-xs text-ink-muted">{t("bridge.playFromDummy")}</div>
              ) : null}
              <div className="aso-myhand flex flex-wrap items-center justify-center gap-1">
                {dummyHand.map((card, i) => {
                  const a = canPlayDummy ? playable.get(card) : undefined;
                  return (
                    <div key={card} style={{ marginLeft: i ? -14 : 0 }}>
                      <PlayingCard
                        card={card}
                        size="sm"
                        dimmed={canPlayDummy && !a}
                        onClick={a ? () => m.send(a) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill label={t("bridge.weTricks")} value={state.tricksWon[myTeam] ?? 0} highlight />
            <ScorePill label={t("bridge.theyTricks")} value={state.tricksWon[myTeam === 0 ? 1 : 0] ?? 0} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <ScorePill
              label={`${t("bridge.rubber")} · ${t("belote.yourTeam")}`}
              value={state.matchPoints?.[myTeam] ?? 0}
              highlight
            />
            <ScorePill label={t("belote.theirTeam")} value={state.matchPoints?.[myTeam === 0 ? 1 : 0] ?? 0} />
            <span className="text-xs text-ink-muted">
              {t("bridge.deal")} {state.dealNo ?? 1} · {t("bridge.games")} {state.gamesWon?.[myTeam] ?? 0}–
              {state.gamesWon?.[myTeam === 0 ? 1 : 0] ?? 0}
              {state.vulnerable?.[myTeam] ? ` · ${t("bridge.vulnerable")}` : ""}
            </span>
          </div>
          {state.lastDeal ? (
            <p className="mt-1 text-center text-xs text-ink-muted">
              {t("bridge.lastDeal")}: {state.lastDeal.level}
              {state.lastDeal.strain} ·{" "}
              {state.lastDeal.made ? t("bridge.made") : t("bridge.defeated")} ({state.lastDeal.tricks}) ·{" "}
              +{Math.max(state.lastDeal.declScore, state.lastDeal.defScore)}
            </p>
          ) : null}
        </>
      ) : null}
    </Scene>
  );
}
