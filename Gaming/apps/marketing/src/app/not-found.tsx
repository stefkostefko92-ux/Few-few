import type { Metadata } from "next";
import { SITE } from "../lib/site";
import { NotFoundBody } from "./NotFoundBody";

// Собствено заглавие и noindex: иначе 404 носеше заглавието на началната страница
// и търсачката можеше да я индексира като дубликат.
export const metadata: Metadata = {
  title: { absolute: `Страницата не е намерена — ${SITE.name}` },
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundBody />;
}
