import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

import { DARK, LIGHT, type ThemeTokens } from "./src/lib/theme";

/**
 * Цветовете НЕ се изписват тук — идват от `src/lib/theme.ts`, където ги гейтва
 * тестът за контраст. Конфигурацията само ги превръща в CSS променливи и в
 * помощни класове на Tailwind, за да няма втори HEX, който може да се разбяга.
 */

const varName = (token: string) => `--c-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const toVars = (tokens: ThemeTokens): Record<string, string> =>
  Object.fromEntries(Object.entries(tokens).map(([token, hex]) => [varName(token), hex]));

const colors = Object.fromEntries(
  Object.keys(DARK).map((token) => [
    token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
    `var(${varName(token)})`,
  ]),
) as Record<string, string>;

const config: Config = {
  // Тъмната тема е по подразбиране (тя е брандът); светлата се включва с
  // клас `.light` върху <html>. Затова НЕ ползваме Tailwind `darkMode`.
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors,
      fontFamily: {
        // Системен стек: нула свалени байтове, нула външни заявки (CSP), нула
        // подскачане на текста. За инструмент, чийто коз е скоростта, това е
        // по-добра сделка от брандов шрифт.
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Ubuntu",
          "Cantarell",
          "Noto Sans",
          "sans-serif",
        ],
        // Техническите стойности (IP, ASN, префикси, MAC) ВИНАГИ са равноширок
        // шрифт — така `1`/`l` и `0`/`O` не се бъркат при преписване.
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)",
      },
      borderRadius: {
        card: "0.875rem",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": { ...toVars(DARK), colorScheme: "dark" },
        ".light": { ...toVars(LIGHT), colorScheme: "light" },
      });
    }),
  ],
};

export default config;
