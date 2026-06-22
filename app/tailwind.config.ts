import type { Config } from "tailwindcss";

// Палитра за Дупница: дълбоко зелено (основен — Рила, природата около града),
// топло злато (акцент) и червено (спешни/важни сигнали), на топъл „хартиен" фон.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f1",
          100: "#d6ecdd",
          200: "#aedcbf",
          300: "#7cc599",
          400: "#48a673",
          500: "#258a57",
          600: "#176f45",
          700: "#125939",
          800: "#10472f",
          900: "#0d3b28",
        },
        gold: {
          50: "#fff8e6",
          100: "#ffedbf",
          200: "#ffdd85",
          300: "#fbc94a",
          400: "#f3b01f",
          500: "#e09600",
          600: "#bd7a00",
          700: "#965d00",
          800: "#7a4b06",
          900: "#683f0c",
        },
        crimson: {
          50: "#fdeced",
          100: "#fbd5d6",
          200: "#f5abad",
          300: "#ee7e81",
          400: "#e34f53",
          500: "#d11f1f",
          600: "#b51818",
          700: "#921616",
          800: "#7a1818",
          900: "#661818",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        serif: ["var(--font-serif)", "Georgia", "Cambria", "serif"],
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
