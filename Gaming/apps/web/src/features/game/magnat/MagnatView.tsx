import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BOARD,
  GROUP_COLORS,
  GROUP_TILES,
  isOwnable,
  type MagnatAction,
  type MagnatEvent,
  type MagnatState,
} from "@aso/shared";
import type { MagnatScene } from "./magnatScene";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene } from "../scene/SceneShell";
import "./magnat.css";

const PLAYER_COLORS = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0", "#e07a1f"];

let cardSeq = 0;

/** WebGL availability — МАГНАТ's board needs it; otherwise we degrade to the HUD. */
function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function MagnatView({ title }: { title: string }) {
  const { t } = useTranslation();
  const m = useMatch<MagnatState, MagnatAction>("MAGNAT");
  const { state, seat, phase, result, legal, players } = m;
  const felt = useEquippedCosmetic("MAGNAT", "ESTATE");
  const useGL = useMemo(() => webglSupported(), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MagnatScene | null>(null);
  const stateRef = useRef<MagnatState | null>(state);
  stateRef.current = state;
  const feltRef = useRef(felt);
  feltRef.current = felt;

  // The canvas exists only once the match state arrives (it renders behind
  // `{state ? ...}`), so the GL effect must re-run on that flip — otherwise it
  // bails on the missing canvas at mount and the board stays blank forever.
  const glReady = !!state;
  useEffect(() => {
    if (!useGL || !glReady) return;
    let scene: MagnatScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(280, wrap.clientWidth);

    void import("./magnatScene")
      .then(({ MagnatScene }) => {
        if (cancelled) return;
        scene = new MagnatScene(canvas, width());
        sceneRef.current = scene;
        const f = feltRef.current?.colors;
        if (f) scene.setFelt(f.a, f.b);
        if (stateRef.current) scene.setState(stateRef.current);
        ro = new ResizeObserver(() => scene?.resize(width()));
        ro.observe(wrap);
      })
      .catch(() => {
        /* WebGL init failed despite the support check — HUD still works. */
      });
    return () => {
      cancelled = true;
      ro?.disconnect();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [useGL, glReady]);

  useEffect(() => {
    if (sceneRef.current && state) sceneRef.current.setState(state);
  }, [state]);

  useEffect(() => {
    const f = felt?.colors;
    if (sceneRef.current && f) sceneRef.current.setFelt(f.a, f.b);
  }, [felt]);

  const has = (type: MagnatAction["type"]) => legal.some((a) => a.type === type);
  const tileHas = (type: "BUILD" | "MORTGAGE" | "UNMORTGAGE" | "SELL", t: number) =>
    legal.some((a) => a.type === type && "tile" in a && a.tile === t);
  const send = (a: MagnatAction) => {
    playCue("flip");
    m.send(a);
  };

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const pending = state?.pendingBuy ?? null;
  const myProps = state ? BOARD.map((_, i) => i).filter((i) => isOwnable(i) && state.owner[i] === seat) : [];

  const name = (s: number) => players.find((p) => p.seat === s)?.displayName ?? t("magnat.player", { num: s + 1 });

  // ── event-driven feedback (GAME_EVENTS): banners for EVERYONE at the table
  // (rent, auction bids, jail, pot, bankruptcies) + a card modal for Късмет/Каса.
  // Previously the view never consumed the event stream — cards and rents were
  // invisible beyond a tiny log line.
  const [card, setCard] = useState<{ id: number; seat: number; text: string } | null>(null);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (cardTimer.current) clearTimeout(cardTimer.current);
    },
    [],
  );
  const showCard = (cardSeat: number, text: string) => {
    playCue("flip");
    setCard({ id: ++cardSeq, seat: cardSeat, text });
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = setTimeout(() => setCard(null), 3000);
  };

  const tileName = (i: unknown): string => (typeof i === "number" ? (BOARD[i]?.name ?? "") : "");
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (raw) => {
      const ev = raw as unknown as MagnatEvent;
      switch (ev.type) {
        case "CARD":
          showCard(ev.seat, ev.text); // shown as a modal over the board, not a banner
          return null;
        case "RENT":
          return {
            text: t("magnat.rentBanner", { from: name(ev.seat), to: name(ev.to), amount: ev.amount }),
            tone: ev.seat === seat ? "loss" : ev.to === seat ? "win" : "brass",
          };
        case "JAIL_STAY":
          return ev.seat === seat
            ? { text: t("magnat.jailStayYou", { d1: ev.dice[0], d2: ev.dice[1], attempt: ev.attempt }), tone: "loss" }
            : { text: t("magnat.jailStay", { name: name(ev.seat), attempt: ev.attempt }) };
        case "JAIL_FEE":
          return { text: t("magnat.jailFee", { name: name(ev.seat), amount: ev.amount }) };
        case "JAIL":
          return { text: t("magnat.jailBanner", { name: name(ev.seat) }), tone: ev.seat === seat ? "loss" : "brass" };
        case "AUCTION_START":
          return { text: t("magnat.auctionStartBanner", { tile: tileName(ev.tile) }) };
        case "AUCTION_BID":
          return { text: t("magnat.bidBanner", { name: name(ev.seat), amount: ev.amount, tile: tileName(ev.tile) }) };
        case "AUCTION_WON":
          return {
            text: t("magnat.auctionWonBanner", { name: name(ev.seat), tile: tileName(ev.tile), amount: ev.amount }),
            tone: ev.seat === seat ? "win" : "brass",
          };
        case "AUCTION_PASSED":
          return { text: t("magnat.auctionPassedBanner", { tile: tileName(ev.tile) }) };
        case "POT":
          return {
            text: t("magnat.potBanner", { name: name(ev.seat), amount: ev.amount }),
            tone: ev.seat === seat ? "win" : "brass",
          };
        case "BANKRUPT":
          return { text: t("magnat.bankruptBanner", { name: name(ev.seat) }), tone: ev.seat === seat ? "loss" : "brass" };
        case "TRADE_DONE":
          return { text: t("magnat.tradeDoneBanner", { from: name(ev.from), to: name(ev.to) }) };
        case "TRADE_REJECTED":
          return { text: t("magnat.tradeRejectedBanner", { name: name(ev.to) }) };
        default:
          return null;
      }
    },
  });

  // A property is tradable if owned and its whole colour group has no houses.
  const tradableOf = (owner: number): number[] =>
    state
      ? BOARD.map((_, i) => i).filter(
          (i) =>
            isOwnable(i) &&
            state.owner[i] === owner &&
            (BOARD[i]!.type !== "prop" || GROUP_TILES[BOARD[i]!.group]!.every((g) => state.houses[g]! === 0)),
        )
      : [];

  // ── auction + trade UI state ────────────────────────────────────────────
  const auction = state?.auction ?? null;
  const minBid = (auction?.high ?? 0) + 10;
  const [bid, setBid] = useState(minBid);
  useEffect(() => setBid(minBid), [minBid, auction?.tile]);

  const [tradeOpen, setTradeOpen] = useState(false);
  const [partner, setPartner] = useState<number | null>(null);
  const [give, setGive] = useState<Set<number>>(new Set());
  const [want, setWant] = useState<Set<number>>(new Set());
  const [giveCash, setGiveCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);
  const resetTrade = () => {
    setTradeOpen(false);
    setPartner(null);
    setGive(new Set());
    setWant(new Set());
    setGiveCash(0);
    setWantCash(0);
  };
  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSet(next);
  };
  // The HTML max on the cash inputs doesn't stop manual typing — clamp to the
  // owner's actual cash (and to integers) so the server never rejects silently.
  const clampCash = (v: number, max: number): number =>
    Math.max(0, Math.min(Number.isFinite(v) ? Math.floor(v) : 0, max));
  const sendTrade = () => {
    if (!state || partner === null) return;
    send({
      type: "TRADE_OFFER",
      to: partner,
      give: { cash: clampCash(giveCash, state.cash[seat] ?? 0), tiles: [...give] },
      want: { cash: clampCash(wantCash, state.cash[partner] ?? 0), tiles: [...want] },
    });
    resetTrade();
  };

  const boardSummary =
    state &&
    `${t("magnat.boardTitle")}. ${state.cash
      .map(
        (c, s) =>
          `${name(s)}: ${state.bankrupt[s] ? t("magnat.bankrupt") : t("magnat.inCash", { amount: c })}, ${t(
            "magnat.onField",
            { tile: BOARD[state.pos[s]!]!.name },
          )}`,
      )
      .join("; ")}.`;
  const liveLine = state
    ? state.done
      ? t("magnat.gameOver")
      : `${t("magnat.turnOf", { name: name(state.turn) })} ${state.log.at(-1) ?? ""}`
    : "";

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result} wide>
      {state ? (
        <div className="mag-layout">
          <Announcements banners={banners} fixed />
          <div ref={wrapRef} className="mag-board">
            {useGL ? (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={boardSummary ?? t("magnat.boardTitle")}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <p className="mag-nogl">{t("magnat.noWebGL")}</p>
            )}
            {/* Късмет/Каса card — everyone sees the drawn card for a moment */}
            {card ? (
              <div key={card.id} className="mag-card-pop" role="status" aria-live="assertive">
                <div className="mag-card">
                  <p className="mag-card-kicker">{t("magnat.cardDrawn", { name: name(card.seat) })}</p>
                  <p className="mag-card-text">{card.text}</p>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="mag-side">
            <p className="sr-only" aria-live="polite">
              {liveLine}
            </p>
            {/* status pills: live auction (visible to ALL seats) + parking pot */}
            {auction || state.config.freeParkingPot ? (
              <div className="mag-pills">
                {auction ? (
                  <span className="mag-pill mag-pill--auction">
                    {t("magnat.auctionPill", { tile: BOARD[auction.tile]!.name })}
                    {" · "}
                    {auction.high > 0
                      ? t("magnat.auctionLeader", { name: name(auction.highBidder), amount: auction.high })
                      : t("magnat.auctionNone")}
                  </span>
                ) : null}
                {state.config.freeParkingPot ? (
                  <span className="mag-pill">{t("magnat.potPill", { amount: state.pot })}</span>
                ) : null}
              </div>
            ) : null}
            {/* players */}
            <div className="mag-players">
              {state.cash.map((cash, s) => (
                <div key={s} className={`mag-player ${s === state.turn ? "is-turn" : ""} ${state.bankrupt[s] ? "is-out" : ""}`}>
                  <span className="mag-dot" style={{ background: PLAYER_COLORS[s % PLAYER_COLORS.length] }} />
                  <span className="mag-name">
                    {name(s)}
                    {s === seat ? ` ${t("room.you")}` : ""}
                  </span>
                  {(state.gojf[s] ?? 0) > 0 ? (
                    <span className="mag-key" title={t("magnat.gojfCard")} aria-label={t("magnat.gojfCard")}>
                      🔑{state.gojf[s]! > 1 ? `×${state.gojf[s]}` : ""}
                    </span>
                  ) : null}
                  <span className="mag-cash">{state.bankrupt[s] ? t("magnat.bankrupt") : `${cash}`}</span>
                </div>
              ))}
            </div>

            {/* actions */}
            <div className="mag-actions">
              {!myTurn ? (
                state.phase === "TRADE" && state.trade && state.trade.from === seat ? (
                  // The offerer sees what they're waiting on instead of a bare turn hint.
                  <div className="mag-trade-resp">
                    <p className="mag-hint">{t("magnat.tradeWaiting", { name: name(state.trade.to) })}</p>
                    <p className="mag-trade-line">
                      {t("magnat.give")} {state.trade.give.tiles.map((i) => BOARD[i]!.name).join(", ") || "—"}
                      {state.trade.give.cash ? ` + ${state.trade.give.cash}` : ""}
                    </p>
                    <p className="mag-trade-line">
                      {t("magnat.get")} {state.trade.want.tiles.map((i) => BOARD[i]!.name).join(", ") || "—"}
                      {state.trade.want.cash ? ` + ${state.trade.want.cash}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="mag-hint">
                    {state.done ? t("magnat.gameOver") : t("magnat.turnHint", { name: name(state.turn) })}
                  </p>
                )
              ) : state.phase === "ROLL" ? (
                <div className="mag-btns">
                  {has("JAIL_CARD") ? <Button onClick={() => send({ type: "JAIL_CARD" })}>{t("magnat.jailCard")}</Button> : null}
                  {has("JAIL_PAY") ? <Button variant="felt" onClick={() => send({ type: "JAIL_PAY" })}>{t("magnat.payBail")}</Button> : null}
                  {has("ROLL") ? <Button onClick={() => send({ type: "ROLL" })}>{t("magnat.roll")}</Button> : null}
                </div>
              ) : state.phase === "BUY" && pending !== null ? (
                <div className="mag-btns">
                  {has("BUY") ? (
                    <Button onClick={() => send({ type: "BUY" })}>
                      {t("magnat.buy", { name: BOARD[pending]!.name, price: BOARD[pending]!.price })}
                    </Button>
                  ) : null}
                  <Button variant="felt" onClick={() => send({ type: "DECLINE" })}>{t("magnat.decline")}</Button>
                </div>
              ) : state.phase === "AUCTION" && auction ? (
                <div className="mag-auction">
                  <p className="mag-hint">
                    {t("magnat.auctionFor", { name: BOARD[auction.tile]!.name })}{" "}
                    {auction.high > 0 ? `${auction.high} (${name(auction.highBidder)})` : t("magnat.auctionNone")}
                  </p>
                  <div className="mag-bidrow">
                    <input
                      type="number"
                      min={minBid}
                      max={state.cash[seat]}
                      step={10}
                      value={bid}
                      onChange={(e) => setBid(Number(e.target.value))}
                    />
                    <div className="mag-bidquick">
                      {[10, 50, 100].map((d) => (
                        <button key={d} type="button" onClick={() => setBid((b) => b + d)}>+{d}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mag-btns">
                    {has("BID") ? (
                      <Button
                        onClick={() => send({ type: "BID", amount: bid })}
                        disabled={bid < minBid || bid > state.cash[seat]!}
                      >
                        {t("magnat.bid", { amount: bid })}
                      </Button>
                    ) : null}
                    <Button variant="felt" onClick={() => send({ type: "PASS_BID" })}>{t("magnat.pass")}</Button>
                  </div>
                </div>
              ) : state.phase === "TRADE" && state.trade && state.trade.to === seat ? (
                <div className="mag-trade-resp">
                  <p className="mag-hint">{t("magnat.tradeOffer", { name: name(state.trade.from) })}</p>
                  <p className="mag-trade-line">
                    {t("magnat.give")} {state.trade.want.tiles.map((i) => BOARD[i]!.name).join(", ") || "—"}
                    {state.trade.want.cash ? ` + ${state.trade.want.cash}` : ""}
                  </p>
                  <p className="mag-trade-line">
                    {t("magnat.get")} {state.trade.give.tiles.map((i) => BOARD[i]!.name).join(", ") || "—"}
                    {state.trade.give.cash ? ` + ${state.trade.give.cash}` : ""}
                  </p>
                  <div className="mag-btns">
                    {has("TRADE_ACCEPT") ? <Button onClick={() => send({ type: "TRADE_ACCEPT" })}>{t("magnat.accept")}</Button> : null}
                    <Button variant="felt" onClick={() => send({ type: "TRADE_DECLINE" })}>{t("magnat.decline")}</Button>
                  </div>
                </div>
              ) : state.phase === "MANAGE" ? (
                <div className="mag-btns">
                  <Button onClick={() => send({ type: "END" })}>{t("magnat.endTurn")}</Button>
                  {state.config.trading && state.seats > 1 ? (
                    <Button variant="felt" onClick={() => setTradeOpen((o) => !o)}>
                      {tradeOpen ? t("magnat.closeTrade") : t("magnat.trade")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {state.dice ? <p className="mag-dice">🎲 {state.dice[0]} + {state.dice[1]}</p> : null}
            </div>

            {/* trade composer */}
            {myTurn && state.phase === "MANAGE" && tradeOpen ? (
              <div className="mag-trade">
                <h4>{t("magnat.proposeTrade")}</h4>
                <select
                  value={partner ?? ""}
                  onChange={(e) => {
                    setPartner(e.target.value === "" ? null : Number(e.target.value));
                    setWant(new Set());
                  }}
                >
                  <option value="">{t("magnat.selectPlayer")}</option>
                  {state.cash.map((_, s) =>
                    s !== seat && !state.bankrupt[s] ? (
                      <option key={s} value={s}>{name(s)}</option>
                    ) : null,
                  )}
                </select>
                {partner !== null ? (
                  <div className="mag-trade-cols">
                    <div>
                      <p className="mag-trade-h">{t("magnat.giveCol")}</p>
                      {tradableOf(seat).map((i) => (
                        <label key={i} className="mag-trade-item">
                          <input type="checkbox" checked={give.has(i)} onChange={() => toggle(give, setGive, i)} />
                          {BOARD[i]!.name}
                        </label>
                      ))}
                      <input
                        type="number" min={0} max={state.cash[seat]} step={10} value={giveCash}
                        onChange={(e) => setGiveCash(Number(e.target.value))} placeholder={t("magnat.money")}
                      />
                    </div>
                    <div>
                      <p className="mag-trade-h">{t("magnat.wantCol")}</p>
                      {tradableOf(partner).map((i) => (
                        <label key={i} className="mag-trade-item">
                          <input type="checkbox" checked={want.has(i)} onChange={() => toggle(want, setWant, i)} />
                          {BOARD[i]!.name}
                        </label>
                      ))}
                      <input
                        type="number" min={0} max={state.cash[partner]} step={10} value={wantCash}
                        onChange={(e) => setWantCash(Number(e.target.value))} placeholder={t("magnat.money")}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="mag-btns">
                  <Button
                    onClick={sendTrade}
                    disabled={partner === null || (give.size === 0 && want.size === 0 && giveCash === 0 && wantCash === 0)}
                  >
                    {t("magnat.propose")}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* my properties (+ held "get out of jail" cards) */}
            {myProps.length > 0 || (state.gojf[seat] ?? 0) > 0 ? (
              <div className="mag-props">
                <h4>{t("magnat.myProps")}</h4>
                {(state.gojf[seat] ?? 0) > 0 ? (
                  <div className="mag-prop">
                    <span className="mag-prop-band" style={{ background: "#d9b25f" }} />
                    <span className="mag-prop-name">
                      🔑 {t("magnat.gojfCard")}
                      {state.gojf[seat]! > 1 ? ` ×${state.gojf[seat]}` : ""}
                    </span>
                  </div>
                ) : null}
                {myProps.map((i) => {
                  const tl = BOARD[i]!;
                  return (
                    <div key={i} className="mag-prop">
                      <span className="mag-prop-band" style={{ background: tl.type === "prop" ? GROUP_COLORS[tl.group] : "#888" }} />
                      <span className="mag-prop-name">
                        {tl.name}
                        {state.houses[i]! > 0
                          ? ` · ${state.houses[i] === 5 ? t("magnat.hotel") : t("magnat.houses", { n: state.houses[i] })}`
                          : ""}
                        {state.mortgaged[i] ? ` · ${t("magnat.mortgaged")}` : ""}
                      </span>
                      <span className="mag-prop-acts">
                        {tileHas("BUILD", i) ? <button type="button" onClick={() => send({ type: "BUILD", tile: i })}>+🏠</button> : null}
                        {tileHas("SELL", i) ? <button type="button" onClick={() => send({ type: "SELL", tile: i })}>−</button> : null}
                        {tileHas("MORTGAGE", i) ? <button type="button" onClick={() => send({ type: "MORTGAGE", tile: i })}>{t("magnat.mortgage")}</button> : null}
                        {tileHas("UNMORTGAGE", i) ? <button type="button" onClick={() => send({ type: "UNMORTGAGE", tile: i })}>{t("magnat.redeem")}</button> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* log */}
            {state.log.length > 0 ? (
              <div className="mag-log">
                {state.log.slice(-5).map((l, i) => (
                  // Stable key off the absolute log index — the slice is a sliding
                  // window, so a positional key would remap lines to wrong nodes.
                  <p key={state.log.length - Math.min(5, state.log.length) + i}>{l}</p>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </Scene>
  );
}
