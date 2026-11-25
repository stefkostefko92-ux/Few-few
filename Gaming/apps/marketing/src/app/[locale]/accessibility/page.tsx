import type { Metadata } from "next";
import { LegalArticle } from "../../../components/LegalArticle";
import { alternatesFor } from "../../../lib/seo";
import { ACCESSIBILITY } from "../../../i18n/accessibility";
import type { Locale } from "../../../i18n/locales";
import "../../legal.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const p = ACCESSIBILITY[locale as Locale];
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: alternatesFor(locale as Locale, "/accessibility/"),
  };
}

export default function LocaleAccessibility() {
  return <LegalArticle pageKey="accessibility" />;
}
