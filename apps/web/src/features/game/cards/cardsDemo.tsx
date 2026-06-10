/** Dev-only visual harness for the PlayingCard (screenshot target). */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PlayingCard } from "./PlayingCard";
import "../../../styles/tokens.css";
import "./cards.css";

const SUITS = ["S", "H", "D", "C"] as const;
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "5", "3", "2"] as const;
const sample = RANKS.map((r, i) => `${r}${SUITS[i % 4]}`);

function Demo() {
  return (
    <MemoryRouter initialEntries={["/play/belote"]}>
      <div
        style={{
          minHeight: "100vh",
          background: "radial-gradient(120% 100% at 50% 0%, #1a4030, #0b2418)",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
        }}
      >
        {sample.map((c) => (
          <PlayingCard key={c} card={c} size="lg" />
        ))}
        {/* a couple of small ones to check tight layouts */}
        {["AS", "KH", "QD", "JC"].map((c) => (
          <PlayingCard key={`sm-${c}`} card={c} size="sm" />
        ))}
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
(window as unknown as { __cardsReady?: boolean }).__cardsReady = true;
