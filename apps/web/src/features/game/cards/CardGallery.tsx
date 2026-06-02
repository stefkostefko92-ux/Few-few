import { PlayingCard } from "./PlayingCard";
import "./cards.css";

/** Dev-only gallery to visually verify the card deck. Not linked in nav. */
export function CardGallery() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
  return (
    <div style={{ padding: 24 }}>
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
