import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import { alternatesFor } from "../../lib/seo";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Общи условия",
  description: "Общи условия за ползване на АСО — премиум браузърен портал за игри на карти и маса.",
  alternates: alternatesFor("bg", "/terms/"),
};

export default function Terms() {
  return <LegalArticle pageKey="terms" />;
}
