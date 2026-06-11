import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../ui";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { type SuitChar } from "../cards/suits";
import { TrumpIndicator } from "../cards/TrumpIndicator";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useMatch } from "../useMatch";
import { GameOverPanel, fitOverlap } from "../scene/SceneShell";
import "../cards/cards.css";

interface Play {
  seat: number;
  card: string;
}
interface Decl {
  seat: number;
  kind: "tierce" | "fifty" | "hundred" | "carre" | "belote";
  value: number;
}
type Contract = "S" | "H" | "D" | "C" | "NT" | "AT";
interface DealSummary {
  dealNo: number;
  contract: Contract;
  declarer: number;
  doubling: 1 | 2 | 4;
  raw: [number, number];
  awarded: [number, number];
  inside: boolean;
  hung: number;
  valat: number | null;
}
interface BeloteState {
  phase: "BID" | "PLAY";
  hands: string[][];
  trump: string | null;
  contract: Contract | null;
  doubling: 1 | 2 | 4;
  declarer: number | null;
  turn: number;
  trick: Play[];
  teamPoints: [number, number];
  declPoints: [number, number];
  declarations: Decl[];
  matchPoints: [number, number];
  hanging: number;
  dealNo: number;
  lastDeal: DealSummary | null;
}
type BeloteAction =
  | { type: "PASS" }
  | { type: "BID"; contract: Contract }
  | { type: "CONTRA" }
  | { type: "RECONTRA" }
  | { type: "PLAY"; card: string };

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
/** Bid ladder for the auction panel (♣ < ♦ < ♥ < ♠ < БК < ВК). */
const BID_LADDER: Contract[] = ["C", "D", "H", "S", "NT", "AT"];
const contractGlyph = (c: Contract | null, t: (k: string) => string): string =>
  c === null ? "A" : c === "NT" ? t("belote.noTrump") : c === "AT" ? t("belote.allTrump") : SUIT_GLYPH[c]!;

/** Map an absolute seat to a table position relative to my seat. */
function relativePos(seat: number, mySeat: number): SeatPos {
  const d = (seat - mySeat + 4) % 4;
  return d === 0 ? "bottom" : d === 1 ? "left" : d === 2 ? "top" : "right";
}

export function BeloteView({ title }: { title: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BeloteState, BeloteAction>("BELOTE");
  const { state, legal, seat, phase, result, players } = m;

  const tableRef = useRef<HTMLDivElement>(null);
  const { dealIn, playCard } = useCardAnimations(tableRef);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const playMap = useMemo(
    () =>
      new Map(
        legal.filter((a) => a.type === "PLAY").map((a) => [(a as { card: string }).card, a]),
      ),
    [legal],
  );
  const bidFor = (contract: Contract) =>
    legal.find((a): a is Extract<BeloteAction, { type: "BID" }> => a.type === "BID" && a.contract === contract);
  const passAction = legal.find((a) => a.type === "PASS");
  const contraAction = legal.find((a) => a.type === "CONTRA");
  const recontraAction = legal.find((a) => a.type === "RECONTRA");

  // Deal animation whenever a new deal's hand appears (multi-deal match).
  const dealtRef = useRef(0);
  useEffect(() => {
    if (state && dealtRef.current !== state.dealNo && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = state.dealNo;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  if (!state) {
    return <SearchingOrOver title={title} phase={phase} seat={seat} result={result} />;
  }

  const myTeam = seat % 2;
  const seats = [0, 1, 2, 3];

  function onPlay(card: string, node: HTMLElement | null) {
    const action = playMap.get(card);
    if (!action) return;
    playCard(node);
    playCue("flip");
    m.send(action);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl text-brass-300">{title}</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {t("game.leave")}
        </Button>
      </div>

      <div ref={tableRef}>
        <FeltTable crest={contractGlyph(state.contract, t)}>
          {seats
            .filter((s) => s !== seat)
            .map((s) => {
              const pos = relativePos(s, seat);
              const count = state.hands[s]?.length ?? 0;
              return (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={<TeamDot team={s % 2} myTeam={myTeam} />}
                >
                  <div style={{ display: "flex" }}>
                    {Array.from({ length: count }).map((_, i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -24 : 0 }} />
                    ))}
                  </div>
                </Seat>
              );
            })}

          <TableCenter>
            {state.trick.length === 0 ? (
              <span className="text-sm text-ink-muted">
                {state.phase === "BID" ? t("belote.auction") : t("belote.emptyTrick")}
              </span>
            ) : (
              state.trick.map((p) => <PlayingCard key={p.seat} card={p.card} size="md" />)
            )}
          </TableCenter>

          <Seat
            pos="bottom"
            name={user?.displayName ?? t("game.you")}
            active={myTurn}
            badge={<TeamDot team={myTeam} myTeam={myTeam} />}
          >
            <div className="aso-myhand" style={{ display: "flex" }}>
              {(state.hands[seat] ?? []).map((card, i) => {
                const playable = myTurn && state.phase === "PLAY" && playMap.has(card);
                return (
                  <CardSlot
                    key={`${card}-${i}`}
                    index={i}
                    count={(state.hands[seat] ?? []).length}
                    card={card}
                    playable={playable}
                    onPlay={onPlay}
                  />
                );
              })}
            </div>
          </Seat>

          {state.trump ? <TrumpIndicator suit={state.trump as SuitChar} label={t("belote.contract")} /> : null}
        </FeltTable>
      </div>

      {/* Match scoreboard: игра до 151 + текущо раздаване. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <ScorePill
          label={`${t("belote.match")} · ${t("belote.yourTeam")}`}
          value={state.matchPoints[myTeam] ?? 0}
          highlight
        />
        <ScorePill
          label={t("belote.theirTeam")}
          value={state.matchPoints[myTeam === 0 ? 1 : 0] ?? 0}
        />
        <span className="text-xs text-ink-muted">
          {t("belote.deal")} {state.dealNo} · {t("belote.target")} 151
          {state.hanging > 0 ? ` · ${t("belote.hanging")}: ${state.hanging}` : ""}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <ScorePill label={t("belote.dealPoints")} value={state.teamPoints[myTeam] ?? 0} highlight />
        <ScorePill label={t("belote.theirTeam")} value={state.teamPoints[myTeam === 0 ? 1 : 0] ?? 0} />
        {state.contract ? (
          <span className="rounded-full border border-brass-400/30 bg-felt-900/60 px-3 py-1 text-xs text-brass-100">
            {t("belote.contract")}: {contractGlyph(state.contract, t)}
            {state.doubling === 2 ? ` · ${t("belote.contra")}` : state.doubling === 4 ? ` · ${t("belote.recontra")}` : ""}
          </span>
        ) : null}
      </div>

      {state.declarations.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {state.declarations.map((d, i) => (
            <span
              key={i}
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: d.seat % 2 === myTeam ? "var(--brass-300)" : "rgba(217,178,95,.2)",
                background: "rgba(11,14,13,.5)",
                color: d.seat % 2 === myTeam ? "var(--brass-100)" : "var(--ink-muted)",
              }}
            >
              {t(`belote.decl.${d.kind}`)} +{d.value}
            </span>
          ))}
        </div>
      ) : null}

      {state.phase === "BID" && myTurn ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {BID_LADDER.map((c) => {
            const bid = bidFor(c);
            const red = c === "H" || c === "D";
            return (
              <button
                key={c}
                type="button"
                disabled={!bid}
                onClick={() => bid && m.send(bid)}
                className="aso-bid"
                style={{
                  color: red ? "var(--suit-red)" : "var(--ink-100)",
                  opacity: bid ? 1 : 0.3,
                  fontSize: c === "NT" || c === "AT" ? "0.7rem" : undefined,
                }}
                title={c === "NT" ? t("belote.noTrumpFull") : c === "AT" ? t("belote.allTrumpFull") : undefined}
              >
                {contractGlyph(c, t)}
              </button>
            );
          })}
          {contraAction ? (
            <Button variant="ghost" onClick={() => m.send(contraAction)}>
              {t("belote.contra")}
            </Button>
          ) : null}
          {recontraAction ? (
            <Button variant="ghost" onClick={() => m.send(recontraAction)}>
              {t("belote.recontra")}
            </Button>
          ) : null}
          {passAction ? (
            <Button variant="ghost" onClick={() => m.send(passAction)}>
              {t("belote.pass")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Последно раздаване (между раздаванията). */}
      {state.lastDeal && state.dealNo > state.lastDeal.dealNo ? (
        <p className="mt-3 text-center text-xs text-ink-muted">
          {t("belote.lastDeal")} #{state.lastDeal.dealNo}: {contractGlyph(state.lastDeal.contract, t)}
          {state.lastDeal.valat !== null ? ` · ${t("belote.valat")}` : ""}
          {state.lastDeal.inside ? ` · ${t("belote.inside")}` : ""}
          {" · "}
          {state.lastDeal.awarded[myTeam]}:{state.lastDeal.awarded[myTeam === 0 ? 1 : 0]}
        </p>
      ) : null}

      {phase === "over" && result ? <GameOverPanel seat={seat} result={result} /> : null}
    </div>
  );
}

function CardSlot({
  index,
  count,
  card,
  playable,
  onPlay,
}: {
  index: number;
  count: number;
  card: string;
  playable: boolean;
  onPlay: (card: string, node: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ marginLeft: index ? -fitOverlap(count, "md") : 0 }}>
      <PlayingCard
        card={card}
        size="md"
        dimmed={!playable}
        onClick={playable ? () => onPlay(card, ref.current) : undefined}
      />
    </div>
  );
}

function TeamDot({ team, myTeam }: { team: number; myTeam: number }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: team === myTeam ? "var(--win)" : "var(--loss)",
        display: "inline-block",
      }}
    />
  );
}


function ScorePill({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-full border px-4 py-1.5 text-sm"
      style={{
        borderColor: highlight ? "var(--brass-300)" : "rgba(217,178,95,.2)",
        background: "rgba(11,14,13,.5)",
        color: highlight ? "var(--brass-100)" : "var(--ink-300)",
      }}
    >
      {label}: <span className="tnum font-bold">{value}</span>
    </div>
  );
}

function SearchingOrOver({
  title,
  phase,
  seat,
  result,
}: {
  title: string;
  phase: string;
  seat: number;
  result: ReturnType<typeof useMatch>["result"];
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="mb-6 text-3xl text-brass-300">{title}</h1>
      {phase === "over" && result ? (
        <GameOverPanel seat={seat} result={result} />
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-brass-400/15 bg-felt-800/80 px-10 py-12">
          <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
          <p className="text-ink-300">{t("game.searching")}</p>
        </div>
      )}
    </div>
  );
}

