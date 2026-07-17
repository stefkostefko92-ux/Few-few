import type { Metadata } from "next";
import { LegalArticle } from "../../../components/LegalArticle";
import { alternatesFor } from "../../../lib/seo";
import { LEGAL } from "../../../i18n/legal";
import type { Locale } from "../../../i18n/locales";
import "../../legal.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const p = LEGAL[locale as Locale].terms;
  return { title: p.metaTitle, description: p.metaDescription, alternates: alternatesFor(locale as Locale, "/terms/") };
}

export default function LocaleTerms() {
  return <LegalArticle pageKey="terms" />;
}
