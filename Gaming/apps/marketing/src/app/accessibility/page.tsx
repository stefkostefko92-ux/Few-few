import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import { alternatesFor } from "../../lib/seo";
import { ACCESSIBILITY } from "../../i18n/accessibility";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: ACCESSIBILITY.bg.metaTitle,
  description: ACCESSIBILITY.bg.metaDescription,
  alternates: alternatesFor("bg", "/accessibility/"),
};

export default function Accessibility() {
  return <LegalArticle pageKey="accessibility" />;
}
