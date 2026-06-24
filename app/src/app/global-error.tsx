"use client";

// Резервна страница при грешка в основния layout (рядко).
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="bg">
      <body
        style={{
          fontFamily: "system-ui, Arial, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f3",
          color: "#1e293b",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Възникна временен проблем
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#475569" }}>
            Моля, опитайте отново след малко.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.25rem",
              background: "#212f8a",
              color: "#fff",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Опитай отново
          </button>
        </div>
      </body>
    </html>
  );
}
