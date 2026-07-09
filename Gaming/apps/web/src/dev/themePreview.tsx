/** Dev-only theme preview: real Header (with the new logo) + themed panels over
 *  the cosmos background, so the palette can be screenshotted at /theme.html. */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../i18n";
import "../styles/global.css";
import { Header } from "../app/Header";
import { Badge, Button, Panel } from "../ui";
import { useAuthStore } from "../lib/store";

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

const GAMES = ["Белот", "Сантасе", "Табла", "Шах", "Свара", "Не се сърди"];

function Preview() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-8 flex items-center gap-4">
          <img src="/logo-mark.png" alt="" className="h-16 w-16 rounded-xl shadow-lift" />
          <div>
            <h1 className="font-display text-4xl text-brass-300">Играй космически</h1>
            <p className="text-ink-300">Премиум портал за карти и игри на маса.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {GAMES.map((g, i) => (
            <Panel key={g} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg text-ink-100">{g}</h3>
                {i === 0 ? <Badge tone="vip">VIP</Badge> : null}
              </div>
              <p className="text-sm text-ink-muted">Играй в реално време срещу приятели и ботове.</p>
              <div className="flex gap-2">
                <Button className="flex-1">Играй</Button>
                <Button variant="ghost">Стая</Button>
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <span className="rounded-full border border-brass-300/50 bg-felt-800/60 px-4 py-2 text-sm text-brass-300">Злато</span>
          <span className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--cyan-400)", color: "var(--cyan-300)", background: "var(--felt-800)" }}>Циан кристал</span>
          <span className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--violet-400)", color: "var(--violet-300)", background: "var(--felt-800)" }}>Виолетова мъглявина</span>
          <span className="rounded-full border border-brass-400/20 bg-felt-700 px-4 py-2 text-sm text-ink-100">Активна маса</span>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/"]}>
    <Preview />
  </MemoryRouter>,
);
setTimeout(() => ((window as unknown as { __showReady?: boolean }).__showReady = true), 800);
