import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Споделете снимка на Бобов дол",
  description:
    "Имате хубава снимка на Бобов дол — стара или нова? Изпратете я и след преглед ще я покажем в галерията с вашето име като автор.",
  path: "/galeriya/nova",
});

export default function NewPhotoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
