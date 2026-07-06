/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // EXACT Carbon Stealth palette from carbonstealth.eu
        cs: {
          black:    "#000000",
          bg:       "#0a0a0e",   // base background (noscript: rgba(10,10,14,0.98))
          surface:  "#12121a",   // cards / panels
          panel:    "#191922",   // raised / hover surface
          border:   "#4a4a5c",   // thin dividers — raised to ≥3:1 for WCAG 1.4.11 (UI component contrast)
          borderHi: "#5a5a6c",   // hover / focus border
          text:     "#f0f0eb",   // primary text (cream white)
          muted:    "#aaaaaa",   // secondary text (≈8.5:1)
          dim:      "#9a9a9a",   // tertiary — raised to ≈6:1 so it passes WCAG 1.4.3 for body text
          cyan:     "#00e5ff",   // THE accent — from theme-color meta
          cyanDim:  "#00a8bf",   // darker cyan for hover
          cyanGlow: "rgba(0, 229, 255, 0.15)",
        },
        // Semantic
        success:  "#4ade80",
        warning:  "#fbbf24",
        danger:   "#ef4444",
        premium:  "#fbbf24",     // gold
        manual:   "#a855f7",     // purple (manual vs Stripe)
        // Backward-compat aliases so existing pages don't break
        discord: {
          50:  "#e0f7fb", 100: "#b3ecf3", 400: "#4dd8ed",
          500: "#00e5ff", 600: "#00a8bf", 700: "#007d8f",
          800: "#005260", 900: "#002d35",
        },
        dark: {
          100: "#191922",  // was #36393f
          200: "#12121a",  // was #2f3136
          300: "#0a0a0e",  // was #202225
          400: "#000000",  // was #18191c
        },
        stealth: {
          300: "#4dd8ed", 400: "#00e5ff", 500: "#00e5ff",
          600: "#00a8bf", 700: "#007d8f",
        },
        carbon: {
          400: "#2a2a36", 500: "#191922", 600: "#12121a",
          700: "#0a0a0e", 800: "#000000",
        },
        accent: {
          cyan:   "#00e5ff",
          purple: "#a855f7",
          gold:   "#fbbf24",
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
        "cs-cyan":      "0 0 30px rgba(0, 229, 255, 0.25)",
        "cs-cyan-sm":   "0 0 15px rgba(0, 229, 255, 0.15)",
        "cs-lift":      "0 4px 20px rgba(0, 0, 0, 0.6)",
        "cs-glow":      "0 -20px 60px rgba(0, 229, 255, 0.1)",
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
