import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // „Касата“ — тъмна, топла палитра за дълги смени пред екрана
        // светла тема: скалата е семантична — 950=фон, 100=основен текст
        ink: {
          950: "#eef1f6",
          900: "#ffffff",
          850: "#f2f5fa",
          800: "#e4e9f2",
          700: "#d3dae6",
          600: "#a9b4c8",
          500: "#8391a9",
          400: "#5c6b85",
          300: "#45536c",
          200: "#33405c",
          100: "#17203a",
        },
        brand: {
          400: "#ffd166",
          500: "#fcbf49",
          600: "#f5a623",
          700: "#d98e0b",
        },
        mint: {
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
        coral: {
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
        },
        sky2: {
          400: "#38bdf8",
          500: "#0ea5e9",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,32,58,.06), 0 10px 30px -12px rgba(23,32,58,.18)",
        pop: "0 18px 50px -16px rgba(23,32,58,.28)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
      },
      animation: {
        "fade-up": "fade-up .25s ease-out both",
        "scale-in": "scale-in .18s ease-out both",
        blink: "blink 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
