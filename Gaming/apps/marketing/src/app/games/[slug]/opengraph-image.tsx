import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "../../../lib/site";
import { GAME_CONTENT, getGameContent } from "../../../content/games";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** One prerendered OG card per game (static export). */
export function generateStaticParams(): Array<{ slug: string }> {
  return GAME_CONTENT.map((g) => ({ slug: g.slug }));
}

const ogDir = join(process.cwd(), "src", "og");
const font = (file: string) => readFileSync(join(ogDir, file));

/**
 * Per-game branded OpenGraph / Twitter share card (1200×630), generated at
 * build time. Gives each of the 21 game pages a distinct social / answer-engine
 * preview (title + players + duration) instead of inheriting the site card —
 * richer link unfurls and AEO cards. Mirrors the root OG card's visual system.
 */
export default function Image({ params }: { params: { slug: string } }) {
  const game = getGameContent(params.slug);
  const title = game?.title ?? SITE.name;
  const meta = game ? `${game.players} · ${game.durationMin} мин` : SITE.tagline;
  // Scale the title down for longer names so it never overflows the card.
  const titleSize = title.length > 16 ? 108 : title.length > 11 ? 132 : 160;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 80px",
          backgroundColor: "#070a18",
          backgroundImage:
            "radial-gradient(60% 55% at 50% 0%, rgba(217,178,95,0.20), transparent 60%), radial-gradient(90% 70% at 50% 120%, rgba(154,134,224,0.35), transparent 60%)",
          color: "#f4ead6",
          fontFamily: "Manrope",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 30,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: "#d9b25f",
          }}
        >
          <span style={{ fontFamily: "Playfair", fontWeight: 700, letterSpacing: 2 }}>{SITE.name}</span>
          <span style={{ color: "#5b6183" }}>·</span>
          <span>игри на карти и маса</span>
        </div>
        <div
          style={{
            fontFamily: "Playfair",
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1,
            color: "#e7c97a",
            marginTop: 18,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 40, color: "#f4ead6", marginTop: 20 }}>{meta}</div>
        <div
          style={{
            width: 220,
            height: 3,
            marginTop: 40,
            background: "linear-gradient(90deg, transparent, #d9b25f, transparent)",
          }}
        />
        <div style={{ fontSize: 30, color: "#9aa0b8", marginTop: 34 }}>
          Играй безплатно в браузъра · срещу приятели и ботове
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Playfair", data: font("playfair-700-cyrillic.woff"), weight: 700, style: "normal" },
        { name: "Playfair", data: font("playfair-700-latin.woff"), weight: 700, style: "normal" },
        { name: "Manrope", data: font("manrope-500-cyrillic.woff"), weight: 500, style: "normal" },
        { name: "Manrope", data: font("manrope-500-latin.woff"), weight: 500, style: "normal" },
      ],
    },
  );
}
