import { notFound } from 'next/navigation';

/**
 * Хваща всеки непознат адрес под езиковия префикс и вика `notFound()`, за да
 * се рендира НАШАТА 404 (`[locale]/not-found.tsx`) вътре в езиковия layout.
 *
 * Без този файл `/bg/nyama-takava-stranica` не съвпадаше с никой маршрут и Next
 * показваше вградената си бяла страница на английски — без `<html lang>`
 * (axe: html-has-lang, serious), без хедър и без път обратно към сайта.
 * Измерено в Chromium на 1280 и 390 px.
 *
 * Next подрежда маршрутите по специфичност: статичните и динамичните сегменти
 * (`servers/[slug]`, `news/[slug]` …) печелят пред catch-all, тоест това хваща
 * САМО онова, което никой друг маршрут не иска. Статусът остава 404.
 */
export default function CatchAll(): never {
  notFound();
}
