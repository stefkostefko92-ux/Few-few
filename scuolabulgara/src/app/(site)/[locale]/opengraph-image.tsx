import { ImageResponse } from "next/og";

// Branded 1200×630 social card (Open Graph / Twitter). Generated at request time
// so we never ship a binary asset and it always matches the brand colours.
export const runtime = "nodejs";
export const alt = "Qui Bulgaria — Scuola bulgara di Milano";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f7a3d 0%, #0c5e30 100%)",
          color: "#fbf8f1",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Bulgarian tricolour */}
        <div style={{ display: "flex", width: "220px", height: "16px", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#ffffff" }} />
          <div style={{ flex: 1, background: "#00966e" }} />
          <div style={{ flex: 1, background: "#d62612" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: "40px", fontWeight: 600, opacity: 0.85 }}>Qui Bulgaria</div>
          <div style={{ fontSize: "82px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Scuola bulgara di Milano
          </div>
          <div style={{ fontSize: "34px", opacity: 0.85 }}>
            Lingua e cultura bulgara · Milano, Lombardia
          </div>
        </div>

        <div style={{ fontSize: "26px", opacity: 0.75 }}>www.scuolabulgaramilano.it</div>
      </div>
    ),
    { ...size }
  );
}
