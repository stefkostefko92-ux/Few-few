import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { FourPlayerTrick } from "../trick/FourPlayerTrick";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { type SuitChar } from "../cards/suits";

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
  tricksWon: [number, number];
}
type BridgeAction =
  | { type: "PASS" }
  | { type: "BID"; level: number; strain: Strain }
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

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <>
          <FourPlayerTrick
            state={state}
            seat={seat}
            playable={playable}
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
              {passAction ? (
                <div className="mt-2 text-center">
                  <Button variant="ghost" onClick={() => m.send(passAction)}>
                    {t("belote.pass")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <ScorePill label={t("bridge.weTricks")} value={state.tricksWon[myTeam] ?? 0} highlight />
            <ScorePill label={t("bridge.theyTricks")} value={state.tricksWon[myTeam === 0 ? 1 : 0] ?? 0} />
          </div>
        </>
      ) : null}
    </Scene>
  );
}
