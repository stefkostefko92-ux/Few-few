import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Топла „хартиена“ палитра: крем хартия, мастилено кафяво, теракота, мед.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FAF4E8",
          warm: "#F3E9D7",
          deep: "#EADDC5",
        },
        ink: {
          DEFAULT: "#3A2E28",
          soft: "#5C4C43",
          // ≥ 4.5:1 върху paper (#FAF4E8) — WCAG 2.1 AA за нормален текст
          faint: "#6E5A4C",
        },
        tera: {
          DEFAULT: "#C25E3F",
          dark: "#A34A2E",
          light: "#E08963",
          pale: "#F7DFD3",
        },
        med: {
          DEFAULT: "#DE9A32",
          dark: "#B87B1E",
          pale: "#F9EBCF",
        },
        gora: {
          DEFAULT: "#6F7D5C",
          dark: "#55613F",
          pale: "#E6EBDC",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(58, 46, 40, 0.08), 0 12px 32px rgba(58, 46, 40, 0.07)",
        lift: "0 4px 16px rgba(58, 46, 40, 0.12), 0 20px 48px rgba(58, 46, 40, 0.10)",
      },
      borderRadius: {
        blob: "1.75rem",
      },
    },
  },
  plugins: [
    // Вариант `vivid:` — огледало на вградения `dark:`, за „живата“ тема (.vivid на <html>).
    plugin(({ addVariant }) => {
      addVariant("vivid", ".vivid &");
    }),
  ],
};

export default config;
