import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../ui";
import { useSettings } from "../../../lib/settings";
import { useNarrowTable } from "../table/useNarrowTable";
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
  /** Who made the standing bid (the auction's current contract). */
  lastBidder: number | null;
  declarer: number | null;
  doubled: number;
  tricksWon: [number, number];
  matchPoints: [number, number];
  gamesWon: [number, number];
  vulnerable: [boolean, boolean];
  dealNo: number;
  lastDeal: {
    declarer: number;
    level: number;
    strain: Strain;
    made: boolean;
    tricks: number;
    declScore: number;
    defScore: number;
    /** Онори (рубер): за отбора на притежателя, над линията. */
    honors?: { seat: number; team: number; points: number } | null;
  } | null;
}
type BridgeAction =
  | { type: "PASS" }
  | { type: "BID"; level: number; strain: Strain }
  | { type: "DOUBLE" }
  | { type: "REDOUBLE" }
  | { type: "PLAY"; card: string };

const STRAIN_GLYPH: Record<Strain, string> = { C: "♣", D: "♦", H: "♥", S: "♠", NT: "NT" };
const STRAINS: Strain[] = ["C", "D", "H", "S", "NT"];

/** Bid chip ink per strain: suit colour (four-colour aware), NT in black. */
const BID_INK: Record<Strain, string> = {
  C: "var(--suit-club)",
  D: "var(--suit-diamond)",
  H: "var(--suit-heart)",
  S: "var(--suit-spade)",
  NT: "var(--suit-black)",
};

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
  const nameOf = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

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
  // When I AM the dummy my cards are already on screen as my hand — the panel
  // would only repeat them.
  const dummyRevealed =
    !!state && state.phase === "PLAY" && dummy !== null && dummy !== seat && (dummyHand[0] ?? "?") !== "?";
  const canPlayDummy = isDeclarer && dummyTurn;
  const dummyName = dummy !== null ? players.find((p) => p.seat === dummy)?.displayName ?? `#${dummy}` : "";

  // The bidding box and the dummy's hand live UNDER the table — below the
  // fold on a 768px-tall laptop (and on every phone). Bring each into view
  // the moment it needs a click; "nearest" keeps my hand on screen above it
  // and does nothing when the box is already visible.
  const reduced = useSettings((s) => s.reducedMotion);
  const narrow = useNarrowTable();
  const bidding = !!state && state.phase === "AUCTION" && myTurn;
  const auctionRef = useRef<HTMLDivElement>(null);
  const dummyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bidding) return;
    auctionRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [bidding, reduced]);
  useEffect(() => {
    if (!canPlayDummy) return;
    dummyRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [canPlayDummy, reduced]);

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
              // The whole auction is narrated, like Белот's: without it a
              // player never saw what the others had bid.
              const who = typeof ev.seat === "number" ? nameOf(ev.seat) : "";
              if (ev.type === "BID" && typeof ev.level === "number") {
                return { text: `${who}: ${ev.level}${STRAIN_GLYPH[ev.strain as Strain]}`, tone: "brass" };
              }
              if (ev.type === "PASS" && who) return { text: `${who}: ${t("belote.pass")}`, tone: "brass" };
              if (ev.type === "DOUBLE") return { text: t("belote.contra") + "!", tone: "loss" };
              if (ev.type === "REDOUBLE") return { text: t("belote.recontra") + "!", tone: "win" };
              if (ev.type === "CONTRACT" && typeof ev.level === "number")
                return { text: `${ev.level}${STRAIN_GLYPH[ev.strain as Strain]}`, tone: "brass" };
              if (ev.type === "HONORS" && typeof ev.points === "number" && typeof ev.seat === "number")
                return {
                  text: t("bridge.honorsBanner", {
                    name: players.find((p) => p.seat === ev.seat)?.displayName ?? `#${ev.seat}`,
                    n: ev.points,
                  }),
                  tone: ev.team === myTeam ? "win" : "loss",
                };
              if (ev.type === "RESULT")
                return { text: ev.made ? t("bridge.made") + "!" : t("bridge.defeated") + "!", tone: ev.made ? "win" : "loss" };
              return null;
            }}
            names={nameOf}
            emptyTrickLabel={state.phase === "AUCTION" ? t("bridge.auction") : t("belote.emptyTrick")}
            announce={
              state.phase === "PLAY" && state.bidStrain ? (
                <TrumpIndicator
                  suit={state.bidStrain === "NT" ? null : (state.bidStrain as SuitChar)}
                  // phones: just the level over the strain card („3“ over „NT“) —
                  // „Договор 3“ was wider than the card and ran into the top fan
                  label={narrow ? `${state.bidLevel}` : `${t("bridge.contract")} ${state.bidLevel}`}
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
          {bidding ? (
            <div
              ref={auctionRef}
              data-zone="auction"
              className="mt-4 scroll-mb-16 rounded-panel border border-brass-400/20 bg-felt-800/70 p-3"
            >
              <div className="mb-2 text-center text-sm text-ink-300">{t("bridge.yourBid")}</div>
              {/* The standing bid I am answering (who, what, doubled). */}
              {state.bidLevel > 0 && state.bidStrain ? (
                <div className="mb-2 text-center text-xs text-ink-muted" data-zone="standing-bid">
                  {t("bridge.contract")}:{" "}
                  <span className="font-semibold text-brass-100">
                    {state.bidLevel}
                    {STRAIN_GLYPH[state.bidStrain]}
                  </span>
                  {state.lastBidder !== null && state.lastBidder !== undefined
                    ? ` · ${nameOf(state.lastBidder)}`
                    : ""}
                  {state.doubled === 2
                    ? ` · ${t("bridge.redouble")}`
                    : state.doubled === 1
                      ? ` · ${t("bridge.double")}`
                      : ""}
                </div>
              ) : null}
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
                        data-action="bid"
                        data-bid={`${level}${strain}`}
                        className="aso-bridge-bid"
                        // Suit colours on the ivory bid chip (per suit, so the four-colour
                        // deck applies here too). It used --ink-100 for ♣/♠/NT: near-white
                        // on ivory, i.e. those bids were invisible.
                        style={{ color: BID_INK[strain] }}
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
                  <Button variant="felt" data-action="double" onClick={() => m.send({ type: "DOUBLE" })}>
                    {t("bridge.double")}
                  </Button>
                ) : null}
                {legal.some((a) => a.type === "REDOUBLE") ? (
                  <Button variant="felt" data-action="redouble" onClick={() => m.send({ type: "REDOUBLE" })}>
                    {t("bridge.redouble")}
                  </Button>
                ) : null}
                {passAction ? (
                  <Button variant="ghost" data-action="pass" onClick={() => m.send(passAction)}>
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
            <div
              key={`dummy-${state.dealNo}`}
              ref={dummyRef}
              data-dummy-turn={canPlayDummy ? "true" : "false"}
              className="bridge-dummy mt-4 scroll-mb-16 rounded-panel border border-brass-400/20 bg-felt-800/70 p-3"
            >
              <div className="mb-1 text-center text-sm text-ink-300">
                {t("bridge.dummyHand")} · {dummyName}
              </div>
              {canPlayDummy ? (
                <div className="mb-2 text-center text-xs text-ink-muted">{t("bridge.playFromDummy")}</div>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-1" data-zone="dummy">
                {dummyHand.map((card, i) => {
                  const a = canPlayDummy ? playable.get(card) : undefined;
                  return (
                    <div key={card} style={{ marginLeft: i ? -14 : 0 }}>
                      <PlayingCard
                        card={card}
                        size="sm"
                        dimmed={canPlayDummy && !a}
                        interactive={isDeclarer}
                        onClick={a ? () => m.send(a) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            className="mt-4 flex flex-wrap items-center justify-center gap-3"
            data-zone="score"
            data-tricks={`${state.tricksWon[myTeam] ?? 0}:${state.tricksWon[myTeam === 0 ? 1 : 0] ?? 0}`}
            data-deal={state.dealNo ?? 1}
            data-phase={state.phase}
            data-contract={state.bidLevel ? `${state.bidLevel}${state.bidStrain ?? ""}` : ""}
            data-doubled={state.doubled ?? 0}
            data-declarer={state.declarer ?? ""}
          >
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
              {state.lastDeal.honors ? (
                <>
                  {" "}
                  ·{" "}
                  {t("bridge.honors", {
                    n: state.lastDeal.honors.points,
                    side: state.lastDeal.honors.team === myTeam ? t("bridge.us") : t("bridge.them"),
                  })}
                </>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}
    </Scene>
  );
}
