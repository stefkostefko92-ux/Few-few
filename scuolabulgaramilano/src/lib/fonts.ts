import { Fraunces, Inter, Caveat } from "next/font/google";

// Self-hosted at build time (no runtime request to Google → GDPR-friendly and
// faster). Exposed as CSS variables consumed by the design system.
export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-fraunces",
});

export const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const caveat = Caveat({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-caveat",
});

export const fontVars = `${inter.variable} ${fraunces.variable} ${caveat.variable}`;
