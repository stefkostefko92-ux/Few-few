import { ImageResponse } from "next/og";

// OG изображение на платформата (генерира се при заявка, без външни файлове).
// Важи за всички страници без собствено opengraph-image.
export const runtime = "nodejs";
export const alt = "Carbon Stealth — конструктор на сайтове на български";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #020617 0%, #1e1b4b 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#a5b4fc" }}>
          Carbon Stealth
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          Професионален сайт на български — без код
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: "#cbd5e1",
          }}
        >
          Готови шаблони · Собствен домейн · AI помощник · 3 езика
        </div>
      </div>
    ),
    size,
  );
}
