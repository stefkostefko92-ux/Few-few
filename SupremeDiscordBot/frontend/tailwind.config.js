/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Supreme Bot palette — carried from the brand logo:
        // royal electric blue + gold over deep cosmic navy.
        cs: {
          black:    "#000000",
          bg:       "#0a0b12",   // base background — cosmic navy (noscript: rgba(10,11,18,0.98))
          surface:  "#12131f",   // cards / panels
          panel:    "#1a1b2a",   // raised / hover surface
          border:   "#4a4c62",   // thin dividers — raised to ≥3:1 for WCAG 1.4.11 (UI component contrast)
          borderHi: "#5a5c74",   // hover / focus border
          text:     "#f0f0eb",   // primary text (cream white)
          muted:    "#aaaaaa",   // secondary text (≈8.5:1)
          dim:      "#9a9a9a",   // tertiary — raised to ≈6:1 so it passes WCAG 1.4.3 for body text
          cyan:     "#33b1ff",   // THE accent — royal electric blue (logo energy/glow)
          cyanDim:  "#1e86d6",   // darker royal blue for hover
          cyanGlow: "rgba(51, 177, 255, 0.15)",
          gold:     "#f0c24c",   // brand gold — the logo's wordmark & armor
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
          50:  "#e6f3ff", 100: "#c2e2ff", 400: "#66c2ff",
          500: "#33b1ff", 600: "#1e86d6", 700: "#155f9c",
          800: "#0d3e66", 900: "#071f33",
        },
        dark: {
          100: "#1a1b2a",  // was #36393f
          200: "#12131f",  // was #2f3136
          300: "#0a0b12",  // was #202225
          400: "#000000",  // was #18191c
        },
        stealth: {
          300: "#66c2ff", 400: "#33b1ff", 500: "#33b1ff",
          600: "#1e86d6", 700: "#155f9c",
        },
        carbon: {
          400: "#2a2b3a", 500: "#1a1b2a", 600: "#12131f",
          700: "#0a0b12", 800: "#000000",
        },
        accent: {
          cyan:   "#33b1ff",
          blue:   "#33b1ff",
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
        "cs-cyan":      "0 0 30px rgba(51, 177, 255, 0.25)",
        "cs-cyan-sm":   "0 0 15px rgba(51, 177, 255, 0.15)",
        "cs-gold":      "0 0 30px rgba(240, 194, 76, 0.25)",
        "cs-gold-sm":   "0 0 15px rgba(240, 194, 76, 0.16)",
        "cs-lift":      "0 4px 20px rgba(0, 0, 0, 0.6)",
        "cs-glow":      "0 -20px 60px rgba(51, 177, 255, 0.1)",
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
