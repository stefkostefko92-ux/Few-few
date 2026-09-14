/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Supreme Bot palette — carried from the 2026 brand board:
        // neon lime green + silver over near-black with a green tint
        // (cyberpunk "neon green edition"). Token names are kept (cs-cyan =
        // THE accent) so the whole UI re-skins from these values alone.
        cs: {
          black:    "#000000",
          bg:       "#070a06",   // base background — near-black, green tint
          surface:  "#0d130b",   // cards / panels
          panel:    "#141d10",   // raised / hover surface
          border:   "#4b5a44",   // thin dividers — ≥3:1 for WCAG 1.4.11 (UI component contrast)
          borderHi: "#5d7052",   // hover / focus border
          text:     "#f0f0eb",   // primary text (cream white)
          muted:    "#aaaaaa",   // secondary text (≈8.5:1)
          dim:      "#9a9a9a",   // tertiary — ≈6:1, passes WCAG 1.4.3 for body text
          cyan:     "#8fe600",   // THE accent — neon lime green (logo energy/glow)
          cyanDim:  "#6cb000",   // darker green for hover
          cyanGlow: "rgba(143, 230, 0, 0.15)",
          gold:     "#f0c24c",   // premium gold (tier badges)
          goldDim:  "#c8992f",   // darker gold for hover
          goldGlow: "rgba(240, 194, 76, 0.16)",
        },
        // Semantic
        success:  "#4ade80",
        warning:  "#fbbf24",
        danger:   "#ef4444",
        premium:  "#f0c24c",     // gold (brand-aligned)
        manual:   "#a855f7",     // purple (manual vs Stripe)
        // Backward-compat aliases so existing pages don't break
        discord: {
          50:  "#f2ffd9", 100: "#e3ffb0", 400: "#a8f033",
          500: "#8fe600", 600: "#6cb000", 700: "#4e8000",
          800: "#335500", 900: "#1a2b00",
        },
        dark: {
          100: "#141d10",
          200: "#0d130b",
          300: "#070a06",
          400: "#000000",
        },
        stealth: {
          300: "#a8f033", 400: "#8fe600", 500: "#8fe600",
          600: "#6cb000", 700: "#4e8000",
        },
        carbon: {
          400: "#24301e", 500: "#141d10", 600: "#0d130b",
          700: "#070a06", 800: "#000000",
        },
        accent: {
          cyan:   "#8fe600",
          blue:   "#8fe600",
          purple: "#a855f7",
          gold:   "#f0c24c",
          green:  "#4ade80",
          red:    "#ef4444",
        },
      },
      fontFamily: {
        sans: ['"Inter Tight"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"Space Mono"', '"JetBrains Mono"', "Consolas", "monospace"],
        display: ['"Inter Tight"', "Inter", "sans-serif"],
      },
      letterSpacing: {
        "tight-2": "-0.02em",
        "tight-3": "-0.03em",
        "tight-4": "-0.04em",
      },
      boxShadow: {
        "cs-cyan":      "0 0 30px rgba(143, 230, 0, 0.25)",
        "cs-cyan-sm":   "0 0 15px rgba(143, 230, 0, 0.15)",
        "cs-gold":      "0 0 30px rgba(240, 194, 76, 0.25)",
        "cs-gold-sm":   "0 0 15px rgba(240, 194, 76, 0.16)",
        "cs-lift":      "0 4px 20px rgba(0, 0, 0, 0.6)",
        "cs-glow":      "0 -20px 60px rgba(143, 230, 0, 0.1)",
      },
      animation: {
        "pulse-slow":   "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in":      "fadeIn 0.4s ease-out",
        "slide-up":     "slideUp 0.3s ease-out",
        "scanline":     "scanline 8s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scanline: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};
