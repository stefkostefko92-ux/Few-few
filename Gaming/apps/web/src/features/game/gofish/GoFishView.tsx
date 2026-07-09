import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { PlayingCard } from "../cards/PlayingCard";
import { FeltTable, Seat, TableCenter, type SeatPos } from "../table/FeltTable";
import { useCardAnimations } from "../anim/useCardAnimations";
import { useCardFlight } from "../anim/useCardFlight";
import { useGameEvents } from "../useGameEvents";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill, fitOverlap } from "../scene/SceneShell";

interface GoFishState {
  hands: string[][];
  ocean: string[];
  books: number[];
  turn: number;
  seats: number;
}
type GoFishAction = { type: "ASK"; target: number; rank: string };

const RANK_LABEL: Record<string, string> = { T: "10" };

function positionsFor(count: number, mySeat: number): Map<number, SeatPos> {
  const order: SeatPos[] = ["top", "left", "right"];
  const map = new Map<number, SeatPos>();
  let k = 0;
  for (let i = 1; i < count; i++) map.set((mySeat + i) % count, order[k++ % order.length]!);
  return map;
}

export function GoFishView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<GoFishState, GoFishAction>("GOFISH");
  const { state, legal, seat, phase, result, players } = m;

  const nameFor = (s: number) => players.find((p) => p.seat === s)?.displayName ?? `#${s}`;

  // Opponent-visible action announcements: every ask, catch and fish is called
  // out by name — remembering who asked for what is the core of the game.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "ASK" && typeof ev.seat === "number" && typeof ev.target === "number") {
        const rank = RANK_LABEL[String(ev.rank)] ?? String(ev.rank);
        const out: Array<{ text: string; tone: "brass" | "win" }> = [
          { text: t("fx.asks", { from: nameFor(ev.seat), to: nameFor(ev.target), rank }), tone: "brass" },
        ];
        if (typeof ev.got === "number" && ev.got > 0) {
          out.push({
            text: t("fx.took", { name: nameFor(ev.seat), count: ev.got }),
            tone: ev.seat === seat ? "win" : "brass",
          });
        }
        return out;
      }
      if (ev.type === "FISH" && typeof ev.seat === "number") {
        // Lucky fish — drew the very rank asked for, so the seat goes again.
        return ev.lucky
          ? { text: t("fx.luckyFish", { name: nameFor(ev.seat) }), tone: ev.seat === seat ? "win" : "brass" }
          : { text: t("fx.fishes", { name: nameFor(ev.seat) }), tone: "brass" };
      }
      if (ev.type === "BOOK") {
        return ev.seat === seat
          ? { text: t("fx.book"), tone: "win" }
          : { text: t("fx.oppBookBy", { name: nameFor(ev.seat as number) }), tone: "brass" };
      }
      return null;
    },
  });

  const tableRef = useRef<HTMLDivElement>(null);
  const flight = useCardFlight(tableRef);
  const posOfRef = useRef(new Map<number, SeatPos>());

  // Card-transfer flights: caught cards stream from the victim to the asker,
  // a fish flies in from the ocean pile. Ghost clones — the state repaints
  // the hands in the same tick.
  useGameEvents(m.matchId, (events) => {
    for (const raw of events) {
      const ev = raw as { type?: string; seat?: number; target?: number; got?: number };
      const posOf = (s2: number): SeatPos => (s2 === seat ? "bottom" : posOfRef.current.get(s2) ?? "top");
      if (ev.type === "ASK" && typeof ev.seat === "number" && typeof ev.target === "number" && (ev.got ?? 0) > 0) {
        flight.flyGhost(posOf(ev.target), posOf(ev.seat), { count: ev.got });
      }
      if (ev.type === "FISH" && typeof ev.seat === "number") {
        const ocean = tableRef.current?.querySelector<HTMLElement>(".gofish-ocean") ?? null;
        flight.flyGhost(ocean ?? "top", posOf(ev.seat));
      }
    }
  });
  const { dealIn } = useCardAnimations(tableRef);
  const [target, setTarget] = useState<number | null>(null);

  const myTurn = !!state && state.turn === seat && legal.length > 0;

  // Ranks I can ask, and which targets are valid for each.
  const asks = useMemo(() => legal.filter((a) => a.type === "ASK"), [legal]);
  const targets = useMemo(() => [...new Set(asks.map((a) => a.target))].sort(), [asks]);
  const ranksForTarget = useMemo(() => {
    const tgt = target ?? targets[0] ?? null;
    return asks.filter((a) => a.target === tgt);
  }, [asks, target, targets]);

  useEffect(() => {
    if (targets.length > 0 && (target === null || !targets.includes(target))) {
      setTarget(targets[0] ?? null);
    }
  }, [targets, target]);

  const dealtRef = useRef(false);
  useEffect(() => {
    if (state && !dealtRef.current && (state.hands[seat]?.length ?? 0) > 0) {
      dealtRef.current = true;
      requestAnimationFrame(() => dealIn(".aso-myhand .aso-card"));
      playCue("deal");
    }
  }, [state, seat, dealIn]);

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {state ? (
        <>
          <div ref={tableRef}>
            {/* Aquarium — lighter blue-green felt (§4.5). */}
            <FeltTable crest="🐟" feltColor="#15455a" feltDark="#0a2330">
              {[...positionsFor(state.seats, seat).entries()].map(([s, pos]) => (
                <Seat
                  key={s}
                  pos={pos}
                  name={nameFor(s)}
                  active={state.turn === s}
                  badge={<span className="tnum">📚 {state.books[s] ?? 0}</span>}
                >
                  <div style={{ display: "flex" }}>
                    {Array.from({ length: Math.min(state.hands[s]?.length ?? 0, 8) }).map((_, i) => (
                      <PlayingCard key={i} card="?" size="sm" style={{ marginLeft: i ? -28 : 0 }} />
                    ))}
                  </div>
                </Seat>
              ))}

              <TableCenter>
                <div style={{ textAlign: "center" }}>
                  <PlayingCard card="?" size="md" />
                  <p className="mt-1 text-xs text-ink-muted">{t("gofish.ocean")}: {state.ocean.length}</p>
                </div>
              </TableCenter>

              <Seat
                pos="bottom"
                name={user?.displayName ?? t("game.you")}
                active={myTurn}
                badge={<span className="tnum">📚 {state.books[seat] ?? 0}</span>}
              >
                <div className="aso-myhand" style={{ display: "flex" }}>
                  {(state.hands[seat] ?? []).map((card, i) => (
                    <PlayingCard
                      key={`${card}-${i}`}
                      card={card}
                      size="md"
                      style={{ marginLeft: i ? -fitOverlap((state.hands[seat] ?? []).length, "md") : 0 }}
                    />
                  ))}
                </div>
              </Seat>
            </FeltTable>
          </div>

          {/* Ask controls. */}
          {myTurn ? (
            <div className="mt-4 rounded-panel border border-brass-400/20 bg-felt-800/70 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-ink-300">{t("gofish.askFrom")}:</span>
                {targets.map((tg) => (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => setTarget(tg)}
                    className="rounded-full px-3 py-1 text-sm"
                    style={{
                      background: tg === target ? "var(--brass-400)" : "var(--felt-700)",
                      color: tg === target ? "var(--charcoal-900)" : "var(--ink-300)",
                    }}
                  >
                    {nameFor(tg)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {ranksForTarget.map((a) => (
                  <button
                    key={a.rank}
                    type="button"
                    className="aso-bid"
                    style={{ width: 44, height: 44, fontSize: "1.1rem" }}
                    onClick={() => { playCue("flip"); m.send(a); }}
                  >
                    {RANK_LABEL[a.rank] ?? a.rank}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-center gap-3">
            <ScorePill label={t("gofish.books")} value={state.books[seat] ?? 0} highlight />
          </div>
        </>
      ) : null}
    </Scene>
  );
}
