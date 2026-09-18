import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import { alternatesFor } from "../../lib/seo";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Отговорна игра",
  description: "АСО е социална игра. Съвети за здравословна и балансирана игра.",
  alternates: alternatesFor("bg", "/responsible/"),
};

export default function Responsible() {
  return <LegalArticle pageKey="responsible" />;
}
