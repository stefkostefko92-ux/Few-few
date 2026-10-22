import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Споделете спомен от Бобов дол",
  description:
    "Разкажете спомен от стария Бобов дол — за мините, училището, празниците, хората. Спомените се публикуват след кратък преглед.",
  path: "/spomeni/nov",
});

export default function NewMemoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
