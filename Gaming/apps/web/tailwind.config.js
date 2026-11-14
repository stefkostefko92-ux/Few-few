/** Tailwind theme bound to tokens.css (§3.2). Tokens stay the single source. */

/**
 * Цвят от токен, който приема прозрачност (`bg-felt-800/80`, `border-brass-400/20`).
 * Токените са hex в CSS променливи — без `<alpha-value>` Tailwind 3 мълчаливо НЕ
 * генерира нито един клас с „/NN“ върху тях (измерено: в целия сайт липсваха
 * полупрозрачните рамки и фонове). Без модификатор е 100 % — същият цвят.
 */
const token = (name) => `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          900: token("--felt-900"),
          800: token("--felt-800"),
          700: token("--felt-700"),
          glow: token("--felt-glow"),
        },
        charcoal: { 900: token("--charcoal-900") },
        wood: { 800: token("--wood-800") },
        brass: {
          400: token("--brass-400"),
          300: token("--brass-300"),
          100: token("--brass-100"),
        },
        suit: { red: token("--suit-red"), black: token("--suit-black") },
        cyan: { 400: token("--cyan-400"), 300: token("--cyan-300") },
        violet: { 400: token("--violet-400"), 300: token("--violet-300") },
        ink: {
          100: token("--ink-100"),
          300: token("--ink-300"),
          muted: token("--ink-muted"),
        },
        win: token("--win"),
        loss: token("--loss"),
        vip: token("--vip"),
      },
      fontFamily: {
        display: ["Playfair Display", "PT Serif", "Georgia", "serif"],
        body: ["Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "var(--r-card)",
        panel: "var(--r-panel)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
      transitionTimingFunction: {
        snap: "var(--ease-snap)",
        soft: "var(--ease-soft)",
      },
      transitionDuration: {
        fast: "140ms",
        DEFAULT: "240ms",
        slow: "420ms",
      },
    },
  },
  plugins: [],
};
