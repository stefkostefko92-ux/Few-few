import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "../lib/site";

export const dynamic = "force-static";
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ogDir = join(process.cwd(), "src", "og");
const font = (file: string) => readFileSync(join(ogDir, file));

/**
 * Branded OpenGraph / Twitter share card (1200×630), generated at build time
 * (static export). Cyrillic + Latin glyphs are covered by bundled woff fonts;
 * satori falls back across them per glyph. Used for link previews on social
 * and chat — completes the §15 OpenGraph metadata.
 */
export default function OgImage() {
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
          backgroundColor: "#070a18",
          backgroundImage:
            "radial-gradient(60% 55% at 50% 0%, rgba(217,178,95,0.20), transparent 60%), radial-gradient(90% 70% at 50% 120%, rgba(154,134,224,0.35), transparent 60%)",
          color: "#f4ead6",
          fontFamily: "Manrope",
        }}
      >
        <div
          style={{
            fontSize: 34,
            letterSpacing: 14,
            textTransform: "uppercase",
            color: "#d9b25f",
          }}
        >
          Премиум клуб за игри
        </div>
        <div
          style={{
            fontFamily: "Playfair",
            fontSize: 230,
            fontWeight: 700,
            lineHeight: 1,
            color: "#e7c97a",
            marginTop: 8,
          }}
        >
          {SITE.name}
        </div>
        <div style={{ fontSize: 46, color: "#f4ead6", marginTop: 8 }}>{SITE.tagline}</div>
        <div
          style={{
            width: 220,
            height: 3,
            marginTop: 40,
            background: "linear-gradient(90deg, transparent, #d9b25f, transparent)",
          }}
        />
        <div style={{ fontSize: 30, color: "#9aa0b8", marginTop: 36 }}>
          21 игри · 3 езика · безплатно в браузъра
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
