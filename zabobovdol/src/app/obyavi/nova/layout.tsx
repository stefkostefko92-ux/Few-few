import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Подай безплатна обява в Бобов дол",
  description:
    "Публикувайте безплатна местна обява в Бобов дол — продажба, търсене, работа, имот или подарък. Обявата излиза след кратък преглед, за да няма спам.",
  path: "/obyavi/nova",
});

export default function NewListingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
