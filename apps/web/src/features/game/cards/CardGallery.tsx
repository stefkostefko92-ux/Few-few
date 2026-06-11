import { PlayingCard } from "./PlayingCard";
import { FeltTable, Seat, TableCenter } from "../table/FeltTable";
import { CinematicStage } from "../cinematic/CinematicStage";
import { GameOverPanel } from "../scene/SceneShell";
import "./cards.css";

/** Dev-only gallery to visually verify the card deck + cinematic moments. */
export function CardGallery() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  if (params.get("over")) {
    // Preview the cinematic game-over punch-in (?over=win|loss|draw).
    const r = params.get("over") as "win" | "loss" | "draw";
    return (
      <CinematicStage tone="warm">
        <GameOverPanel
          seat={0}
          result={{
            matchId: "preview",
            score: [{ seat: 0, result: r }, { seat: 1, result: r === "win" ? "loss" : "win" }],
            ratingDeltas: { 0: r === "win" ? 24 : -18 },
          }}
        />
      </CinematicStage>
    );
  }
  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
        <FeltTable crest="A">
          <Seat pos="top" name="Мария" badge={<span className="tnum">42</span>}>
            <div style={{ display: "flex" }}>
              {["?", "?", "?", "?", "?", "?"].map((c, i) => (
                <PlayingCard key={i} card={c} size="sm" style={{ marginLeft: i ? -22 : 0 }} />
              ))}
            </div>
          </Seat>
          <Seat pos="left" name="Иван" />
          <Seat pos="right" name="Петър" />
          <TableCenter>
            <PlayingCard card="AH" size="md" />
            <PlayingCard card="KS" size="md" />
            <PlayingCard card="TD" size="md" />
          </TableCenter>
          <Seat pos="bottom" name="Ти" active badge={<span className="tnum">66</span>}>
            <div style={{ display: "flex" }}>
              {["AS", "KH", "QD", "JC", "TS", "9H"].map((c, i) => (
                <PlayingCard key={c} card={c} size="md" style={{ marginLeft: i ? -28 : 0 }} />
              ))}
            </div>
          </Seat>
        </FeltTable>
      </div>
      <h1 className="mb-4 text-3xl text-brass-300">Тесте — преглед</h1>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <PlayingCard card="?" size="lg" />
        <PlayingCard card="AS" size="lg" />
        <PlayingCard card="KH" size="lg" selected />
        <PlayingCard card="TD" size="lg" />
      </div>
      {suits.map((s) => (
        <div key={s} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {ranks.map((r) => (
            <PlayingCard key={r + s} card={`${r}${s}`} size="sm" />
          ))}
        </div>
      ))}
    </div>
  );
}
