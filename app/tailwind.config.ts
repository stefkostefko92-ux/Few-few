import type { Config } from "tailwindcss";

// Цветовете са изведени от герба на Бобов дол (базовият проект):
// тъмносиньо (основен), златисто/амбър и червено (акценти), бяло.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Основен — тъмносиньото от долното поле на герба.
        brand: {
          50: "#eef1fb",
          100: "#d9e0f6",
          200: "#b6c4ec",
          300: "#8b9fe0",
          400: "#5e76d2",
          500: "#3a52c0",
          600: "#2a3da6",
          700: "#212f8a",
          800: "#1a2575",
          900: "#141b57",
        },
        // Акцент — златистото/амбър от миньорските символи и житото.
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
        // Акцент — червеното от горната лента на герба.
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
