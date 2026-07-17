import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import { alternatesFor } from "../../lib/seo";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Политика за поверителност",
  description: "Как АСО събира, използва и защитава личните данни (GDPR).",
  alternates: alternatesFor("bg", "/privacy/"),
};

export default function Privacy() {
  return <LegalArticle pageKey="privacy" />;
}
