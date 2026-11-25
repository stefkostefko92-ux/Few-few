// Адресът (slug) на бизнес, подаден през формата „Добавете своя бизнес“ —
// чиста логика (без база), за да се тества.
import { slugify, uniqueSlug } from "@/lib/slug";

/**
 * Статичните пътища под /biznes/ — те имат предимство пред /biznes/[slug],
 * затова бизнес с такъв slug би бил недостъпен („Нова“ → „nova“ → формата
 * вместо обявата). Нов статичен път под src/app/biznes/ се добавя и тук
 * (тест го пази).
 */
export const RESERVED_BUSINESS_SLUGS: readonly string[] = ["nova"];

/** Свободен адрес по името: заетите и запазените получават „-2“, „-3“… */
export function businessSlug(name: string, taken: Iterable<string>): string {
  return uniqueSlug(slugify(name), new Set([...taken, ...RESERVED_BUSINESS_SLUGS]));
}
