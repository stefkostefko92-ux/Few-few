import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Нова обява за споделено пътуване от Бобов дол",
  description:
    "Пътувате редовно по даден маршрут? Предложете място в колата или потърсете спътници от Бобов дол и споделете разходите. Обявата излиза след кратък преглед.",
  path: "/spodeleno-patuvane/nova",
});

export default function NewRideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
