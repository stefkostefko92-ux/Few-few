import type { Metadata } from "next";
import { LegalArticle } from "../../components/LegalArticle";
import "../legal.css";

// Metadata stays in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Отговорна игра",
  description: "АСО е социална игра. Съвети за здравословна и балансирана игра.",
  alternates: { canonical: "/responsible/" },
};

export default function Responsible() {
  return <LegalArticle pageKey="responsible" />;
}
