import { Sofia_Sans, Sofia_Sans_Extra_Condensed } from "next/font/google";

// Sofia Sans, by the Bulgarian type designer Lasko Dzhurovski: one family, two
// widths. Its Cyrillic follows the Bulgarian letterforms (д, л, ж… drawn the
// way Bulgarian schoolbooks draw them), switched on by lang="bg". Self-hosted at
// build time — no runtime request to Google, so nothing leaves for a third party.
// Only latin + cyrillic are preloaded (Italian and Bulgarian); latin-ext still
// loads on demand for a rare name, and the italic only where a quote needs it.
export const sofia = Sofia_Sans({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
  variable: "--font-sofia",
});

export const sofiaItalic = Sofia_Sans({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  style: "italic",
  display: "swap",
  preload: false,
  variable: "--font-sofia-italic",
});

export const sofiaCondensed = Sofia_Sans_Extra_Condensed({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
  variable: "--font-sofia-xc",
});

export const fontVars = `${sofia.variable} ${sofiaItalic.variable} ${sofiaCondensed.variable}`;
