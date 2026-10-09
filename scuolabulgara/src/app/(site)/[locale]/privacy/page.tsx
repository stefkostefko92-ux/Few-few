import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, LOCALE_META, type Locale } from "@/lib/i18n";
import { getOne } from "@/lib/content";
import LegalPage from "@/components/LegalPage";

export const dynamic = "force-dynamic";
const KIND = "privacy" as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "it") as Locale;
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const doc = await getOne(locale, "legal_privacy");
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_META[l].htmlLang] = `${base}/${l}/${KIND}`;
  languages["x-default"] = `${base}/it/${KIND}`;
  return {
    title: doc.title,
    description: doc.intro,
    alternates: { canonical: `${base}/${locale}/${KIND}`, languages },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  return <LegalPage locale={raw} kind={KIND} />;
}
