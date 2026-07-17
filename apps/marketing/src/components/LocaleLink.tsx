"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "../i18n/I18nProvider";
import { localeHref } from "../i18n/locales";

type Props = ComponentProps<typeof Link>;

/**
 * A drop-in <Link> that keeps the visitor inside their locale: root-relative
 * hrefs ("/games/") are auto-prefixed with the active locale ("/en/games/"),
 * so a single import swap localises every internal link in a component without
 * touching the hrefs. Absolute/external hrefs pass through untouched.
 */
export function LocaleLink({ href, ...rest }: Props) {
  const locale = useLocale();
  const h = typeof href === "string" && href.startsWith("/") ? localeHref(locale, href) : href;
  return <Link href={h} {...rest} />;
}
