/** Tailwind theme bound to tokens.css (§3.2). Tokens stay the single source. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          900: "var(--felt-900)",
          800: "var(--felt-800)",
          700: "var(--felt-700)",
          glow: "var(--felt-glow)",
        },
        charcoal: { 900: "var(--charcoal-900)" },
        wood: { 800: "var(--wood-800)" },
        brass: {
          400: "var(--brass-400)",
          300: "var(--brass-300)",
          100: "var(--brass-100)",
        },
        suit: { red: "var(--suit-red)", black: "var(--suit-black)" },
        cyan: { 400: "var(--cyan-400)", 300: "var(--cyan-300)" },
        violet: { 400: "var(--violet-400)", 300: "var(--violet-300)" },
        ink: {
          100: "var(--ink-100)",
          300: "var(--ink-300)",
          muted: "var(--ink-muted)",
        },
        win: "var(--win)",
        loss: "var(--loss)",
        vip: "var(--vip)",
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
