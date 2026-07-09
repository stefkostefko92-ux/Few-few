/** Dev-only showcase: renders one real game view (driven by engine fixtures via
 *  the fake socket) at /showcase.html?game=BELOTE. Used to screenshot tables. */
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";
import "../styles/global.css";
import { GameView } from "../features/game/GameView";
import { useAuthStore } from "../lib/store";

const params = new URLSearchParams(location.search);
const game = (params.get("game") ?? "BELOTE").toUpperCase();

// Seed a signed-in player so chrome (wallet, buy-in gates) renders.
useAuthStore.setState({
  initializing: false,
  user: {
    id: "demo",
    email: "admin@carbonstealth.eu",
    emailVerified: true,
    displayName: "Admin",
    role: "OWNER",
    locale: "bg",
    chips: "250000",
    gems: 9600,
    xp: 4200,
    level: 12,
    vipTier: "PLATINUM",
  },
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <MemoryRouter initialEntries={[`/play/${game.toLowerCase()}`]}>
    <Routes>
      <Route path="/play/:game" element={<GameView />} />
    </Routes>
  </MemoryRouter>,
);

// Signal readiness for the screenshot harness once the table has painted.
setTimeout(() => ((window as unknown as { __showReady?: boolean }).__showReady = true), 1200);
