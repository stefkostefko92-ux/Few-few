"use client";

// Резервна страница при грешка в основния layout (рядко). Без Tailwind и без
// шрифтовете на сайта — само вградени стилове, които винаги работят.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="bg">
      <head>
        <title>Възникна временен проблем · За Бобов дол</title>
        <meta name="robots" content="noindex" />
      </head>
      <body
        style={{
          fontFamily: "system-ui, Arial, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f3",
          color: "#0f172a",
          textAlign: "center",
          padding: "2rem",
          margin: 0,
          fontSize: "1.125rem",
          lineHeight: 1.6,
        }}
      >
        <main>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            Възникна временен проблем
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#334155" }}>
            Моля, опитайте отново след малко. При спешност — 112.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.25rem",
              minHeight: "48px",
              background: "#212f8a",
              color: "#fff",
              border: 0,
              borderRadius: "0.75rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Опитайте отново
          </button>
        </main>
      </body>
    </html>
  );
}
