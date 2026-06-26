import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Политика за бисквитки",
  description: "Как АСО използва бисквитки и подобни технологии.",
  alternates: { canonical: "/cookies/" },
};

export default function Cookies() {
  return <LegalArticle pageKey="cookies" />;
}
